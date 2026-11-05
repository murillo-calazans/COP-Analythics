const IndicatorEngine = {

    LIMITE_DIAS_RECORRENCIA: 90,
    LIMITE_QTD_RECORRENCIA: 2,

    ASSUNTO_CANCELAMENTO: "CANCELAMENTO (350)",

    NOME_EVENTO_FECHAMENTO: "Fechamento",
    NOME_EVENTO_REABERTURA: "Reabertura",
    NOME_EVENTO_REAGENDAMENTO: "Reagendar",
    NOME_EVENTO_AGENDAMENTO: "Agendamento",

    STATUS_DESLOCAMENTO: "Deslocamento",
    STATUS_EM_EXECUCAO: "Execução",
    STATUS_FINALIZADA: "Finalizada",
    STATUS_AGENDADA: "Agendada",

    STATUS_AGUARDANDO_AGENDAMENTO: "Aguardando agendamento",

    nomeResponsavelFechamento(movFechamento) {
        if (!movFechamento) return null;
        const { colaboradorResponsavel, operador } = movFechamento;

        if (colaboradorResponsavel !== null && colaboradorResponsavel !== undefined && colaboradorResponsavel !== "") {
            const linha = this.encontrarLinhaReferencia(APP.referencias.colaboradoresResponsaveis, colaboradorResponsavel);
            const colunaReal = linha ? encontrarColuna(linha, CONFIG_BASE.colaboradoresResponsaveis.nome) : null;
            if (colunaReal) return linha[colunaReal];
        }
        return AuditEngine.resolverReferencia(APP.referencias.operadores, operador, CONFIG_BASE.operadores.nome);
    },

    encontrarLinhaReferencia(mapa, codigo) {
        if (codigo === null || codigo === undefined || codigo === "") return null;
        return mapa.get(codigo) ?? mapa.get(Number(codigo)) ?? mapa.get(String(codigo)) ?? null;
    },

    operadorPertenceAoFiltroSetor(codigoOperador) {
        const setoresFiltro = APP.filtrosGlobais?.setores;
        if (!setoresFiltro || setoresFiltro.length === 0) return true;
        if (codigoOperador === null || codigoOperador === undefined) return false;

        const setor = AuditEngine.resolverReferencia(
            APP.referencias.operadores, codigoOperador, CONFIG_BASE.operadores.setor
        );

        const alvo = setoresFiltro.map(normalizarTexto);
        return alvo.includes(normalizarTexto(setor ?? ""));
    },

    dataEfetivaRecorrencia(ordem, analise) {
        return analise.get(ordem.id)?.ultimoFechamento?.data ?? ordem.dataAbertura;
    },

    calcularRecorrencia(ordens) {

        this.limparAlertasRecorrencia(ordens);

        const analise = this.analisarEventosDeTodas(ordens);
        const dataReferencia = this.encontrarDataMaisRecente(ordens);
        const porLogin = this.agruparPorLogin(ordens, analise);
        const todasPorLogin = this.agruparTodasPorLogin(ordens);
        const recorrentes = new Map();

        for (const [login, listaOrdens] of porLogin) {
            const recentes = listaOrdens.filter(ordem =>
                this.dentroDoLimite(this.dataEfetivaRecorrencia(ordem, analise), dataReferencia)
            );

            if (recentes.length < this.LIMITE_QTD_RECORRENCIA) continue;

            recorrentes.set(login, {
                login,
                cliente: listaOrdens[0].cliente,
                cidade: listaOrdens[0].cidade,
                totalOS: recentes.length,
                ordens: recentes.map(ordem => ordem.id),
                cancelado: false,
                ordemCancelamento: null,
                ultimaOrdemAntesCancelamento: null
            });

            for (const ordem of recentes) {
                this.marcarAlertaRecorrencia(ordem, recentes.length);
            }
        }

        for (const [login, todasOrdensCliente] of todasPorLogin) {
            const cancelamento = this.encontrarCancelamentoCliente(todasOrdensCliente);
            if (!cancelamento) continue;

            const listaOrdens = porLogin.get(login) ?? [];
            const recentes = listaOrdens.filter(ordem =>
                this.dentroDoLimite(this.dataEfetivaRecorrencia(ordem, analise), dataReferencia)
            );

            recorrentes.set(login, {
                login,
                cliente: todasOrdensCliente[0]?.cliente ?? null,
                cidade: todasOrdensCliente[0]?.cidade ?? null,
                totalOS: recentes.length,
                ordens: recentes.map(ordem => ordem.id),
                cancelado: true,
                ordemCancelamento: cancelamento.ordemCancelamento,
                ultimaOrdemAntesCancelamento: cancelamento.ultimaOrdemAntes
            });

            if (recentes.length >= this.LIMITE_QTD_RECORRENCIA) {
                for (const ordem of recentes) {
                    this.marcarAlertaRecorrencia(ordem, recentes.length);
                }
            }
        }

        return recorrentes;
    },

    encontrarCancelamentoCliente(todasOrdensCliente) {
        const alvo = normalizarTexto(this.ASSUNTO_CANCELAMENTO);
        const incluidos = APP.configuracoes.assuntosIncluidosCancelamento ?? new Set();

        const cancelamentos = todasOrdensCliente
            .filter(ordem => ordem.assunto && normalizarTexto(ordem.assunto) === alvo && ordem.dataAbertura)
            .sort((a, b) => b.dataAbertura - a.dataAbertura);

        const ordemCancelamento = cancelamentos[0];
        if (!ordemCancelamento) return null;

        const anteriores = todasOrdensCliente
            .filter(ordem =>
                ordem.id !== ordemCancelamento.id &&
                ordem.dataAbertura &&
                ordem.dataAbertura < ordemCancelamento.dataAbertura &&
                ordem.assunto && incluidos.has(normalizarTexto(ordem.assunto))
            )
            .sort((a, b) => b.dataAbertura - a.dataAbertura);

        return {
            ordemCancelamento: { id: ordemCancelamento.id, dataAbertura: ordemCancelamento.dataAbertura },
            ultimaOrdemAntes: anteriores[0]
                ? { id: anteriores[0].id, assunto: anteriores[0].assunto, dataAbertura: anteriores[0].dataAbertura }
                : null
        };
    },

    detalharRecorrenciaCliente(registro, ordens) {
        const analise = this.analisarEventosDeTodas(ordens);

        const ordensDetalhes = registro.ordens.map(id => {
            const ordem = ordens.get(id) ?? ordens.get(Number(id)) ?? ordens.get(String(id));

            if (!ordem) {
                return { id, assunto: null, tecnico: null, dataAbertura: null };
            }

            const tecnico = this.nomeResponsavelFechamento(analise.get(ordem.id)?.ultimoFechamento);

            return {
                id: ordem.id,
                assunto: ordem.assunto,
                tecnico,

                dataAbertura: this.dataEfetivaRecorrencia(ordem, analise)
            };
        });

        const tecnicosEnvolvidos = [...new Set(ordensDetalhes.map(d => d.tecnico).filter(Boolean))];

        return {
            login: registro.login,
            cliente: registro.cliente,
            totalOS: registro.totalOS,
            ordensDetalhes,
            tecnicosEnvolvidos,
            porMes: this.contarOSPorMes(ordensDetalhes),
            cancelado: registro.cancelado ?? false,
            ordemCancelamento: registro.ordemCancelamento ?? null,
            ultimaOrdemAntesCancelamento: registro.ultimaOrdemAntesCancelamento ?? null
        };
    },

    NOMES_MES_COMPLETO: [
        "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
        "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
    ],

    contarOSPorMes(ordensDetalhes) {
        const porMes = new Map();

        for (const d of ordensDetalhes) {
            if (!d.dataAbertura) continue;

            const chave = `${d.dataAbertura.getFullYear()}-${String(d.dataAbertura.getMonth()).padStart(2, "0")}`;
            if (!porMes.has(chave)) {
                porMes.set(chave, {
                    rotulo: this.NOMES_MES_COMPLETO[d.dataAbertura.getMonth()],
                    ano: d.dataAbertura.getFullYear(),
                    quantidade: 0
                });
            }
            porMes.get(chave).quantidade++;
        }

        return [...porMes.entries()]
            .sort((a, b) => b[0].localeCompare(a[0]))
            .map(([, valor]) => valor);
    },

    calcularFunilAssuntos(ordens) {
        const config = APP.configuracoes.funilAssuntos ?? { origem: [], destino: [] };

        if (config.origem.length === 0 || config.destino.length === 0) {
            return { totalClientes: 0, ocorrencias: [] };
        }

        const analise = this.analisarEventosDeTodas(ordens);
        const origemNormalizada = config.origem.map(normalizarTexto);
        const destinoNormalizado = config.destino.map(normalizarTexto);

        const porLogin = new Map();
        for (const ordem of ordens.values()) {
            if (!ordem.login) continue;
            if (!porLogin.has(ordem.login)) porLogin.set(ordem.login, []);
            porLogin.get(ordem.login).push(ordem);
        }

        const ocorrencias = [];
        const clientesAfetados = new Set();

        for (const [login, listaOrdens] of porLogin) {
            const ordenadas = [...listaOrdens].sort((a, b) => (a.dataAbertura ?? 0) - (b.dataAbertura ?? 0));

            for (let i = 0; i < ordenadas.length; i++) {
                const origem = ordenadas[i];
                if (!origem.assunto || !origemNormalizada.includes(normalizarTexto(origem.assunto))) continue;

                const dataBase = analise.get(origem.id)?.ultimoFechamento?.data ?? origem.dataAbertura;
                if (!dataBase) continue;

                for (let j = i + 1; j < ordenadas.length; j++) {
                    const destino = ordenadas[j];
                    if (!destino.assunto || !destinoNormalizado.includes(normalizarTexto(destino.assunto))) continue;
                    if (!destino.dataAbertura) continue;
                    if (!this.dentroDoLimite(dataBase, destino.dataAbertura)) continue;

                    ocorrencias.push({
                        login,
                        cliente: origem.cliente,
                        ordemOrigemId: origem.id,
                        assuntoOrigem: origem.assunto,
                        ordemDestinoId: destino.id,
                        assuntoDestino: destino.assunto
                    });
                    clientesAfetados.add(login);
                    break;
                }
            }
        }

        return { totalClientes: clientesAfetados.size, ocorrencias };
    },

    agruparPorLogin(ordens, analise) {
        const porLogin = new Map();

        const assuntosIncluidos = APP.configuracoes.assuntosIncluidos ?? new Set();

        for (const ordem of ordens.values()) {
            if (!ordem.login) continue;
            if (!ordem.assunto || !assuntosIncluidos.has(normalizarTexto(ordem.assunto))) continue;

            const info = analise.get(ordem.id);
            if (this.diagnosticoExcluidoDaRecorrencia(info?.ultimoFechamento)) continue;

            if (!porLogin.has(ordem.login)) {
                porLogin.set(ordem.login, []);
            }
            porLogin.get(ordem.login).push(ordem);
        }

        return porLogin;
    },

    agruparTodasPorLogin(ordens) {
        const porLogin = new Map();

        for (const ordem of ordens.values()) {
            if (!ordem.login) continue;

            if (!porLogin.has(ordem.login)) {
                porLogin.set(ordem.login, []);
            }
            porLogin.get(ordem.login).push(ordem);
        }

        return porLogin;
    },

    encontrarDataMaisRecente(ordens) {
        let maisRecente = null;

        for (const ordem of ordens.values()) {
            if (ordem.dataAbertura && (!maisRecente || ordem.dataAbertura > maisRecente)) {
                maisRecente = ordem.dataAbertura;
            }
            if (ordem.dataFechamento && (!maisRecente || ordem.dataFechamento > maisRecente)) {
                maisRecente = ordem.dataFechamento;
            }
        }

        return maisRecente ?? new Date();
    },

    dentroDoLimite(data, dataReferencia) {
        if (!data) return false;
        const dias = (dataReferencia - data) / 86400000;
        return dias >= 0 && dias <= this.LIMITE_DIAS_RECORRENCIA;
    },

    marcarAlertaRecorrencia(ordem, totalOS) {
        ordem.alertas.push({
            tipo: "recorrencia",
            mensagem: `Cliente com ${totalOS} OS nos últimos ${this.LIMITE_DIAS_RECORRENCIA} dias.`
        });
    },

    limparAlertasRecorrencia(ordens) {
        for (const ordem of ordens.values()) {
            ordem.alertas = ordem.alertas.filter(alerta => alerta.tipo !== "recorrencia");
        }
    },

    calcularPainelDashboard(ordens) {
        const analise = this.analisarEventosDeTodas(ordens);

        return {
            totalOS: ordens.size,
            totalTecnicos: this.contarTecnicosAtivos(ordens),
            totalFinalizadas: this.contarFinalizadas(analise),
            tmsHoras: this.calcularTMS(ordens, analise),
            tmaHoras: this.calcularTMA(ordens, analise),
            tmrHoras: this.calcularTMR(ordens, analise),
            tmeHoras: this.calcularTME(ordens, analise),
            indiceReabertura: this.calcularIndiceReabertura(analise),
            indiceReagendamento: this.calcularIndiceReagendamento(analise),
            motivosReagendamento: this.calcularMotivosReagendamento(ordens),
            porAssunto: this.calcularContagemPorAssunto(ordens),
            diagnosticosMaisUsados: this.calcularDiagnosticosMaisUsados(ordens, analise),
            rankingTecnicos: this.calcularRankingTecnicos(analise),
            recorrenciaPorTecnico: this.calcularRecorrenciaPorTecnico(ordens),
            soloVsDupla: this.calcularSoloVsDupla(ordens, analise),
            deslocamentosAbandonados: this.calcularDeslocamentosAbandonados(ordens)
        };
    },

    analisarEventosDeTodas(ordens) {
        const analise = new Map();
        for (const ordem of ordens.values()) {
            analise.set(ordem.id, this.analisarEventosOS(ordem));
        }
        return analise;
    },

    mesmoDia(a, b) {
        return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    },

    analisarEventosOS(ordem) {
        const alvoFechamento = normalizarTexto(this.NOME_EVENTO_FECHAMENTO);
        const alvoReabertura = normalizarTexto(this.NOME_EVENTO_REABERTURA);
        const alvoReagendamento = normalizarTexto(this.NOME_EVENTO_REAGENDAMENTO);
        const alvoAgendamentoEvento = normalizarTexto(this.NOME_EVENTO_AGENDAMENTO);

        const alvoStatusDeslocamento = normalizarTexto(this.STATUS_DESLOCAMENTO);
        const alvoStatusExecucao = normalizarTexto(this.STATUS_EM_EXECUCAO);
        const alvoStatusFinalizada = normalizarTexto(this.STATUS_FINALIZADA);
        const alvoStatusAgendada = normalizarTexto(this.STATUS_AGENDADA);
        const alvoStatusAguardandoAgendamento = normalizarTexto(this.STATUS_AGUARDANDO_AGENDAMENTO);

        let ultimoFechamento = null;

        let primeiroFechamento = null;
        let ultimaReabertura = null;

        let fechamentoAntesDaUltimaReabertura = null;
        let ultimoEncerramento = null;
        let primeiroAgendamento = null;
        let temReabertura = false;
        let temReagendamento = false;

        const segmentosSolucao = [];
        const segmentosAtendimento = [];
        const deslocamentosAbandonados = [];

        const deslocamentoAbertoPorOperador = new Map();
        const execucaoAbertaPorOperador = new Map();

        for (const mov of ordem.movimentacoes) {
            const statusNormalizado = normalizarTexto(mov.status ?? "");
            let nomeEventoNormalizado = "";

            if (mov.evento !== null && mov.evento !== undefined) {
                const nomeEvento = AuditEngine.resolverReferencia(
                    APP.referencias.eventos, mov.evento, CONFIG_BASE.eventos.nome
                );
                nomeEventoNormalizado = normalizarTexto(nomeEvento ?? "");

                const ehFechamento = nomeEventoNormalizado === alvoFechamento;
                const ehReagendamento = nomeEventoNormalizado === alvoReagendamento;

                if (ehFechamento) {
                    if (!ultimoFechamento || (mov.data && ultimoFechamento.data && mov.data > ultimoFechamento.data)) {
                        ultimoFechamento = mov;
                    }
                    if (!primeiroFechamento || (mov.data && primeiroFechamento.data && mov.data < primeiroFechamento.data)) {
                        primeiroFechamento = mov;
                    }
                }
                if (ehFechamento || ehReagendamento) {
                    if (!ultimoEncerramento || (mov.data && ultimoEncerramento.data && mov.data > ultimoEncerramento.data)) {
                        ultimoEncerramento = mov;
                    }
                }
                if (nomeEventoNormalizado === alvoReabertura) {
                    temReabertura = true;
                    if (!ultimaReabertura || (mov.data && ultimaReabertura.data && mov.data > ultimaReabertura.data)) {
                        ultimaReabertura = mov;

                        fechamentoAntesDaUltimaReabertura = ultimoFechamento;
                    }
                }
                if (ehReagendamento) temReagendamento = true;
            }

            if (statusNormalizado === alvoStatusAgendada) {
                if (!primeiroAgendamento || (mov.data && primeiroAgendamento.data && mov.data < primeiroAgendamento.data)) {
                    primeiroAgendamento = mov;
                }

                if (nomeEventoNormalizado === alvoAgendamentoEvento) {
                    for (const [operadorAberto, movAberto] of deslocamentoAbertoPorOperador) {
                        deslocamentosAbandonados.push({ operador: operadorAberto, data: movAberto.data, tipo: "deslocamento" });
                    }
                    for (const [operadorAberto, movAberto] of execucaoAbertaPorOperador) {
                        deslocamentosAbandonados.push({ operador: operadorAberto, data: movAberto.data, tipo: "execucao" });
                    }
                    deslocamentoAbertoPorOperador.clear();
                    execucaoAbertaPorOperador.clear();
                }
            }

            if (mov.operador !== null && mov.operador !== undefined) {
                if (statusNormalizado === alvoStatusDeslocamento) {
                    deslocamentoAbertoPorOperador.set(mov.operador, mov);
                }
                if (statusNormalizado === alvoStatusExecucao) {
                    execucaoAbertaPorOperador.set(mov.operador, mov);
                }

                if (statusNormalizado === alvoStatusFinalizada) {
                    const deslocAberto = deslocamentoAbertoPorOperador.get(mov.operador);
                    if (deslocAberto?.data && mov.data && mov.data >= deslocAberto.data && this.mesmoDia(deslocAberto.data, mov.data)) {
                        segmentosSolucao.push({ operador: mov.operador, inicio: deslocAberto.data, fim: mov.data });
                    }

                    const execAberta = execucaoAbertaPorOperador.get(mov.operador);
                    if (execAberta?.data && mov.data && mov.data >= execAberta.data && this.mesmoDia(execAberta.data, mov.data)) {
                        segmentosAtendimento.push({ operador: mov.operador, inicio: execAberta.data, fim: mov.data });
                    }
                }
            }

            if (statusNormalizado === alvoStatusFinalizada) {

                deslocamentoAbertoPorOperador.clear();
                execucaoAbertaPorOperador.clear();
            }

            if (statusNormalizado === alvoStatusAguardandoAgendamento) {
                deslocamentoAbertoPorOperador.clear();
                execucaoAbertaPorOperador.clear();
            }
        }

        const excluidoDoTempo = this.diagnosticoExcluidoDoTempo(ultimoFechamento);

        const mensagemParaClassificar = [fechamentoAntesDaUltimaReabertura?.mensagem, ultimaReabertura?.mensagem]
            .filter(Boolean)
            .join(" ");
        const motivoReabertura = (temReabertura && ultimaReabertura)
            ? classificarMotivoReabertura(mensagemParaClassificar)
            : null;

        const fechamentoEfetivo = escolherFechamentoEfetivo(motivoReabertura, { primeiroFechamento, ultimoFechamento, ultimaReabertura });

        return {
            ultimoFechamento, primeiroFechamento, fechamentoEfetivo,
            motivoReabertura, mensagemReabertura: ultimaReabertura?.mensagem ?? null,

            operadorReabertura: ultimaReabertura?.operador ?? null,
            ultimoEncerramento, primeiroAgendamento,
            temReabertura, temReagendamento, segmentosSolucao, segmentosAtendimento,
            deslocamentosAbandonados, excluidoDoTempo
        };
    },

    diagnosticoExcluidoDoTempo(movFechamento) {
        if (!movFechamento) return false;

        const excluidos = APP.configuracoes.diagnosticosExcluidosTempo;
        if (!excluidos || excluidos.size === 0) return false;

        const nome = AuditEngine.resolverReferencia(
            APP.referencias.diagnosticos, movFechamento.diagnostico, CONFIG_BASE.diagnosticos.nome
        );
        if (!nome) return false;

        return excluidos.has(normalizarTexto(nome));
    },

    diagnosticoExcluidoDaRecorrencia(movFechamento) {
        if (!movFechamento) return false;

        const excluidos = APP.configuracoes.diagnosticosExcluidosRecorrencia;
        if (!excluidos || excluidos.size === 0) return false;

        const nome = AuditEngine.resolverReferencia(
            APP.referencias.diagnosticos, movFechamento.diagnostico, CONFIG_BASE.diagnosticos.nome
        );
        if (!nome) return false;

        return excluidos.has(normalizarTexto(nome));
    },

    somarHorasSegmentos(segmentos) {
        if (!segmentos || segmentos.length === 0) return null;
        let total = 0;
        for (const seg of segmentos) {
            total += (seg.fim - seg.inicio) / 3600000;
        }
        return total;
    },

    agruparSegmentosPorOperador(segmentos) {
        const porOperador = new Map();
        for (const seg of segmentos) {
            if (seg.operador === null || seg.operador === undefined) continue;
            const horas = (seg.fim - seg.inicio) / 3600000;
            porOperador.set(seg.operador, (porOperador.get(seg.operador) ?? 0) + horas);
        }
        return porOperador;
    },

    contarFinalizadas(analise) {
        let total = 0;
        for (const info of analise.values()) {
            if (info.ultimoFechamento) total++;
        }
        return total;
    },

    calcularTMS(ordens, analise) {
        let somaHoras = 0;
        let contagem = 0;

        for (const ordem of ordens.values()) {
            const info = analise.get(ordem.id);
            if (!info || info.excluidoDoTempo) continue;

            const horas = this.somarHorasSegmentos(info.segmentosSolucao);
            if (horas === null) continue;

            somaHoras += horas;
            contagem++;
        }

        return contagem > 0 ? somaHoras / contagem : null;
    },

    calcularTMA(ordens, analise) {
        let somaHoras = 0;
        let contagem = 0;

        for (const ordem of ordens.values()) {
            const info = analise.get(ordem.id);
            if (!info || info.excluidoDoTempo) continue;

            const horas = this.somarHorasSegmentos(info.segmentosAtendimento);
            if (horas === null) continue;

            somaHoras += horas;
            contagem++;
        }

        return contagem > 0 ? somaHoras / contagem : null;
    },

    calcularTMR(ordens, analise) {
        let somaHoras = 0;
        let contagem = 0;

        for (const ordem of ordens.values()) {
            const info = analise.get(ordem.id);
            if (!ordem.dataAbertura || !info?.primeiroAgendamento?.data) continue;

            const horas = (info.primeiroAgendamento.data - ordem.dataAbertura) / 3600000;
            if (horas < 0) continue;

            somaHoras += horas;
            contagem++;
        }

        return contagem > 0 ? somaHoras / contagem : null;
    },

    calcularTME(ordens, analise) {
        let somaHoras = 0;
        let contagem = 0;

        for (const ordem of ordens.values()) {
            const info = analise.get(ordem.id);
            if (!ordem.dataAbertura || !info?.fechamentoEfetivo?.data) continue;

            const horas = (info.fechamentoEfetivo.data - ordem.dataAbertura) / 3600000;
            if (horas < 0) continue;

            somaHoras += horas;
            contagem++;
        }

        return contagem > 0 ? somaHoras / contagem : null;
    },

    calcularIndiceReabertura(analise) {
        let totalFinalizadas = 0;
        let totalReabertas = 0;

        for (const info of analise.values()) {
            if (!info.ultimoFechamento) continue;

            totalFinalizadas++;
            if (info.temReabertura) totalReabertas++;
        }

        return {
            totalFinalizadas,
            totalReabertas,
            percentual: totalFinalizadas > 0 ? (totalReabertas / totalFinalizadas) * 100 : 0
        };
    },

    calcularIndiceReagendamento(analise) {
        let totalEncerradas = 0;
        let totalReagendadas = 0;

        for (const info of analise.values()) {
            if (!info.ultimoEncerramento) continue;

            totalEncerradas++;
            if (info.temReagendamento) totalReagendadas++;
        }

        return {
            totalEncerradas,
            totalReagendadas,
            percentual: totalEncerradas > 0 ? (totalReagendadas / totalEncerradas) * 100 : 0
        };
    },

    calcularMotivosReagendamento(ordens) {
        const alvoReagendamento = normalizarTexto(this.NOME_EVENTO_REAGENDAMENTO);
        const contagem = new Map();

        for (const ordem of ordens.values()) {
            for (const mov of ordem.movimentacoes) {
                if (mov.evento === null || mov.evento === undefined) continue;

                const nomeEvento = AuditEngine.resolverReferencia(
                    APP.referencias.eventos, mov.evento, CONFIG_BASE.eventos.nome
                );
                if (normalizarTexto(nomeEvento ?? "") !== alvoReagendamento) continue;

                const motivo = (mov.respostaPadrao ?? "").toString().trim();
                if (!motivo) continue;

                contagem.set(motivo, (contagem.get(motivo) ?? 0) + 1);
            }
        }

        return this.paraListaOrdenada(contagem);
    },

    calcularQualidadeReagendamentoPorTecnico(ordens) {
        const alvoReagendamento = normalizarTexto(this.NOME_EVENTO_REAGENDAMENTO);
        const porTecnico = new Map();

        for (const ordem of ordens.values()) {
            for (const mov of ordem.movimentacoes) {
                if (mov.evento === null || mov.evento === undefined) continue;

                const nomeEvento = AuditEngine.resolverReferencia(
                    APP.referencias.eventos, mov.evento, CONFIG_BASE.eventos.nome
                );
                if (normalizarTexto(nomeEvento ?? "") !== alvoReagendamento) continue;
                if (mov.operador === null || mov.operador === undefined) continue;
                if (!this.operadorPertenceAoFiltroSetor(mov.operador)) continue;

                const nome = AuditEngine.resolverReferencia(
                    APP.referencias.operadores, mov.operador, CONFIG_BASE.operadores.nome
                );

                if (!porTecnico.has(nome)) {
                    porTecnico.set(nome, { acertos: 0, erros: 0 });
                }

                const registro = porTecnico.get(nome);
                const motivo = (mov.respostaPadrao ?? "").toString().trim();

                if (motivo) registro.acertos++;
                else registro.erros++;
            }
        }

        return porTecnico;
    },

    calcularReagendamentosPorTecnico(ordens) {
        const qualidade = this.calcularQualidadeReagendamentoPorTecnico(ordens);
        const contagem = new Map();

        for (const [nome, { acertos, erros }] of qualidade) {
            contagem.set(nome, acertos + erros);
        }

        return this.paraListaOrdenada(contagem);
    },

    contarTecnicosAtivos(ordens) {
        const tecnicos = new Set();
        for (const ordem of ordens.values()) {
            if (ordem.tecnicoResponsavel !== null && ordem.tecnicoResponsavel !== undefined) {
                tecnicos.add(ordem.tecnicoResponsavel);
            }
        }
        return tecnicos.size;
    },

    calcularContagemPorAssunto(ordens) {
        const contagem = new Map();

        for (const ordem of ordens.values()) {
            if (!ordem.assunto) continue;
            contagem.set(ordem.assunto, (contagem.get(ordem.assunto) ?? 0) + 1);
        }

        return this.paraListaOrdenada(contagem);
    },

    calcularDiagnosticosMaisUsados(ordens, analise) {
        const contagem = new Map();

        for (const ordem of ordens.values()) {
            const info = analise.get(ordem.id);
            if (!info?.ultimoFechamento) continue;

            const diagnostico = info.ultimoFechamento.diagnostico;
            if (diagnostico === null || diagnostico === undefined || diagnostico === "") continue;

            const nome = AuditEngine.resolverReferencia(
                APP.referencias.diagnosticos, diagnostico, CONFIG_BASE.diagnosticos.nome
            );

            contagem.set(nome, (contagem.get(nome) ?? 0) + 1);
        }

        return this.paraListaOrdenada(contagem);
    },

    calcularRankingTecnicos(analise) {
        const contagem = new Map();

        for (const info of analise.values()) {
            if (!info.fechamentoEfetivo) continue;

            const nome = this.nomeResponsavelFechamento(info.fechamentoEfetivo);
            if (nome === null || nome === undefined) continue;

            contagem.set(nome, (contagem.get(nome) ?? 0) + 1);
        }

        return this.paraListaOrdenada(contagem);
    },

    calcularRecorrenciaPorTecnicoDetalhado(ordens) {
        const analise = this.analisarEventosDeTodas(ordens);
        const porLogin = this.agruparPorLogin(ordens, analise);
        const porTecnico = new Map();

        for (const listaOrdens of porLogin.values()) {
            if (listaOrdens.length < 2) continue;

            const ordenadas = [...listaOrdens].sort((a, b) => (a.dataAbertura ?? 0) - (b.dataAbertura ?? 0));

            for (let i = 0; i < ordenadas.length - 1; i++) {
                const anterior = ordenadas[i];
                const seguinte = ordenadas[i + 1];

                const fechamentoAnterior = analise.get(anterior.id)?.ultimoFechamento;
                if (!fechamentoAnterior?.data || !seguinte.dataAbertura) continue;
                const nome = this.nomeResponsavelFechamento(fechamentoAnterior);
                if (nome === null || nome === undefined) continue;
                if (!this.dentroDoLimite(fechamentoAnterior.data, seguinte.dataAbertura)) continue;

                if (!porTecnico.has(nome)) {
                    porTecnico.set(nome, []);
                }

                porTecnico.get(nome).push({
                    ordemOrigemId: anterior.id,
                    assuntoOrigem: anterior.assunto,
                    ordemSeguinteId: seguinte.id,
                    assuntoSeguinte: seguinte.assunto
                });
            }
        }

        return porTecnico;
    },

    calcularRecorrenciaPorTecnico(ordens) {
        const detalhado = this.calcularRecorrenciaPorTecnicoDetalhado(ordens);
        const contagem = new Map();

        for (const [nome, ocorrencias] of detalhado) {
            contagem.set(nome, ocorrencias.length);
        }

        return this.paraListaOrdenada(contagem);
    },

    calcularDeslocamentosAbandonadosPorTecnico(ordens) {
        const analise = this.analisarEventosDeTodas(ordens);
        const porTecnico = new Map();

        for (const ordem of ordens.values()) {
            const info = analise.get(ordem.id);
            if (!info?.deslocamentosAbandonados?.length) continue;

            for (const abandono of info.deslocamentosAbandonados) {
                if (abandono.operador === null || abandono.operador === undefined) continue;
                if (!this.operadorPertenceAoFiltroSetor(abandono.operador)) continue;

                const nome = AuditEngine.resolverReferencia(
                    APP.referencias.operadores, abandono.operador, CONFIG_BASE.operadores.nome
                );

                if (!porTecnico.has(nome)) porTecnico.set(nome, []);

                porTecnico.get(nome).push({
                    ordemId: ordem.id,
                    assunto: ordem.assunto,
                    data: abandono.data,
                    tipo: abandono.tipo
                });
            }
        }

        return porTecnico;
    },

    calcularDeslocamentosAbandonados(ordens) {
        const detalhado = this.calcularDeslocamentosAbandonadosPorTecnico(ordens);
        const contagem = new Map();
        let total = 0;

        for (const [nome, ocorrencias] of detalhado) {
            contagem.set(nome, ocorrencias.length);
            total += ocorrencias.length;
        }

        return { total, porTecnico: this.paraListaOrdenada(contagem) };
    },

    paraListaOrdenada(mapaContagem) {
        return [...mapaContagem.entries()]
            .map(([rotulo, valor]) => ({ rotulo, valor }))
            .sort((a, b) => b.valor - a.valor);
    },

    ehTrabalhoSolo(movFechamento) {
        if (!movFechamento) return true;

        const codigoEquipe = movFechamento.equipe;
        if (codigoEquipe === null || codigoEquipe === undefined || codigoEquipe === "") return true;

        const nomeOperador = this.nomeResponsavelFechamento(movFechamento);
        const nomeEquipe = AuditEngine.resolverReferencia(
            APP.referencias.operadores, codigoEquipe, CONFIG_BASE.operadores.nome
        );

        return normalizarTexto(String(nomeOperador ?? "")) === normalizarTexto(String(nomeEquipe ?? ""));
    },

    calcularSoloVsDupla(ordens, analise) {
        let solo = 0;
        let dupla = 0;

        for (const ordem of ordens.values()) {
            const info = analise.get(ordem.id);
            if (!info?.ultimoFechamento) continue;

            if (this.ehTrabalhoSolo(info.ultimoFechamento)) solo++;
            else dupla++;
        }

        return { solo, dupla, total: solo + dupla };
    },

    calcularProdutividade(ordens) {
        const analise = this.analisarEventosDeTodas(ordens);
        const improdutivos = APP.configuracoes.diagnosticosImprodutivos ?? new Set();

        let produtivas = 0;
        let improdutivas = 0;
        let naoClassificadas = 0;

        for (const ordem of ordens.values()) {
            const info = analise.get(ordem.id);
            if (!info?.ultimoFechamento) continue;

            const nome = AuditEngine.resolverReferencia(
                APP.referencias.diagnosticos, info.ultimoFechamento.diagnostico, CONFIG_BASE.diagnosticos.nome
            );

            if (!nome) {
                naoClassificadas++;
                continue;
            }

            if (improdutivos.has(normalizarTexto(nome))) {
                improdutivas++;
            } else if (improdutivos.size === 0) {
                naoClassificadas++;
            } else {
                produtivas++;
            }
        }

        const totalFinalizadas = produtivas + improdutivas + naoClassificadas;

        return {
            produtivas,
            improdutivas,
            naoClassificadas,
            totalFinalizadas,
            percentualProdutivas: totalFinalizadas > 0 ? (produtivas / totalFinalizadas) * 100 : 0
        };
    },

    calcularFichasTecnicos(ordens) {
        const analise = this.analisarEventosDeTodas(ordens);
        const recorrenciaDetalhada = this.calcularRecorrenciaPorTecnicoDetalhado(ordens);
        const qualidadeReagendamento = this.calcularQualidadeReagendamentoPorTecnico(ordens);
        const abandonosDetalhados = this.calcularDeslocamentosAbandonadosPorTecnico(ordens);

        const acumulado = new Map();

        const obterFicha = nome => {
            if (!acumulado.has(nome)) {
                acumulado.set(nome, {
                    nome,
                    totalFinalizadas: 0,
                    somaHorasTms: 0,
                    contagemHorasTms: 0,
                    somaHorasTma: 0,
                    contagemHorasTma: 0,
                    reaberturas: 0,
                    ordensReabertas: [],
                    diagnosticosPreenchidos: 0,
                    diagnosticosAusentes: 0,
                    trabalhosSolo: 0,
                    trabalhosDupla: 0,
                    ordensFinalizadas: [],
                    tmsDetalhes: [],
                    tmaDetalhes: []
                });
            }
            return acumulado.get(nome);
        };

        for (const ordem of ordens.values()) {
            const info = analise.get(ordem.id);
            if (!info?.fechamentoEfetivo) continue;

            const nome = this.nomeResponsavelFechamento(info.fechamentoEfetivo);
            if (nome === null || nome === undefined) continue;

            const ficha = obterFicha(nome);
            ficha.totalFinalizadas++;
            ficha.ordensFinalizadas.push(ordem.id);

            if (info.temReabertura) {
                ficha.reaberturas++;
                ficha.ordensReabertas.push(ordem.id);
            }

            const diagnostico = info.fechamentoEfetivo.diagnostico;
            if (diagnostico !== null && diagnostico !== undefined && diagnostico !== "") {
                ficha.diagnosticosPreenchidos++;
            } else {
                ficha.diagnosticosAusentes++;
            }

            if (this.ehTrabalhoSolo(info.fechamentoEfetivo)) {
                ficha.trabalhosSolo++;
            } else {
                ficha.trabalhosDupla++;
            }
        }

        for (const ordem of ordens.values()) {
            const info = analise.get(ordem.id);
            if (!info || info.excluidoDoTempo) continue;

            for (const [codigoOperador, horas] of this.agruparSegmentosPorOperador(info.segmentosSolucao)) {
                if (!this.operadorPertenceAoFiltroSetor(codigoOperador)) continue;

                const nome = AuditEngine.resolverReferencia(
                    APP.referencias.operadores, codigoOperador, CONFIG_BASE.operadores.nome
                );
                const ficha = obterFicha(nome);
                ficha.somaHorasTms += horas;
                ficha.contagemHorasTms++;
                ficha.tmsDetalhes.push({ ordemId: ordem.id, assunto: ordem.assunto, horas });
            }

            for (const [codigoOperador, horas] of this.agruparSegmentosPorOperador(info.segmentosAtendimento)) {
                if (!this.operadorPertenceAoFiltroSetor(codigoOperador)) continue;

                const nome = AuditEngine.resolverReferencia(
                    APP.referencias.operadores, codigoOperador, CONFIG_BASE.operadores.nome
                );
                const ficha = obterFicha(nome);
                ficha.somaHorasTma += horas;
                ficha.contagemHorasTma++;
                ficha.tmaDetalhes.push({ ordemId: ordem.id, assunto: ordem.assunto, horas });
            }
        }

        const lista = [...acumulado.values()]
            .map(f => {
                const recorrenciasGeradas = recorrenciaDetalhada.get(f.nome)?.length ?? 0;
                const reagendamento = qualidadeReagendamento.get(f.nome) ?? { acertos: 0, erros: 0 };
                const abandonos = abandonosDetalhados.get(f.nome) ?? [];

                return {
                    nome: f.nome,
                    totalFinalizadas: f.totalFinalizadas,
                    tmsHoras: f.contagemHorasTms > 0 ? f.somaHorasTms / f.contagemHorasTms : null,
                    tmsDetalhes: [...f.tmsDetalhes].sort((a, b) => (b.horas ?? -1) - (a.horas ?? -1)),
                    tmaHoras: f.contagemHorasTma > 0 ? f.somaHorasTma / f.contagemHorasTma : null,
                    tmaDetalhes: [...f.tmaDetalhes].sort((a, b) => (b.horas ?? -1) - (a.horas ?? -1)),
                    reaberturas: f.reaberturas,
                    ordensReabertas: f.ordensReabertas,
                    indiceReaberturaPercentual: f.totalFinalizadas > 0
                        ? (f.reaberturas / f.totalFinalizadas) * 100
                        : 0,
                    diagnosticosPreenchidos: f.diagnosticosPreenchidos,
                    diagnosticosAusentes: f.diagnosticosAusentes,
                    trabalhosSolo: f.trabalhosSolo,
                    trabalhosDupla: f.trabalhosDupla,
                    recorrenciasGeradas,
                    recorrenciasDetalhes: recorrenciaDetalhada.get(f.nome) ?? [],
                    percentualRecorrenciaSobreFinalizadas: f.totalFinalizadas > 0
                        ? (recorrenciasGeradas / f.totalFinalizadas) * 100
                        : 0,
                    reagendamentosAcertos: reagendamento.acertos,
                    reagendamentosErros: reagendamento.erros,
                    deslocamentosAbandonados: abandonos.length,
                    deslocamentosAbandonadosDetalhes: abandonos,
                    ordensFinalizadas: f.ordensFinalizadas
                };
            })
            .sort((a, b) => b.totalFinalizadas - a.totalFinalizadas);

        lista.forEach((ficha, indice) => { ficha.ranking = indice + 1; });

        return lista;
    },

    NOMES_MES: ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"],

    calcularTendenciaMensal(ordens) {
        const analise = this.analisarEventosDeTodas(ordens);

        let dataReferencia = null;
        for (const info of analise.values()) {
            const data = info.ultimoEncerramento?.data;
            if (data && (!dataReferencia || data > dataReferencia)) dataReferencia = data;
        }
        if (!dataReferencia) {
            for (const ordem of ordens.values()) {
                if (ordem.dataAbertura && (!dataReferencia || ordem.dataAbertura > dataReferencia)) {
                    dataReferencia = ordem.dataAbertura;
                }
            }
        }
        if (!dataReferencia) return { ano: null, meses: [] };

        const ano = dataReferencia.getFullYear();
        const ultimoMes = dataReferencia.getMonth();

        const buckets = [];
        for (let mes = 0; mes <= ultimoMes; mes++) {
            buckets.push({
                totalFinalizadas: 0,
                somaTms: 0, contagemTms: 0,
                somaTma: 0, contagemTma: 0,
                somaTmr: 0, contagemTmr: 0,
                somaTme: 0, contagemTme: 0,
                reabertas: 0,
                tecnicosAtivos: new Set()
            });
        }

        for (const ordem of ordens.values()) {
            const info = analise.get(ordem.id);
            if (!info?.fechamentoEfetivo?.data) continue;

            const dataFechamento = info.fechamentoEfetivo.data;
            if (dataFechamento.getFullYear() !== ano) continue;

            const mes = dataFechamento.getMonth();
            if (mes > ultimoMes) continue;
            const bucket = buckets[mes];

            bucket.totalFinalizadas++;
            if (info.temReabertura) bucket.reabertas++;

            const nomeFechamentoMes = this.nomeResponsavelFechamento(info.fechamentoEfetivo);
            if (nomeFechamentoMes !== null && nomeFechamentoMes !== undefined) {
                bucket.tecnicosAtivos.add(nomeFechamentoMes);
            }

            if (!info.excluidoDoTempo) {
                const tms = this.somarHorasSegmentos(info.segmentosSolucao);
                if (tms !== null) { bucket.somaTms += tms; bucket.contagemTms++; }

                const tma = this.somarHorasSegmentos(info.segmentosAtendimento);
                if (tma !== null) { bucket.somaTma += tma; bucket.contagemTma++; }
            }

            if (ordem.dataAbertura && info.primeiroAgendamento?.data) {
                const horasTmr = (info.primeiroAgendamento.data - ordem.dataAbertura) / 3600000;
                if (horasTmr >= 0) { bucket.somaTmr += horasTmr; bucket.contagemTmr++; }
            }

            if (ordem.dataAbertura) {
                const horasTme = (dataFechamento - ordem.dataAbertura) / 3600000;
                if (horasTme >= 0) { bucket.somaTme += horasTme; bucket.contagemTme++; }
            }
        }

        const meses = buckets.map((b, mes) => ({
            rotulo: this.NOMES_MES[mes],
            totalFinalizadas: b.totalFinalizadas,
            tmsHoras: b.contagemTms > 0 ? b.somaTms / b.contagemTms : null,
            tmaHoras: b.contagemTma > 0 ? b.somaTma / b.contagemTma : null,
            tmrHoras: b.contagemTmr > 0 ? b.somaTmr / b.contagemTmr : null,
            tmeHoras: b.contagemTme > 0 ? b.somaTme / b.contagemTme : null,
            reabertas: b.reabertas,
            tecnicosAtivos: b.tecnicosAtivos.size
        }));

        return { ano, meses };
    },

    calcularTmsPorTecnico(ordens) {
        return this.calcularFichasTecnicos(ordens)
            .filter(ficha => ficha.tmsHoras !== null)
            .map(ficha => ({ rotulo: ficha.nome, valor: Math.round(ficha.tmsHoras * 10) / 10 }))
            .sort((a, b) => a.valor - b.valor);
    },

    calcularTmaPorTecnico(ordens) {
        return this.calcularFichasTecnicos(ordens)
            .filter(ficha => ficha.tmaHoras !== null)
            .map(ficha => ({ rotulo: ficha.nome, valor: Math.round(ficha.tmaHoras * 10) / 10 }))
            .sort((a, b) => a.valor - b.valor);
    },

    MINIMO_OS_RANKING_CIDADE: 3,

    agregarPorGrupo(ordens, analise, calcularGrupo, calcularHorasDaOS, top, piores = false) {
        const acumulado = new Map();

        for (const ordem of ordens.values()) {
            const info = analise.get(ordem.id);
            if (!info?.ultimoFechamento) continue;

            const grupo = calcularGrupo(ordem, info);
            if (!grupo) continue;

            const horas = calcularHorasDaOS(ordem, info);
            if (horas === null) continue;

            if (!acumulado.has(grupo)) acumulado.set(grupo, { soma: 0, contagem: 0 });
            const registro = acumulado.get(grupo);
            registro.soma += horas;
            registro.contagem++;
        }

        return [...acumulado.entries()]
            .filter(([, r]) => r.contagem >= this.MINIMO_OS_RANKING_CIDADE)
            .map(([rotulo, r]) => ({ rotulo, valor: Math.round((r.soma / r.contagem) * 10) / 10 }))
            .sort((a, b) => piores ? b.valor - a.valor : a.valor - b.valor)
            .slice(0, top);
    },

    agregarPorCidade(ordens, analise, calcularHorasDaOS, top, piores = false) {
        return this.agregarPorGrupo(ordens, analise, ordem => ordem.cidade, calcularHorasDaOS, top, piores);
    },

    agregarPorSetor(ordens, analise, calcularHorasDaOS, top, piores = false) {
        const calcularGrupo = (ordem, info) => {
            const operador = info.ultimoFechamento?.operador;
            if (operador === null || operador === undefined) return null;
            return AuditEngine.resolverReferencia(
                APP.referencias.operadores, operador, CONFIG_BASE.operadores.setor
            );
        };
        return this.agregarPorGrupo(ordens, analise, calcularGrupo, calcularHorasDaOS, top, piores);
    },

    calcularTmsPorCidade(ordens, top = 5, piores = false) {
        const analise = this.analisarEventosDeTodas(ordens);
        return this.agregarPorCidade(ordens, analise, (ordem, info) => {
            if (info.excluidoDoTempo) return null;
            return this.somarHorasSegmentos(info.segmentosSolucao);
        }, top, piores);
    },

    calcularTmaPorCidade(ordens, top = 5, piores = false) {
        const analise = this.analisarEventosDeTodas(ordens);
        return this.agregarPorCidade(ordens, analise, (ordem, info) => {
            if (info.excluidoDoTempo) return null;
            return this.somarHorasSegmentos(info.segmentosAtendimento);
        }, top, piores);
    },

    calcularTmrPorCidade(ordens, top = 5, piores = false) {
        const analise = this.analisarEventosDeTodas(ordens);
        return this.agregarPorCidade(ordens, analise, (ordem, info) => {
            if (!ordem.dataAbertura || !info.primeiroAgendamento?.data) return null;
            const horas = (info.primeiroAgendamento.data - ordem.dataAbertura) / 3600000;
            return horas >= 0 ? horas : null;
        }, top, piores);
    },

    calcularTmsPorSetor(ordens, top = 5, piores = false) {
        const analise = this.analisarEventosDeTodas(ordens);
        return this.agregarPorSetor(ordens, analise, (ordem, info) => {
            if (info.excluidoDoTempo) return null;
            return this.somarHorasSegmentos(info.segmentosSolucao);
        }, top, piores);
    },

    calcularTmaPorSetor(ordens, top = 5, piores = false) {
        const analise = this.analisarEventosDeTodas(ordens);
        return this.agregarPorSetor(ordens, analise, (ordem, info) => {
            if (info.excluidoDoTempo) return null;
            return this.somarHorasSegmentos(info.segmentosAtendimento);
        }, top, piores);
    },

    calcularTmrPorSetor(ordens, top = 5, piores = false) {
        const analise = this.analisarEventosDeTodas(ordens);
        return this.agregarPorSetor(ordens, analise, (ordem, info) => {
            if (!ordem.dataAbertura || !info.primeiroAgendamento?.data) return null;
            const horas = (info.primeiroAgendamento.data - ordem.dataAbertura) / 3600000;
            return horas >= 0 ? horas : null;
        }, top, piores);
    },

    agregarPorAssunto(ordens, analise, calcularHorasDaOS, top, piores = false) {
        return this.agregarPorGrupo(ordens, analise, ordem => ordem.assunto, calcularHorasDaOS, top, piores);
    },

    agregarPorDiagnostico(ordens, analise, calcularHorasDaOS, top, piores = false) {
        const calcularGrupo = (ordem, info) => {
            if (info.ultimoFechamento.diagnostico === null || info.ultimoFechamento.diagnostico === undefined) return null;
            return AuditEngine.resolverReferencia(
                APP.referencias.diagnosticos, info.ultimoFechamento.diagnostico, CONFIG_BASE.diagnosticos.nome
            );
        };
        return this.agregarPorGrupo(ordens, analise, calcularGrupo, calcularHorasDaOS, top, piores);
    },

    calcularTmsPorAssunto(ordens, top = 5, piores = false) {
        const analise = this.analisarEventosDeTodas(ordens);
        return this.agregarPorAssunto(ordens, analise, (ordem, info) => {
            if (info.excluidoDoTempo) return null;
            return this.somarHorasSegmentos(info.segmentosSolucao);
        }, top, piores);
    },

    calcularTmaPorAssunto(ordens, top = 5, piores = false) {
        const analise = this.analisarEventosDeTodas(ordens);
        return this.agregarPorAssunto(ordens, analise, (ordem, info) => {
            if (info.excluidoDoTempo) return null;
            return this.somarHorasSegmentos(info.segmentosAtendimento);
        }, top, piores);
    },

    calcularTmrPorAssunto(ordens, top = 5, piores = false) {
        const analise = this.analisarEventosDeTodas(ordens);
        return this.agregarPorAssunto(ordens, analise, (ordem, info) => {
            if (!ordem.dataAbertura || !info.primeiroAgendamento?.data) return null;
            const horas = (info.primeiroAgendamento.data - ordem.dataAbertura) / 3600000;
            return horas >= 0 ? horas : null;
        }, top, piores);
    },

    calcularTmePorAssunto(ordens, top = 5, piores = false) {
        const analise = this.analisarEventosDeTodas(ordens);
        return this.agregarPorAssunto(ordens, analise, (ordem, info) => {
            if (!ordem.dataAbertura || !info.fechamentoEfetivo?.data) return null;
            const horas = (info.fechamentoEfetivo.data - ordem.dataAbertura) / 3600000;
            return horas >= 0 ? horas : null;
        }, top, piores);
    },

    calcularTmsPorDiagnostico(ordens, top = 5, piores = false) {
        const analise = this.analisarEventosDeTodas(ordens);
        return this.agregarPorDiagnostico(ordens, analise, (ordem, info) => {
            if (info.excluidoDoTempo) return null;
            return this.somarHorasSegmentos(info.segmentosSolucao);
        }, top, piores);
    },

    calcularTmaPorDiagnostico(ordens, top = 5, piores = false) {
        const analise = this.analisarEventosDeTodas(ordens);
        return this.agregarPorDiagnostico(ordens, analise, (ordem, info) => {
            if (info.excluidoDoTempo) return null;
            return this.somarHorasSegmentos(info.segmentosAtendimento);
        }, top, piores);
    },

    calcularTmrPorDiagnostico(ordens, top = 5, piores = false) {
        const analise = this.analisarEventosDeTodas(ordens);
        return this.agregarPorDiagnostico(ordens, analise, (ordem, info) => {
            if (!ordem.dataAbertura || !info.primeiroAgendamento?.data) return null;
            const horas = (info.primeiroAgendamento.data - ordem.dataAbertura) / 3600000;
            return horas >= 0 ? horas : null;
        }, top, piores);
    },

    calcularTmePorDiagnostico(ordens, top = 5, piores = false) {
        const analise = this.analisarEventosDeTodas(ordens);
        return this.agregarPorDiagnostico(ordens, analise, (ordem, info) => {
            if (!ordem.dataAbertura || !info.fechamentoEfetivo?.data) return null;
            const horas = (info.fechamentoEfetivo.data - ordem.dataAbertura) / 3600000;
            return horas >= 0 ? horas : null;
        }, top, piores);
    },

    calcularTmePorCidade(ordens, top = 5, piores = false) {
        const analise = this.analisarEventosDeTodas(ordens);
        return this.agregarPorCidade(ordens, analise, (ordem, info) => {
            if (!ordem.dataAbertura || !info.fechamentoEfetivo?.data) return null;
            const horas = (info.fechamentoEfetivo.data - ordem.dataAbertura) / 3600000;
            return horas >= 0 ? horas : null;
        }, top, piores);
    },

    calcularTmePorSetor(ordens, top = 5, piores = false) {
        const analise = this.analisarEventosDeTodas(ordens);
        return this.agregarPorSetor(ordens, analise, (ordem, info) => {
            if (!ordem.dataAbertura || !info.fechamentoEfetivo?.data) return null;
            const horas = (info.fechamentoEfetivo.data - ordem.dataAbertura) / 3600000;
            return horas >= 0 ? horas : null;
        }, top, piores);
    },

    calcularTmePorTecnico(ordens) {
        const analise = this.analisarEventosDeTodas(ordens);
        const acumulado = new Map();

        for (const ordem of ordens.values()) {
            const info = analise.get(ordem.id);
            if (!ordem.dataAbertura || !info?.fechamentoEfetivo?.data) continue;
            const nome = this.nomeResponsavelFechamento(info.fechamentoEfetivo);
            if (nome === null || nome === undefined) continue;

            const horas = (info.fechamentoEfetivo.data - ordem.dataAbertura) / 3600000;
            if (horas < 0) continue;

            if (!acumulado.has(nome)) acumulado.set(nome, { soma: 0, contagem: 0 });
            const registro = acumulado.get(nome);
            registro.soma += horas;
            registro.contagem++;
        }

        return [...acumulado.entries()]
            .map(([rotulo, r]) => ({ rotulo, valor: Math.round((r.soma / r.contagem) * 10) / 10 }))
            .sort((a, b) => a.valor - b.valor);
    },

    operadorEhDoCop(codigoOperador) {
        const setoresCop = APP.configuracoes.setoresCop ?? [];
        if (setoresCop.length === 0) return false;
        if (codigoOperador === null || codigoOperador === undefined) return false;

        const setor = AuditEngine.resolverReferencia(
            APP.referencias.operadores, codigoOperador, CONFIG_BASE.operadores.setor
        );
        if (!setor) return false;

        const alvo = normalizarTexto(setor);
        return setoresCop.some(s => normalizarTexto(s) === alvo);
    },

    analisarAgendamentosOS(ordem) {
        const alvoFechamento = normalizarTexto(this.NOME_EVENTO_FECHAMENTO);
        const alvoStatusAgendada = normalizarTexto(this.STATUS_AGENDADA);
        const alvoStatusDeslocamento = normalizarTexto(this.STATUS_DESLOCAMENTO);
        const alvoStatusExecucao = normalizarTexto(this.STATUS_EM_EXECUCAO);
        const alvoStatusFinalizada = normalizarTexto(this.STATUS_FINALIZADA);
        const alvoStatusAguardandoAgendamento = normalizarTexto(this.STATUS_AGUARDANDO_AGENDAMENTO);

        let ultimoFechamento = null;
        let primeiroAgendamento = null;
        const segmentosReagendamento = [];

        let aguardandoDesde = null;
        const deslocamentoAbertoPorOperador = new Map();
        const execucaoAbertaPorOperador = new Map();

        const limparPendencias = () => {
            aguardandoDesde = null;
            deslocamentoAbertoPorOperador.clear();
            execucaoAbertaPorOperador.clear();
        };

        const inicioMaisAntigo = () => {
            let inicio = aguardandoDesde;
            for (const data of deslocamentoAbertoPorOperador.values()) {
                if (data && (!inicio || data < inicio)) inicio = data;
            }
            for (const data of execucaoAbertaPorOperador.values()) {
                if (data && (!inicio || data < inicio)) inicio = data;
            }
            return inicio;
        };

        for (const mov of ordem.movimentacoes) {
            const statusNormalizado = normalizarTexto(mov.status ?? "");

            if (mov.evento !== null && mov.evento !== undefined) {
                const nomeEvento = AuditEngine.resolverReferencia(
                    APP.referencias.eventos, mov.evento, CONFIG_BASE.eventos.nome
                );
                if (normalizarTexto(nomeEvento ?? "") === alvoFechamento) {
                    if (!ultimoFechamento || (mov.data && ultimoFechamento.data && mov.data > ultimoFechamento.data)) {
                        ultimoFechamento = mov;
                    }
                }
            }

            if (statusNormalizado === alvoStatusAgendada) {
                if (!primeiroAgendamento) {
                    primeiroAgendamento = mov;
                } else {
                    const inicio = inicioMaisAntigo();
                    if (inicio && mov.data && mov.data > inicio && mov.operador !== null && mov.operador !== undefined) {
                        segmentosReagendamento.push({ operador: mov.operador, inicio, fim: mov.data });
                    }
                }
                limparPendencias();
                continue;
            }

            if (mov.operador !== null && mov.operador !== undefined) {
                if (statusNormalizado === alvoStatusDeslocamento) {
                    deslocamentoAbertoPorOperador.set(mov.operador, mov.data);
                }
                if (statusNormalizado === alvoStatusExecucao) {
                    execucaoAbertaPorOperador.set(mov.operador, mov.data);
                }
            }

            if (statusNormalizado === alvoStatusAguardandoAgendamento) {
                if (!aguardandoDesde) aguardandoDesde = mov.data ?? null;
                deslocamentoAbertoPorOperador.clear();
                execucaoAbertaPorOperador.clear();
            }

            if (statusNormalizado === alvoStatusFinalizada) {
                deslocamentoAbertoPorOperador.clear();
                execucaoAbertaPorOperador.clear();
            }
        }

        const excluidoDoTempo = this.diagnosticoExcluidoDoTempo(ultimoFechamento);

        return { primeiroAgendamento, segmentosReagendamento, excluidoDoTempo };
    },

    analisarAgendamentosDeTodas(ordens) {
        const analise = new Map();
        for (const ordem of ordens.values()) {
            analise.set(ordem.id, this.analisarAgendamentosOS(ordem));
        }
        return analise;
    },

    calcularAgendamentosCopDetalhado(ordens) {
        const analise = this.analisarAgendamentosDeTodas(ordens);
        const porColaborador = new Map();

        for (const ordem of ordens.values()) {
            const info = analise.get(ordem.id);
            if (!info || info.excluidoDoTempo) continue;
            if (!ordem.dataAbertura || !info.primeiroAgendamento?.data) continue;
            if (!this.operadorEhDoCop(info.primeiroAgendamento.operador)) continue;

            const horas = (info.primeiroAgendamento.data - ordem.dataAbertura) / 3600000;
            if (horas < 0) continue;

            const nome = AuditEngine.resolverReferencia(
                APP.referencias.operadores, info.primeiroAgendamento.operador, CONFIG_BASE.operadores.nome
            );

            if (!porColaborador.has(nome)) porColaborador.set(nome, []);
            porColaborador.get(nome).push({
                ordemId: ordem.id,
                assunto: ordem.assunto,
                horas
            });
        }

        return porColaborador;
    },

    calcularTmrPrimeiroAgendamentoCop(ordens) {
        const detalhado = this.calcularAgendamentosCopDetalhado(ordens);
        let somaHoras = 0;
        let contagem = 0;

        for (const itens of detalhado.values()) {
            for (const item of itens) {
                somaHoras += item.horas;
                contagem++;
            }
        }

        return { horas: contagem > 0 ? somaHoras / contagem : null, contagem };
    },

    calcularTmrPrimeiroAgendamentoCopPorColaborador(ordens) {
        const detalhado = this.calcularAgendamentosCopDetalhado(ordens);

        return [...detalhado.entries()]
            .map(([rotulo, itens]) => ({
                rotulo,
                valor: Math.round((itens.reduce((soma, i) => soma + i.horas, 0) / itens.length) * 10) / 10
            }))
            .sort((a, b) => a.valor - b.valor);
    },

    calcularReagendamentosCopDetalhado(ordens) {
        const analise = this.analisarAgendamentosDeTodas(ordens);
        const porColaborador = new Map();

        for (const [ordemId, info] of analise) {
            if (info.excluidoDoTempo) continue;

            const ordem = ordens.get(ordemId);

            for (const seg of info.segmentosReagendamento) {
                if (!this.operadorEhDoCop(seg.operador)) continue;

                const nome = AuditEngine.resolverReferencia(
                    APP.referencias.operadores, seg.operador, CONFIG_BASE.operadores.nome
                );
                const horas = (seg.fim - seg.inicio) / 3600000;

                if (!porColaborador.has(nome)) porColaborador.set(nome, []);
                porColaborador.get(nome).push({
                    ordemId,
                    assunto: ordem?.assunto ?? null,
                    horas
                });
            }
        }

        return porColaborador;
    },

    calcularTmrReagendamentoCop(ordens) {
        const detalhado = this.calcularReagendamentosCopDetalhado(ordens);
        let somaHoras = 0;
        let contagem = 0;

        for (const itens of detalhado.values()) {
            for (const item of itens) {
                somaHoras += item.horas;
                contagem++;
            }
        }

        return { horas: contagem > 0 ? somaHoras / contagem : null, contagem };
    },

    calcularTmrReagendamentoCopPorColaborador(ordens) {
        const detalhado = this.calcularReagendamentosCopDetalhado(ordens);

        return [...detalhado.entries()]
            .map(([rotulo, itens]) => ({
                rotulo,
                valor: Math.round((itens.reduce((soma, i) => soma + i.horas, 0) / itens.length) * 10) / 10
            }))
            .sort((a, b) => a.valor - b.valor);
    }

};
