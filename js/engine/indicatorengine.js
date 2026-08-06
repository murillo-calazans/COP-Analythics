/**
 * ==========================================================
 * Indicator Engine
 * ==========================================================
 * Calcula indicadores operacionais em cima de APP.dados.ordens.
 * Recorrência de cliente usa "login" (não "cliente", que é
 * texto livre e pode variar na digitação) como chave, já que um
 * cliente pode ter vários logins mas cada login é único.
 *
 * Quatro métricas de tempo, todas em horas, todas baseadas no
 * EVENTO da movimentação (não no STATUS):
 *   TMR — Tempo Médio de Resposta: abertura da OS até o 1º Agendamento.
 *   TMS — Tempo Médio de Solução: deslocamento até a finalização.
 *   TMA — Tempo Médio de Atendimento: "Em Execução" até a finalização
 *         (só o trabalho em si, sem contar o deslocamento até o local).
 *   TME — Tempo Médio de Espera: abertura da OS até a finalização —
 *         visão do cliente, quanto tempo ele ficou esperando no total.
 *
 * TMS e TMA têm DOIS cálculos diferentes, de propósito:
 *   - Visão da OS/empresa (calcularTMS): tempo corrido total, do
 *     primeiro deslocamento até o encerramento — inclui qualquer
 *     tempo parado no meio (ex.: esperando o cliente depois de um
 *     reagendamento), porque isso é real pra quem mede SLA.
 *   - Visão do técnico (dentro de calcularFichasTecnicos): soma só
 *     os SEGMENTOS em que o técnico esteve de fato atuando — cada
 *     segmento vai de um início (deslocamento pra TMS, "Em Execução"
 *     pra TMA) até o encerramento daquele ciclo (Fechamento OU
 *     Reagendamento). O intervalo entre um Reagendamento e o próximo
 *     deslocamento/execução NÃO conta pro técnico — não é culpa dele
 *     o cliente não ter recebido a nova visita ainda. Um novo
 *     Agendamento no meio de um início já aberto também descarta esse
 *     início (sem virar segmento) — significa que outro operador
 *     reagendou a visita administrativamente sem o técnico ter
 *     reagendado nem executado nada.
 *
 * Uma OS sem nenhuma movimentação de Fechamento é considerada ainda
 * em aberto e fica fora de TMS/TMA/TME.
 */

const IndicatorEngine = {

    LIMITE_DIAS_RECORRENCIA: 90,
    LIMITE_QTD_RECORRENCIA: 3,

    NOME_EVENTO_FECHAMENTO: "Fechamento",
    NOME_EVENTO_REABERTURA: "Reabertura",
    NOME_EVENTO_REAGENDAMENTO: "Reagendar",
    NOME_EVENTO_ALTERACAO: "Alteração",
    NOME_EVENTO_EM_EXECUCAO: "Em Execução",
    NOME_EVENTO_AGENDAMENTO: "Agendamento",

    // "Alteração" (evento 2) é genérico — só conta como início de
    // deslocamento quando o histórico daquela movimentação traz esse
    // texto (registrado pelo próprio sistema de origem).
    TEXTO_HISTORICO_DESLOCAMENTO: "iniciou o deslocamento",

    calcularRecorrencia(ordens) {
        // Idempotente: pode ser chamado de novo (ex.: depois de mudar o
        // Filtro Global) sem deixar alertas velhos presos numa OS que já
        // não se qualifica mais.
        this.limparAlertasRecorrencia(ordens);

        const dataReferencia = this.encontrarDataMaisRecente(ordens);
        const porLogin = this.agruparPorLogin(ordens);
        const recorrentes = new Map();

        for (const [login, listaOrdens] of porLogin) {
            const recentes = listaOrdens.filter(ordem =>
                this.dentroDoLimite(ordem.dataAbertura, dataReferencia)
            );

            if (recentes.length < this.LIMITE_QTD_RECORRENCIA) continue;

            recorrentes.set(login, {
                login,
                cliente: listaOrdens[0].cliente,
                totalOS: recentes.length,
                ordens: recentes.map(ordem => ordem.id)
            });

            for (const ordem of recentes) {
                this.marcarAlertaRecorrencia(ordem, recentes.length);
            }
        }

        return recorrentes;
    },

    /**
     * Detalha um registro de recorrência (vindo de calcularRecorrencia)
     * pra tela de Alertas: cada OS envolvida, com assunto e o técnico
     * responsável (última movimentação) — pra saber quem atendeu o
     * cliente em cada uma das idas e vindas.
     */
    detalharRecorrenciaCliente(registro, ordens) {
        const ordensDetalhes = registro.ordens.map(id => {
            const ordem = ordens.get(id) ?? ordens.get(Number(id)) ?? ordens.get(String(id));

            if (!ordem) {
                return { id, assunto: null, tecnico: null, dataAbertura: null };
            }

            const tecnico = (ordem.tecnicoResponsavel !== null && ordem.tecnicoResponsavel !== undefined)
                ? AuditEngine.resolverReferencia(APP.referencias.operadores, ordem.tecnicoResponsavel, CONFIG_BASE.operadores.nome)
                : null;

            return {
                id: ordem.id,
                assunto: ordem.assunto,
                tecnico,
                dataAbertura: ordem.dataAbertura
            };
        });

        const tecnicosEnvolvidos = [...new Set(ordensDetalhes.map(d => d.tecnico).filter(Boolean))];

        return {
            login: registro.login,
            cliente: registro.cliente,
            totalOS: registro.totalOS,
            ordensDetalhes,
            tecnicosEnvolvidos
        };
    },

    /**
     * Funil configurável (APP.configuracoes.funilAssuntos): quantos
     * clientes, depois de uma OS com assunto em "origem" (ex.: Instalação
     * Novo Cliente, Transferência de Endereço), abriram uma OS com
     * assunto em "destino" (ex.: Verificar Conexão, Sem Conexão LOS)
     * dentro da mesma janela usada pela recorrência geral — sinal de
     * instalação/transferência malfeita. Não usa a lista branca de
     * assuntos da recorrência — aqui os assuntos relevantes são
     * exatamente os configurados pro funil.
     */
    calcularFunilAssuntos(ordens) {
        const config = APP.configuracoes.funilAssuntos ?? { origem: [], destino: [] };

        if (config.origem.length === 0 || config.destino.length === 0) {
            return { totalClientes: 0, ocorrencias: [] };
        }

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

                const dataBase = origem.dataFechamento ?? origem.dataAbertura;
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
                    break; // já achou 1 destino pra essa origem, passa pra próxima origem
                }
            }
        }

        return { totalClientes: clientesAfetados.size, ocorrencias };
    },

    agruparPorLogin(ordens) {
        const porLogin = new Map();

        // Lista branca: um assunto só entra na recorrência se estiver
        // explicitamente marcado como incluído no Filtro Global. Assunto
        // sem marcação (inclusive assunto novo, nunca visto antes) fica
        // de fora até alguém incluir manualmente — padrão mais seguro
        // contra falso-positivo de recorrência.
        const assuntosIncluidos = APP.configuracoes.assuntosIncluidos ?? new Set();

        for (const ordem of ordens.values()) {
            if (!ordem.login) continue;
            if (!ordem.assunto || !assuntosIncluidos.has(normalizarTexto(ordem.assunto))) continue;

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

    /**
     * Painel completo pro Dashboard: um único ponto de entrada que já
     * devolve tudo pronto pra UI só desenhar. Nenhum cálculo na tela.
     */
    calcularPainelDashboard(ordens) {
        const analise = this.analisarEventosDeTodas(ordens);

        return {
            totalOS: ordens.size,
            totalTecnicos: this.contarTecnicosAtivos(ordens),
            totalFinalizadas: this.contarFinalizadas(analise),
            tmsHoras: this.calcularTMS(ordens, analise),
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

    /**
     * Passa por cada OS 1x só, resolvendo os eventos de suas movimentações,
     * e guarda o resultado — TMS/TMR/TMA, índice de reabertura e ranking
     * de técnicos (por fechamento) usam esse mesmo resultado em vez de
     * resolver referência 3x pra cada OS.
     */
    analisarEventosDeTodas(ordens) {
        const analise = new Map();
        for (const ordem of ordens.values()) {
            analise.set(ordem.id, this.analisarEventosOS(ordem));
        }
        return analise;
    },

    analisarEventosOS(ordem) {
        const alvoFechamento = normalizarTexto(this.NOME_EVENTO_FECHAMENTO);
        const alvoReabertura = normalizarTexto(this.NOME_EVENTO_REABERTURA);
        const alvoReagendamento = normalizarTexto(this.NOME_EVENTO_REAGENDAMENTO);
        const alvoAlteracao = normalizarTexto(this.NOME_EVENTO_ALTERACAO);
        const alvoEmExecucao = normalizarTexto(this.NOME_EVENTO_EM_EXECUCAO);
        const alvoAgendamento = normalizarTexto(this.NOME_EVENTO_AGENDAMENTO);
        const textoDeslocamento = normalizarTexto(this.TEXTO_HISTORICO_DESLOCAMENTO);

        let ultimoFechamento = null;
        let ultimoEncerramento = null; // Fechamento OU Reagendar — fim do TMS "visão da empresa"
        let primeiroInicioAtendimento = null; // deslocamento OU Em Execução — início do TMS "visão da empresa"
        let primeiroAgendamento = null; // 1º Agendamento — fim do TMR (Tempo Médio de Resposta)
        let temReabertura = false;
        let temReagendamento = false;

        // Segmentos "visão do técnico": cada um vai de um início até o
        // Fechamento/Reagendamento que o encerra. O intervalo entre um
        // Reagendamento e o próximo início não vira segmento nenhum —
        // fica de fora da soma, de propósito (ver cabeçalho do arquivo).
        const segmentosSolucao = []; // início = deslocamento OU Em Execução
        const segmentosAtendimento = []; // início = só Em Execução
        const deslocamentosAbandonados = []; // {operador, data, tipo} — ver Agendamento abaixo
        let inicioSolucaoAberto = null;
        let tipoInicioSolucaoAberto = null; // "deslocamento" | "execucao"
        let inicioAtendimentoAberto = null;

        for (const mov of ordem.movimentacoes) {
            if (mov.evento === null || mov.evento === undefined) continue;

            const nomeEvento = AuditEngine.resolverReferencia(
                APP.referencias.eventos, mov.evento, CONFIG_BASE.eventos.nome
            );
            const nomeNormalizado = normalizarTexto(nomeEvento ?? "");
            const ehFechamento = nomeNormalizado === alvoFechamento;
            const ehReagendamento = nomeNormalizado === alvoReagendamento;
            const ehFimSegmento = ehFechamento || ehReagendamento;

            if (ehFechamento) {
                if (!ultimoFechamento || (mov.data && ultimoFechamento.data && mov.data > ultimoFechamento.data)) {
                    ultimoFechamento = mov;
                }
            }

            if (ehFimSegmento) {
                if (!ultimoEncerramento || (mov.data && ultimoEncerramento.data && mov.data > ultimoEncerramento.data)) {
                    ultimoEncerramento = mov;
                }
            }

            if (nomeNormalizado === alvoReabertura) {
                temReabertura = true;
            }

            if (ehReagendamento) {
                temReagendamento = true;
            }

            if (nomeNormalizado === alvoAgendamento) {
                if (!primeiroAgendamento || (mov.data && primeiroAgendamento.data && mov.data < primeiroAgendamento.data)) {
                    primeiroAgendamento = mov;
                }

                // Um Agendamento depois que um deslocamento/execução já
                // tinha começado, sem Fechamento/Reagendamento no meio,
                // significa que aquele atendimento foi substituído/
                // reagendado administrativamente por outro operador — o
                // técnico não reagendou nem executou, então esse início
                // fica descartado (não vira segmento, não soma pro TMS/TMA
                // dele). Só afeta a visão do técnico — primeiroInicioAtendimento
                // e ultimoEncerramento (TMS/TMA "visão da OS") não mudam.
                // Registra o abandono em si — é um problema operacional
                // por conta própria, vale saber quantas vezes acontece.
                if (inicioSolucaoAberto) {
                    deslocamentosAbandonados.push({
                        operador: inicioSolucaoAberto.operador,
                        data: inicioSolucaoAberto.data,
                        tipo: tipoInicioSolucaoAberto
                    });
                }
                inicioSolucaoAberto = null;
                tipoInicioSolucaoAberto = null;
                inicioAtendimentoAberto = null;
            }

            const ehInicioExecucao = nomeNormalizado === alvoEmExecucao;
            const ehInicioDeslocamento = nomeNormalizado === alvoAlteracao
                && this.historicoContemTexto(mov, textoDeslocamento);
            const ehInicioSolucao = ehInicioExecucao || ehInicioDeslocamento;

            if (ehInicioSolucao) {
                if (!primeiroInicioAtendimento || (mov.data && primeiroInicioAtendimento.data && mov.data < primeiroInicioAtendimento.data)) {
                    primeiroInicioAtendimento = mov;
                }
                if (!inicioSolucaoAberto) {
                    inicioSolucaoAberto = mov;
                    tipoInicioSolucaoAberto = ehInicioDeslocamento ? "deslocamento" : "execucao";
                }
            }

            if (ehInicioExecucao && !inicioAtendimentoAberto) {
                inicioAtendimentoAberto = mov;
            }

            if (ehFimSegmento) {
                if (inicioSolucaoAberto && mov.data && inicioSolucaoAberto.data && mov.data >= inicioSolucaoAberto.data) {
                    segmentosSolucao.push({ inicio: inicioSolucaoAberto.data, fim: mov.data });
                }
                inicioSolucaoAberto = null;

                if (inicioAtendimentoAberto && mov.data && inicioAtendimentoAberto.data && mov.data >= inicioAtendimentoAberto.data) {
                    segmentosAtendimento.push({ inicio: inicioAtendimentoAberto.data, fim: mov.data });
                }
                inicioAtendimentoAberto = null;
            }
        }

        // Baseado no diagnóstico do fechamento FINAL (o mais recente, já
        // resolvido acima) — uma OS cancelada/aberta errada não representa
        // trabalho real de campo, então nem ela nem o técnico que a fechou
        // devem carregar esse tempo no TMS/TMA. Não afeta OS finalizadas
        // nem ranking — só a conta de tempo (ver calcularTMS/calcularFichasTecnicos).
        const excluidoDoTempo = this.diagnosticoExcluidoDoTempo(ultimoFechamento);

        return {
            ultimoFechamento, ultimoEncerramento, primeiroInicioAtendimento, primeiroAgendamento,
            temReabertura, temReagendamento, segmentosSolucao, segmentosAtendimento,
            deslocamentosAbandonados, excluidoDoTempo
        };
    },

    /**
     * Verifica se o diagnóstico do fechamento está na lista configurável
     * de diagnósticos que NÃO devem contar no TMS/TMA (ex.: "Cancelada
     * pelo Cliente", "Aberto Errado") — ver Configurações > Diagnósticos
     * excluídos do tempo. Lista vazia = nada é excluído (comportamento
     * padrão, sem configuração nenhuma).
     */
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

    historicoContemTexto(mov, textoNormalizadoAlvo) {
        if (!mov.historico || mov.historico.length === 0) return false;
        return mov.historico.some(texto => normalizarTexto(String(texto)).includes(textoNormalizadoAlvo));
    },

    /** Soma, em horas, a duração de uma lista de segmentos {inicio, fim} (Date). */
    somarHorasSegmentos(segmentos) {
        if (!segmentos || segmentos.length === 0) return null;
        let total = 0;
        for (const seg of segmentos) {
            total += (seg.fim - seg.inicio) / 3600000;
        }
        return total;
    },

    contarFinalizadas(analise) {
        let total = 0;
        for (const info of analise.values()) {
            if (info.ultimoFechamento) total++;
        }
        return total;
    },

    /**
     * TMS — Tempo Médio de Solução, visão da OS/empresa, em horas: média
     * de (data do encerramento − data do início do atendimento). NÃO
     * conta a partir da abertura/agendamento — só a partir de quando o
     * técnico realmente começou a agir (deslocamento ou Em Execução, o
     * que vier primeiro). "Encerramento" é o Fechamento OU o
     * Reagendamento, o que for mais recente. Tempo CORRIDO total — inclui
     * qualquer espera no meio do caminho (ex.: entre um reagendamento e a
     * próxima visita), porque essa é a visão que importa pra SLA da
     * empresa. Pra a visão "sem culpa do técnico", ver tmsHoras dentro de
     * calcularFichasTecnicos. OS sem os dois marcos (início E fim) não
     * entram na conta — nem OS cancelada/aberta errada (diagnóstico na
     * lista configurável de exclusão, ver diagnosticoExcluidoDoTempo).
     */
    calcularTMS(ordens, analise) {
        let somaHoras = 0;
        let contagem = 0;

        for (const ordem of ordens.values()) {
            const info = analise.get(ordem.id);
            if (!info?.ultimoEncerramento?.data || !info?.primeiroInicioAtendimento?.data) continue;
            if (info.excluidoDoTempo) continue;

            const horas = (info.ultimoEncerramento.data - info.primeiroInicioAtendimento.data) / 3600000;
            if (horas < 0) continue; // dado inconsistente — não deixa puxar a média pra baixo

            somaHoras += horas;
            contagem++;
        }

        return contagem > 0 ? somaHoras / contagem : null;
    },

    /**
     * TMR — Tempo Médio de Resposta, em horas: da abertura da OS até o
     * 1º Agendamento. Mede a velocidade da empresa em agendar uma visita,
     * não a atuação do técnico em campo (por isso não entra na ficha
     * individual dele). OS sem Agendamento algum fica fora da conta.
     */
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

    /**
     * TME — Tempo Médio de Espera, em horas: da abertura da OS até o
     * Fechamento. Visão do cliente — quanto tempo ele esperou no total,
     * do pedido até a solução, sem descontar nada (fila, reagendamentos,
     * tudo conta, porque tudo isso é tempo real de espera do cliente).
     */
    calcularTME(ordens, analise) {
        let somaHoras = 0;
        let contagem = 0;

        for (const ordem of ordens.values()) {
            const info = analise.get(ordem.id);
            if (!ordem.dataAbertura || !info?.ultimoFechamento?.data) continue;

            const horas = (info.ultimoFechamento.data - ordem.dataAbertura) / 3600000;
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

    /**
     * % de OS encerradas (Fechamento OU Reagendamento) que tiveram pelo
     * menos um Reagendamento no caminho. Usa "encerradas", não só
     * "finalizadas" — uma OS pode nunca ter chegado ao Fechamento e
     * ainda assim já ter sido reagendada várias vezes.
     */
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

    /**
     * Motivos mais frequentes de reagendamento. Vêm da Resposta Padrão
     * da movimentação com evento "Reagendar" — no sistema de origem
     * esse campo nunca fica em branco nessas linhas e é justamente onde
     * o motivo é registrado (diferente do Diagnóstico, que fica vazio
     * numa linha de reagendamento).
     */
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

    /**
     * Qualidade do reagendamento por técnico: quem fez o reagendamento
     * (operador daquela movimentação específica — pode ser diferente de
     * quem fecha a OS no fim) preenchendo a Resposta Padrão conta como
     * "acerto"; deixando em branco (nunca deveria) conta como "erro".
     */
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

    /**
     * Diagnóstico só é preenchido de verdade na movimentação de
     * Fechamento (nas outras, como Reagendar, o campo vem vazio/0 por
     * padrão do sistema de origem) — por isso conta só a partir de
     * info.ultimoFechamento, uma vez por OS, e não de toda movimentação.
     * Contar de qualquer movimentação inflava "0"/valores vazios como se
     * fossem diagnóstico de verdade em OS que nem chegaram a fechar.
     */
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

    /**
     * Ranking de técnicos por volume de OS **realmente finalizadas**
     * (tem evento Fechamento) — o técnico contado é quem executou esse
     * Fechamento especificamente, não só quem tocou a OS por último.
     */
    calcularRankingTecnicos(analise) {
        const contagem = new Map();

        for (const info of analise.values()) {
            if (!info.ultimoFechamento) continue;

            const tecnico = info.ultimoFechamento.operador;
            if (tecnico === null || tecnico === undefined) continue;

            const nome = AuditEngine.resolverReferencia(
                APP.referencias.operadores, tecnico, CONFIG_BASE.operadores.nome
            );

            contagem.set(nome, (contagem.get(nome) ?? 0) + 1);
        }

        return this.paraListaOrdenada(contagem);
    },

    /**
     * Quando o mesmo cliente (login) abre uma OS nova depois que uma
     * anterior foi encerrada, o técnico responsável pelo fechamento da
     * OS anterior é contabilizado como gerador de recorrência — mesma
     * janela de dias e mesma lista branca de assuntos usadas em
     * calcularRecorrencia(), pra manter os dois indicadores consistentes.
     * Guarda o detalhe de cada ocorrência (ID da OS original, assunto,
     * ID da OS que reabriu, assunto dela) pra dar contexto na ficha do
     * técnico — não só o número.
     */
    calcularRecorrenciaPorTecnicoDetalhado(ordens) {
        const porLogin = this.agruparPorLogin(ordens);
        const porTecnico = new Map();

        for (const listaOrdens of porLogin.values()) {
            if (listaOrdens.length < 2) continue;

            const ordenadas = [...listaOrdens].sort((a, b) => (a.dataAbertura ?? 0) - (b.dataAbertura ?? 0));

            for (let i = 0; i < ordenadas.length - 1; i++) {
                const anterior = ordenadas[i];
                const seguinte = ordenadas[i + 1];

                if (!anterior.dataFechamento || !seguinte.dataAbertura) continue;
                if (anterior.tecnicoResponsavel === null || anterior.tecnicoResponsavel === undefined) continue;
                if (!this.dentroDoLimite(anterior.dataFechamento, seguinte.dataAbertura)) continue;

                const nome = AuditEngine.resolverReferencia(
                    APP.referencias.operadores, anterior.tecnicoResponsavel, CONFIG_BASE.operadores.nome
                );

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

    /**
     * Quantos deslocamentos/execuções foram abandonados por técnico —
     * ele começou o atendimento mas outro operador reagendou por cima
     * antes dele reagendar ou executar (ver analisarEventosOS). Passa
     * por TODAS as OS, não só as finalizadas: o abandono é um evento em
     * si, independente da OS ainda estar aberta ou ter sido fechada por
     * outra pessoa depois.
     */
    calcularDeslocamentosAbandonadosPorTecnico(ordens) {
        const analise = this.analisarEventosDeTodas(ordens);
        const porTecnico = new Map();

        for (const ordem of ordens.values()) {
            const info = analise.get(ordem.id);
            if (!info?.deslocamentosAbandonados?.length) continue;

            for (const abandono of info.deslocamentosAbandonados) {
                if (abandono.operador === null || abandono.operador === undefined) continue;

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

    /**
     * "Equipe" é tratado igual a "Operador": pode vir como código (resolve
     * pela Base de operadores) ou já como texto solto — usa o que der.
     * Equipe igual ao operador que fechou a OS (ou em branco, ninguém
     * registrado) = trabalhou sozinho; nomes diferentes = trabalhou em dupla.
     */
    ehTrabalhoSolo(movFechamento) {
        if (!movFechamento) return true;

        const codigoEquipe = movFechamento.equipe;
        if (codigoEquipe === null || codigoEquipe === undefined || codigoEquipe === "") return true;

        const nomeOperador = AuditEngine.resolverReferencia(
            APP.referencias.operadores, movFechamento.operador, CONFIG_BASE.operadores.nome
        );
        const nomeEquipe = AuditEngine.resolverReferencia(
            APP.referencias.operadores, codigoEquipe, CONFIG_BASE.operadores.nome
        );

        return normalizarTexto(String(nomeOperador ?? "")) === normalizarTexto(String(nomeEquipe ?? ""));
    },

    /**
     * Total de OS finalizadas feitas sozinho vs em dupla, no agregado geral.
     */
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

    /**
     * Ficha individual por técnico: OS finalizadas, TMS/TMA próprios
     * (segmentados — ver cabeçalho do arquivo), reaberturas, % de
     * reabertura, recorrência gerada (cliente que volta depois do
     * fechamento dele) e posição no ranking geral. Só entra técnico com
     * pelo menos 1 OS finalizada (evento Fechamento) — sem isso não tem
     * "ficha" que se sustente.
     */
    calcularFichasTecnicos(ordens) {
        const analise = this.analisarEventosDeTodas(ordens);
        const recorrenciaDetalhada = this.calcularRecorrenciaPorTecnicoDetalhado(ordens);
        const qualidadeReagendamento = this.calcularQualidadeReagendamentoPorTecnico(ordens);
        const abandonosDetalhados = this.calcularDeslocamentosAbandonadosPorTecnico(ordens);

        const acumulado = new Map();

        for (const ordem of ordens.values()) {
            const info = analise.get(ordem.id);
            if (!info?.ultimoFechamento) continue;

            const codigoTecnico = info.ultimoFechamento.operador;
            if (codigoTecnico === null || codigoTecnico === undefined) continue;

            const nome = AuditEngine.resolverReferencia(
                APP.referencias.operadores, codigoTecnico, CONFIG_BASE.operadores.nome
            );

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

            const ficha = acumulado.get(nome);
            ficha.totalFinalizadas++;
            ficha.ordensFinalizadas.push(ordem.id);

            // Segmentado: soma só os intervalos em que o técnico esteve de
            // fato atuando, excluindo a espera parada entre um
            // Reagendamento e o próximo início (ver analisarEventosOS). OS
            // cancelada/aberta errada (excluidoDoTempo) não vira tempo
            // nenhum — nem pra soma nem pro detalhe, é como se não tivesse
            // segmento algum.
            const horasTms = info.excluidoDoTempo ? null : this.somarHorasSegmentos(info.segmentosSolucao);
            if (horasTms !== null) {
                ficha.somaHorasTms += horasTms;
                ficha.contagemHorasTms++;
            }
            ficha.tmsDetalhes.push({ ordemId: ordem.id, assunto: ordem.assunto, horas: horasTms });

            const horasTma = info.excluidoDoTempo ? null : this.somarHorasSegmentos(info.segmentosAtendimento);
            if (horasTma !== null) {
                ficha.somaHorasTma += horasTma;
                ficha.contagemHorasTma++;
            }
            ficha.tmaDetalhes.push({ ordemId: ordem.id, assunto: ordem.assunto, horas: horasTma });

            if (info.temReabertura) {
                ficha.reaberturas++;
                ficha.ordensReabertas.push(ordem.id);
            }

            const diagnostico = info.ultimoFechamento.diagnostico;
            if (diagnostico !== null && diagnostico !== undefined && diagnostico !== "") {
                ficha.diagnosticosPreenchidos++;
            } else {
                ficha.diagnosticosAusentes++;
            }

            if (this.ehTrabalhoSolo(info.ultimoFechamento)) {
                ficha.trabalhosSolo++;
            } else {
                ficha.trabalhosDupla++;
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

    /**
     * Tendência ao longo do tempo: volume de OS finalizadas, TMS médio
     * (visão da OS/empresa, tempo corrido) e índice de reabertura por
     * período. Granularidade é escolhida automaticamente pelo tamanho do
     * intervalo de dados (dia/semana/mês) — evita virar um gráfico
     * ilegível de 400 pontos diários num ano inteiro, ou um gráfico vazio
     * de 3 pontos mensais numa semana.
     */
    calcularTendencias(ordens) {
        const analise = this.analisarEventosDeTodas(ordens);
        const pontosBrutos = [];

        for (const ordem of ordens.values()) {
            const info = analise.get(ordem.id);
            if (!info?.ultimoEncerramento?.data) continue;

            let horas = null;
            if (info.primeiroInicioAtendimento?.data && !info.excluidoDoTempo) {
                const diferenca = (info.ultimoEncerramento.data - info.primeiroInicioAtendimento.data) / 3600000;
                if (diferenca >= 0) horas = diferenca;
            }

            pontosBrutos.push({
                data: info.ultimoEncerramento.data,
                tmsHoras: horas,
                reaberta: info.temReabertura,
                reagendada: info.temReagendamento
            });
        }

        if (pontosBrutos.length === 0) {
            return { granularidade: "dia", pontos: [] };
        }

        const granularidade = this.escolherGranularidade(pontosBrutos);
        const porPeriodo = new Map();

        for (const ponto of pontosBrutos) {
            const chave = this.chavePeriodo(ponto.data, granularidade);

            if (!porPeriodo.has(chave)) {
                porPeriodo.set(chave, {
                    data: ponto.data,
                    totalFinalizadas: 0,
                    somaHoras: 0,
                    contagemHoras: 0,
                    reabertas: 0,
                    reagendadas: 0
                });
            }

            const registro = porPeriodo.get(chave);
            registro.totalFinalizadas++;

            if (ponto.tmsHoras !== null) {
                registro.somaHoras += ponto.tmsHoras;
                registro.contagemHoras++;
            }

            if (ponto.reaberta) registro.reabertas++;
            if (ponto.reagendada) registro.reagendadas++;
        }

        const pontos = [...porPeriodo.values()]
            .sort((a, b) => a.data - b.data)
            .map(p => ({
                rotulo: this.rotuloPeriodo(p.data, granularidade),
                totalFinalizadas: p.totalFinalizadas,
                tmsHoras: p.contagemHoras > 0 ? p.somaHoras / p.contagemHoras : null,
                indiceReaberturaPercentual: p.totalFinalizadas > 0
                    ? (p.reabertas / p.totalFinalizadas) * 100
                    : 0,
                indiceReagendamentoPercentual: p.totalFinalizadas > 0
                    ? (p.reagendadas / p.totalFinalizadas) * 100
                    : 0
            }));

        return { granularidade, pontos };
    },

    escolherGranularidade(pontos) {
        // Loop manual em vez de Math.min/max(...array): array pode ter
        // dezenas de milhares de pontos (ano inteiro) e o spread operator
        // estoura a pilha de chamadas do JS nesse tamanho.
        let min = pontos[0].data;
        let max = pontos[0].data;

        for (const ponto of pontos) {
            if (ponto.data < min) min = ponto.data;
            if (ponto.data > max) max = ponto.data;
        }

        const dias = (max - min) / 86400000;

        if (dias <= 31) return "dia";
        if (dias <= 180) return "semana";
        return "mes";
    },

    chavePeriodo(data, granularidade) {
        if (granularidade === "dia") {
            return `${data.getFullYear()}-${data.getMonth()}-${data.getDate()}`;
        }

        if (granularidade === "semana") {
            const inicioSemana = new Date(data);
            inicioSemana.setDate(data.getDate() - data.getDay());
            return `${inicioSemana.getFullYear()}-${inicioSemana.getMonth()}-${inicioSemana.getDate()}`;
        }

        return `${data.getFullYear()}-${data.getMonth()}`;
    },

    rotuloPeriodo(data, granularidade) {
        if (granularidade === "dia") {
            return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
        }

        if (granularidade === "semana") {
            return `Sem. ${data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`;
        }

        return data.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
    },

    /** TMS médio por técnico (segmentado) — ranking de velocidade, não de volume. */
    calcularTmsPorTecnico(ordens) {
        return this.calcularFichasTecnicos(ordens)
            .filter(ficha => ficha.tmsHoras !== null)
            .map(ficha => ({ rotulo: ficha.nome, valor: Math.round(ficha.tmsHoras * 10) / 10 }))
            .sort((a, b) => a.valor - b.valor);
    },

    /** TMA médio por técnico (segmentado) — só o tempo de mão na massa. */
    calcularTmaPorTecnico(ordens) {
        return this.calcularFichasTecnicos(ordens)
            .filter(ficha => ficha.tmaHoras !== null)
            .map(ficha => ({ rotulo: ficha.nome, valor: Math.round(ficha.tmaHoras * 10) / 10 }))
            .sort((a, b) => a.valor - b.valor);
    }

};
