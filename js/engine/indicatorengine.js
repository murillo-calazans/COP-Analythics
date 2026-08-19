/**
 * ==========================================================
 * Indicator Engine
 * ==========================================================
 * Calcula indicadores operacionais em cima de APP.dados.ordens.
 * Recorrência de cliente usa "login" (não "cliente", que é
 * texto livre e pode variar na digitação) como chave, já que um
 * cliente pode ter vários logins mas cada login é único.
 *
 * Quatro métricas de tempo, todas em horas, medindo a equipe técnica —
 * todas baseadas no STATUS da movimentação (coluna STATUS da planilha),
 * não no evento:
 *
 *   TMR — Tempo Médio de Resposta: DATA/HORA ABERTURA até a data do
 *         1º status "Agendada" da OS — sempre o primeiro que aparecer,
 *         independente de reagendamentos depois (o que importa é a
 *         velocidade da empresa em organizar a primeira visita).
 *
 *   TMS — Tempo Médio de Solução: para cada status "Deslocamento",
 *         procura o status "Finalizada" seguinte DO MESMO OPERADOR, NO
 *         MESMO DIA — a diferença entre as duas datas (coluna DATA) é
 *         um segmento. Uma OS pode gerar mais de um segmento (visitas
 *         em dias diferentes, inclusive depois de reaberta); o TMS
 *         da OS é a soma desses segmentos. Deslocamento sem uma
 *         Finalizada do mesmo operador no mesmo dia depois (abandonado
 *         — outro operador reorganizou a visita antes de concluir) não
 *         forma segmento nenhum, fica de fora da conta.
 *
 *   TMA — Tempo Médio de Atendimento: igual ao TMS, mas a partir do
 *         status "Execução" em vez de "Deslocamento" — só o trabalho
 *         em si, sem contar o deslocamento até o local. OS que nunca
 *         teve Deslocamento nem Execução (fechada sem passar por
 *         campo) não entra nem em TMS nem em TMA.
 *
 *   TME — Tempo Médio de Espera: DATA/HORA ABERTURA até a data do
 *         status "Finalizada" — visão do cliente, quanto tempo esperou
 *         no total. OS que teve Reabertura em algum momento (o técnico
 *         fechou e reabrimos pra acertar diagnóstico, etc. — não é um
 *         atendimento "limpo") fica de fora inteira, não só o desconto
 *         do tempo extra.
 *
 * TMS/TMA/TMR/TME não têm filtro próprio de assunto — pra restringir,
 * use o Filtro Global (ele já corta as OS antes de qualquer cálculo
 * aqui). Recorrência é a única métrica com filtro de assunto separado
 * (Configurações > Assuntos que Contam para Recorrência), de propósito
 * independente do Filtro Global.
 *
 * Uma OS sem nenhuma movimentação de Fechamento é considerada ainda
 * em aberto e fica fora de TMS/TMA/TME.
 */

const IndicatorEngine = {

    LIMITE_DIAS_RECORRENCIA: 90,
    LIMITE_QTD_RECORRENCIA: 2,

    // Assunto que identifica um cliente como cancelado (ver
    // encontrarCancelamentoCliente) — de propósito FORA da lista branca
    // de assuntosIncluidos da recorrência normal: cancelamento não é um
    // "problema recorrente" a resolver, é o desfecho, então a busca por
    // ele varre TODAS as OS do cliente (agruparTodasPorLogin), não só as
    // que passam pelo filtro de assunto.
    ASSUNTO_CANCELAMENTO: "CANCELAMENTO (350)",

    NOME_EVENTO_FECHAMENTO: "Fechamento",
    NOME_EVENTO_REABERTURA: "Reabertura",
    NOME_EVENTO_REAGENDAMENTO: "Reagendar",
    NOME_EVENTO_AGENDAMENTO: "Agendamento",

    // TMS/TMA/TMR são baseados no STATUS da movimentação (coluna STATUS
    // da planilha), não no evento — ver cabeçalho do arquivo.
    STATUS_DESLOCAMENTO: "Deslocamento",
    STATUS_EM_EXECUCAO: "Execução",
    STATUS_FINALIZADA: "Finalizada",
    STATUS_AGENDADA: "Agendada",
    // Sinal explícito do técnico de que não vai concluir aquele
    // deslocamento/execução (pediu reagendamento) — ver analisarEventosOS.
    STATUS_AGUARDANDO_AGENDAMENTO: "Aguardando agendamento",

    calcularRecorrencia(ordens) {
        // Idempotente: pode ser chamado de novo (ex.: depois de mudar o
        // Filtro Global) sem deixar alertas velhos presos numa OS que já
        // não se qualifica mais.
        this.limparAlertasRecorrencia(ordens);

        const analise = this.analisarEventosDeTodas(ordens);
        const dataReferencia = this.encontrarDataMaisRecente(ordens);
        const porLogin = this.agruparPorLogin(ordens, analise);
        const todasPorLogin = this.agruparTodasPorLogin(ordens);
        const recorrentes = new Map();

        // Ativos: exige o padrão de recorrência (LIMITE_QTD_RECORRENCIA+
        // OS do mesmo tipo em LIMITE_DIAS_RECORRENCIA dias).
        for (const [login, listaOrdens] of porLogin) {
            const recentes = listaOrdens.filter(ordem =>
                this.dentroDoLimite(ordem.dataAbertura, dataReferencia)
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

        // Cancelados: TODO cliente com uma OS de Cancelamento entra aqui,
        // independente de ter batido o padrão de recorrência acima —
        // mostra as OS que ele teve (mesmo que sejam menos que o limite),
        // pra sempre dar pra ver o contexto de quem cancelou. Se o login
        // também for recorrente (loop de cima), esse registro substitui
        // o de "ativo" — cliente cancelado não deve aparecer como ativo.
        for (const [login, todasOrdensCliente] of todasPorLogin) {
            const cancelamento = this.encontrarCancelamentoCliente(todasOrdensCliente);
            if (!cancelamento) continue;

            const listaOrdens = porLogin.get(login) ?? [];
            const recentes = listaOrdens.filter(ordem =>
                this.dentroDoLimite(ordem.dataAbertura, dataReferencia)
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

    /**
     * Entre TODAS as OS de um cliente (sem o filtro de assunto da
     * recorrência — ver ASSUNTO_CANCELAMENTO), acha a OS de cancelamento
     * mais recente (se houver) e a última OS de verdade aberta antes
     * dela, pra dar contexto do que motivou o cliente a cancelar.
     */
    encontrarCancelamentoCliente(todasOrdensCliente) {
        const alvo = normalizarTexto(this.ASSUNTO_CANCELAMENTO);

        const cancelamentos = todasOrdensCliente
            .filter(ordem => ordem.assunto && normalizarTexto(ordem.assunto) === alvo && ordem.dataAbertura)
            .sort((a, b) => b.dataAbertura - a.dataAbertura);

        const ordemCancelamento = cancelamentos[0];
        if (!ordemCancelamento) return null;

        const anteriores = todasOrdensCliente
            .filter(ordem =>
                ordem.id !== ordemCancelamento.id &&
                ordem.dataAbertura &&
                ordem.dataAbertura < ordemCancelamento.dataAbertura
            )
            .sort((a, b) => b.dataAbertura - a.dataAbertura);

        return {
            ordemCancelamento: { id: ordemCancelamento.id, dataAbertura: ordemCancelamento.dataAbertura },
            ultimaOrdemAntes: anteriores[0]
                ? { id: anteriores[0].id, assunto: anteriores[0].assunto, dataAbertura: anteriores[0].dataAbertura }
                : null
        };
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

    /**
     * Quantidade de OS abertas por mês, dentro do mesmo conjunto que já
     * aparece na ficha do cliente (ordensDetalhes) — mais informativo
     * que só o total, mostra em quais meses a recorrência se concentrou.
     * Mais recente primeiro.
     */
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

    agruparPorLogin(ordens, analise) {
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

            // Diagnóstico excluído da recorrência (Configurações) — ex.:
            // "Verificação sem problema encontrado" não deveria contar
            // como visita recorrente de verdade. Lista negra própria,
            // separada da usada no TMS/TMA (ver diagnosticoExcluidoDoTempo).
            const info = analise.get(ordem.id);
            if (this.diagnosticoExcluidoDaRecorrencia(info?.ultimoFechamento)) continue;

            if (!porLogin.has(ordem.login)) {
                porLogin.set(ordem.login, []);
            }
            porLogin.get(ordem.login).push(ordem);
        }

        return porLogin;
    },

    /**
     * Igual agruparPorLogin, mas SEM o filtro de assunto — usado só pra
     * achar a OS de cancelamento de um cliente (encontrarCancelamentoCliente),
     * já que "CANCELAMENTO (350)" nunca vai estar na lista branca de
     * assuntos recorrentes.
     */
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

    /** Mesmo dia de calendário (ano/mês/dia) — ignora hora. */
    mesmoDia(a, b) {
        return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    },

    /**
     * TMS/TMA são baseados no STATUS (não no evento) — ver cabeçalho do
     * arquivo. Passa pelas movimentações em ordem cronológica guardando,
     * por OPERADOR, o último status "Deslocamento"/"Execução" ainda sem
     * uma "Finalizada" correspondente; quando esse mesmo operador finaliza
     * no MESMO DIA, fecha um segmento. Um novo "Agendamento" com algum
     * desses ainda pendentes (de qualquer operador) descarta tudo sem
     * virar segmento — é um deslocamento/execução abandonado, outro
     * operador reorganizou a visita antes do técnico concluir. EXCETO se
     * o técnico avisou primeiro (status "Aguardando agendamento") — aí é
     * fluxo normal, não abandono: mesmo tratamento de limpar sem contar
     * que a "Finalizada" já recebe.
     */
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
        let ultimoEncerramento = null; // Fechamento OU Reagendar — usado pro índice de reabertura/reagendamento
        let primeiroAgendamento = null; // 1º status "Agendada" — fim do TMR
        let temReabertura = false;
        let temReagendamento = false;

        const segmentosSolucao = []; // {operador, inicio, fim} — pares Deslocamento -> Finalizada (TMS)
        const segmentosAtendimento = []; // {operador, inicio, fim} — pares Execução -> Finalizada (TMA)
        const deslocamentosAbandonados = []; // {operador, data, tipo}

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
                }
                if (ehFechamento || ehReagendamento) {
                    if (!ultimoEncerramento || (mov.data && ultimoEncerramento.data && mov.data > ultimoEncerramento.data)) {
                        ultimoEncerramento = mov;
                    }
                }
                if (nomeEventoNormalizado === alvoReabertura) temReabertura = true;
                if (ehReagendamento) temReagendamento = true;
            }

            // TMR — 1º status "Agendada", sempre o primeiro (reagendamentos
            // depois não mudam isso).
            if (statusNormalizado === alvoStatusAgendada) {
                if (!primeiroAgendamento || (mov.data && primeiroAgendamento.data && mov.data < primeiroAgendamento.data)) {
                    primeiroAgendamento = mov;
                }

                // Novo Agendamento (não reagendamento do próprio técnico) com
                // deslocamento/execução pendente = abandono.
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
                // OS encerrada nesse ciclo — descarta o que ainda estava
                // pendente (de qualquer operador que não bateu o par).
                deslocamentoAbertoPorOperador.clear();
                execucaoAbertaPorOperador.clear();
            }

            // Técnico sinalizou que não vai concluir agora (pediu
            // reagendamento) ANTES de outro operador reorganizar a visita
            // — não é abandono, é fluxo normal. Limpa sem registrar em
            // deslocamentosAbandonados (diferente do que acontece lá
            // embaixo quando um novo Agendamento pega algo AINDA pendente,
            // sem ter passado por aqui).
            if (statusNormalizado === alvoStatusAguardandoAgendamento) {
                deslocamentoAbertoPorOperador.clear();
                execucaoAbertaPorOperador.clear();
            }
        }

        // Baseado no diagnóstico do fechamento FINAL (o mais recente, já
        // resolvido acima) — uma OS cancelada/aberta errada não representa
        // trabalho real de campo, então nem ela nem o técnico que a fechou
        // devem carregar esse tempo no TMS/TMA. Não afeta OS finalizadas
        // nem ranking — só a conta de tempo (ver calcularTMS/calcularFichasTecnicos).
        const excluidoDoTempo = this.diagnosticoExcluidoDoTempo(ultimoFechamento);

        return {
            ultimoFechamento, ultimoEncerramento, primeiroAgendamento,
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

    /**
     * Igual diagnosticoExcluidoDoTempo, mas pra recorrência (Alertas) —
     * lista negra própria e independente (Configurações > Diagnósticos
     * Excluídos da Recorrência). Ex.: "Verificação sem problema
     * encontrado" no fechamento não deveria contar como uma visita
     * recorrente de verdade. Lista vazia = nada excluído (padrão).
     */
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

    /** Soma, em horas, a duração de uma lista de segmentos {inicio, fim} (Date). */
    somarHorasSegmentos(segmentos) {
        if (!segmentos || segmentos.length === 0) return null;
        let total = 0;
        for (const seg of segmentos) {
            total += (seg.fim - seg.inicio) / 3600000;
        }
        return total;
    },

    /**
     * Agrupa uma lista de segmentos {operador, inicio, fim} pelo próprio
     * operador do segmento, somando a duração de cada um — usado na
     * ficha por técnico (calcularFichasTecnicos), já que dentro de uma
     * mesma OS segmentos diferentes podem ter operadores diferentes (ver
     * analisarEventosOS). Retorna Map<código do operador, horas somadas>.
     */
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

    /**
     * TMS — Tempo Médio de Solução, em horas: média da soma dos segmentos
     * Deslocamento → Finalizada de cada OS (mesmo operador, mesmo dia —
     * ver analisarEventosOS). OS sem nenhum segmento válido (nunca teve
     * Deslocamento, ou teve mas ninguém finalizou no mesmo dia) fica fora
     * da conta — assim como OS cancelada/aberta errada (diagnóstico na
     * lista configurável de exclusão, ver diagnosticoExcluidoDoTempo).
     */
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

    /**
     * TMA — Tempo Médio de Atendimento, em horas: igual ao TMS, mas com
     * segmentos Execução → Finalizada (mesmo operador, mesmo dia) — só o
     * trabalho em si, sem contar o deslocamento até o local.
     */
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

    /**
     * TMR — Tempo Médio de Resposta, em horas: da abertura da OS até o
     * 1º Agendamento. Mede a velocidade da empresa em agendar uma visita,
     * não a atuação do técnico em campo (por isso não entra na ficha
     * individual dele). OS sem Agendamento algum fica fora da conta.
     * Pra restringir a assuntos específicos, use o Filtro Global — TMR
     * (assim como TMS/TMA) já é calculado só em cima do que ele deixa
     * passar.
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
     * tudo conta, porque tudo isso é tempo real de espera do cliente). OS
     * com Reabertura em algum momento fica de fora inteira — não é um
     * atendimento "limpo" (fechado, reaberto pra acertar diagnóstico etc.).
     */
    calcularTME(ordens, analise) {
        let somaHoras = 0;
        let contagem = 0;

        for (const ordem of ordens.values()) {
            const info = analise.get(ordem.id);
            if (!ordem.dataAbertura || !info?.ultimoFechamento?.data) continue;
            if (info.temReabertura) continue;

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

    /** Quantidade de reagendamentos por técnico (quem executou a movimentação Reagendar). */
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
        const analise = this.analisarEventosDeTodas(ordens);
        const porLogin = this.agruparPorLogin(ordens, analise);
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

        // Passo 1: finalizadas/reabertura/diagnóstico/solo-dupla ficam com
        // quem de fato FECHOU a OS — isso não depende de segmento algum.
        for (const ordem of ordens.values()) {
            const info = analise.get(ordem.id);
            if (!info?.ultimoFechamento) continue;

            const codigoTecnico = info.ultimoFechamento.operador;
            if (codigoTecnico === null || codigoTecnico === undefined) continue;

            const nome = AuditEngine.resolverReferencia(
                APP.referencias.operadores, codigoTecnico, CONFIG_BASE.operadores.nome
            );

            const ficha = obterFicha(nome);
            ficha.totalFinalizadas++;
            ficha.ordensFinalizadas.push(ordem.id);

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

        // Passo 2: TMS/TMA ficam com quem de fato fez CADA segmento
        // (Deslocamento->Finalizada / Execução->Finalizada) — dentro da
        // mesma OS, segmentos diferentes podem ter operadores diferentes
        // (ver analisarEventosOS), então um técnico que nunca fechou uma
        // OS mas contribuiu um segmento válido ainda aparece aqui, com
        // totalFinalizadas: 0. OS cancelada/aberta errada (excluidoDoTempo)
        // não vira tempo nenhum pra ninguém — nem soma nem detalhe.
        for (const ordem of ordens.values()) {
            const info = analise.get(ordem.id);
            if (!info || info.excluidoDoTempo) continue;

            for (const [codigoOperador, horas] of this.agruparSegmentosPorOperador(info.segmentosSolucao)) {
                const nome = AuditEngine.resolverReferencia(
                    APP.referencias.operadores, codigoOperador, CONFIG_BASE.operadores.nome
                );
                const ficha = obterFicha(nome);
                ficha.somaHorasTms += horas;
                ficha.contagemHorasTms++;
                ficha.tmsDetalhes.push({ ordemId: ordem.id, assunto: ordem.assunto, horas });
            }

            for (const [codigoOperador, horas] of this.agruparSegmentosPorOperador(info.segmentosAtendimento)) {
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

    /**
     * Visão mensal (Jan até o último mês com dado) das OS finalizadas
     * naquele ano: volume, TMS/TMA/TMR/TME médios, reaberturas (contagem)
     * e técnicos ativos — todos agrupados pelo mês em que a OS foi
     * FECHADA (não abertura nem agendamento), pra ficar consistente entre
     * as métricas. Ano de referência é o ano da finalização mais recente
     * nos dados (ou, sem nenhuma finalizada, o da abertura mais recente).
     * Só entram OS com Fechamento — igual ao resto do sistema.
     */
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
            if (!info?.ultimoFechamento?.data) continue;

            const dataFechamento = info.ultimoFechamento.data;
            if (dataFechamento.getFullYear() !== ano) continue;

            const mes = dataFechamento.getMonth();
            if (mes > ultimoMes) continue;
            const bucket = buckets[mes];

            bucket.totalFinalizadas++;
            if (info.temReabertura) bucket.reabertas++;

            if (info.ultimoFechamento.operador !== null && info.ultimoFechamento.operador !== undefined) {
                bucket.tecnicosAtivos.add(String(info.ultimoFechamento.operador));
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

            // TME ignora OS com Reabertura em algum momento — mesma regra de calcularTME.
            if (ordem.dataAbertura && !info.temReabertura) {
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
    },

    // Cidade/setor com poucas OS distorce a média (1 OS rápida "vence"
    // fácil) — exige um mínimo pra entrar no ranking de melhores tempos.
    MINIMO_OS_RANKING_CIDADE: 3,

    /**
     * Agrupa (por cidade, setor, etc. — quem chama decide via
     * calcularGrupo) um valor calculado por OS (calcularHorasDaOS devolve
     * horas ou null), tira a média de cada grupo e devolve os "top" com o
     * MENOR tempo primeiro (melhores) — ou o MAIOR primeiro (piores),
     * se "piores" for true — pro relatório conseguir apontar tanto quem
     * está indo bem quanto quem precisa de atenção. Grupo com menos de
     * MINIMO_OS_RANKING_CIDADE OS no período fica de fora, pra não deixar
     * 1 OS isolada "vencer" (ou "perder") o ranking por acaso.
     */
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

    // Setor é atributo do OPERADOR (Base.xlsx), não da OS — usa quem
    // fechou (ultimoFechamento.operador), igual o Filtro Global já faz
    // (ver FiltroEngine.fechamentoEhDoSetor).
    agregarPorSetor(ordens, analise, calcularHorasDaOS, top, piores = false) {
        const calcularGrupo = (ordem, info) => {
            if (info.ultimoFechamento.operador === null || info.ultimoFechamento.operador === undefined) return null;
            return AuditEngine.resolverReferencia(
                APP.referencias.operadores, info.ultimoFechamento.operador, CONFIG_BASE.operadores.setor
            );
        };
        return this.agregarPorGrupo(ordens, analise, calcularGrupo, calcularHorasDaOS, top, piores);
    },

    /** Cidades com o melhor (ou, com piores=true, o pior) TMS médio (segmentado, visão do técnico). */
    calcularTmsPorCidade(ordens, top = 5, piores = false) {
        const analise = this.analisarEventosDeTodas(ordens);
        return this.agregarPorCidade(ordens, analise, (ordem, info) => {
            if (info.excluidoDoTempo) return null;
            return this.somarHorasSegmentos(info.segmentosSolucao);
        }, top, piores);
    },

    /** Cidades com o melhor (ou, com piores=true, o pior) TMA médio (segmentado, visão do técnico). */
    calcularTmaPorCidade(ordens, top = 5, piores = false) {
        const analise = this.analisarEventosDeTodas(ordens);
        return this.agregarPorCidade(ordens, analise, (ordem, info) => {
            if (info.excluidoDoTempo) return null;
            return this.somarHorasSegmentos(info.segmentosAtendimento);
        }, top, piores);
    },

    /** Cidades com o melhor (ou, com piores=true, o pior) TMR médio (abertura até 1º agendamento). */
    calcularTmrPorCidade(ordens, top = 5, piores = false) {
        const analise = this.analisarEventosDeTodas(ordens);
        return this.agregarPorCidade(ordens, analise, (ordem, info) => {
            if (!ordem.dataAbertura || !info.primeiroAgendamento?.data) return null;
            const horas = (info.primeiroAgendamento.data - ordem.dataAbertura) / 3600000;
            return horas >= 0 ? horas : null;
        }, top, piores);
    },

    /** Setores com o melhor (ou, com piores=true, o pior) TMS médio (segmentado, visão do técnico). */
    calcularTmsPorSetor(ordens, top = 5, piores = false) {
        const analise = this.analisarEventosDeTodas(ordens);
        return this.agregarPorSetor(ordens, analise, (ordem, info) => {
            if (info.excluidoDoTempo) return null;
            return this.somarHorasSegmentos(info.segmentosSolucao);
        }, top, piores);
    },

    /** Setores com o melhor (ou, com piores=true, o pior) TMA médio (segmentado, visão do técnico). */
    calcularTmaPorSetor(ordens, top = 5, piores = false) {
        const analise = this.analisarEventosDeTodas(ordens);
        return this.agregarPorSetor(ordens, analise, (ordem, info) => {
            if (info.excluidoDoTempo) return null;
            return this.somarHorasSegmentos(info.segmentosAtendimento);
        }, top, piores);
    },

    /** Setores com o melhor (ou, com piores=true, o pior) TMR médio (abertura até 1º agendamento). */
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

    // Diagnóstico só existe de verdade no FECHAMENTO da OS (mesma regra
    // usada em calcularDiagnosticosMaisUsados/coletarLinhasDetalheOS).
    agregarPorDiagnostico(ordens, analise, calcularHorasDaOS, top, piores = false) {
        const calcularGrupo = (ordem, info) => {
            if (info.ultimoFechamento.diagnostico === null || info.ultimoFechamento.diagnostico === undefined) return null;
            return AuditEngine.resolverReferencia(
                APP.referencias.diagnosticos, info.ultimoFechamento.diagnostico, CONFIG_BASE.diagnosticos.nome
            );
        };
        return this.agregarPorGrupo(ordens, analise, calcularGrupo, calcularHorasDaOS, top, piores);
    },

    /** Assuntos com o melhor (ou, com piores=true, o pior) TMS médio (segmentado, visão do técnico). */
    calcularTmsPorAssunto(ordens, top = 5, piores = false) {
        const analise = this.analisarEventosDeTodas(ordens);
        return this.agregarPorAssunto(ordens, analise, (ordem, info) => {
            if (info.excluidoDoTempo) return null;
            return this.somarHorasSegmentos(info.segmentosSolucao);
        }, top, piores);
    },

    /** Assuntos com o melhor (ou, com piores=true, o pior) TMA médio (segmentado, visão do técnico). */
    calcularTmaPorAssunto(ordens, top = 5, piores = false) {
        const analise = this.analisarEventosDeTodas(ordens);
        return this.agregarPorAssunto(ordens, analise, (ordem, info) => {
            if (info.excluidoDoTempo) return null;
            return this.somarHorasSegmentos(info.segmentosAtendimento);
        }, top, piores);
    },

    /** Assuntos com o melhor (ou, com piores=true, o pior) TMR médio (abertura até 1º agendamento). */
    calcularTmrPorAssunto(ordens, top = 5, piores = false) {
        const analise = this.analisarEventosDeTodas(ordens);
        return this.agregarPorAssunto(ordens, analise, (ordem, info) => {
            if (!ordem.dataAbertura || !info.primeiroAgendamento?.data) return null;
            const horas = (info.primeiroAgendamento.data - ordem.dataAbertura) / 3600000;
            return horas >= 0 ? horas : null;
        }, top, piores);
    },

    /** Assuntos com o melhor (ou, com piores=true, o pior) TME médio (abertura até fechamento, sem OS reaberta). */
    calcularTmePorAssunto(ordens, top = 5, piores = false) {
        const analise = this.analisarEventosDeTodas(ordens);
        return this.agregarPorAssunto(ordens, analise, (ordem, info) => {
            if (!ordem.dataAbertura || !info.ultimoFechamento?.data || info.temReabertura) return null;
            const horas = (info.ultimoFechamento.data - ordem.dataAbertura) / 3600000;
            return horas >= 0 ? horas : null;
        }, top, piores);
    },

    /** Diagnósticos (do fechamento) com o melhor (ou, com piores=true, o pior) TMS médio. */
    calcularTmsPorDiagnostico(ordens, top = 5, piores = false) {
        const analise = this.analisarEventosDeTodas(ordens);
        return this.agregarPorDiagnostico(ordens, analise, (ordem, info) => {
            if (info.excluidoDoTempo) return null;
            return this.somarHorasSegmentos(info.segmentosSolucao);
        }, top, piores);
    },

    /** Diagnósticos (do fechamento) com o melhor (ou, com piores=true, o pior) TMA médio. */
    calcularTmaPorDiagnostico(ordens, top = 5, piores = false) {
        const analise = this.analisarEventosDeTodas(ordens);
        return this.agregarPorDiagnostico(ordens, analise, (ordem, info) => {
            if (info.excluidoDoTempo) return null;
            return this.somarHorasSegmentos(info.segmentosAtendimento);
        }, top, piores);
    },

    /** Diagnósticos (do fechamento) com o melhor (ou, com piores=true, o pior) TMR médio. */
    calcularTmrPorDiagnostico(ordens, top = 5, piores = false) {
        const analise = this.analisarEventosDeTodas(ordens);
        return this.agregarPorDiagnostico(ordens, analise, (ordem, info) => {
            if (!ordem.dataAbertura || !info.primeiroAgendamento?.data) return null;
            const horas = (info.primeiroAgendamento.data - ordem.dataAbertura) / 3600000;
            return horas >= 0 ? horas : null;
        }, top, piores);
    },

    /** Diagnósticos (do fechamento) com o melhor (ou, com piores=true, o pior) TME médio. */
    calcularTmePorDiagnostico(ordens, top = 5, piores = false) {
        const analise = this.analisarEventosDeTodas(ordens);
        return this.agregarPorDiagnostico(ordens, analise, (ordem, info) => {
            if (!ordem.dataAbertura || !info.ultimoFechamento?.data || info.temReabertura) return null;
            const horas = (info.ultimoFechamento.data - ordem.dataAbertura) / 3600000;
            return horas >= 0 ? horas : null;
        }, top, piores);
    },

    /** Cidades com o melhor (ou, com piores=true, o pior) TME médio (abertura até fechamento, sem OS reaberta). */
    calcularTmePorCidade(ordens, top = 5, piores = false) {
        const analise = this.analisarEventosDeTodas(ordens);
        return this.agregarPorCidade(ordens, analise, (ordem, info) => {
            if (!ordem.dataAbertura || !info.ultimoFechamento?.data || info.temReabertura) return null;
            const horas = (info.ultimoFechamento.data - ordem.dataAbertura) / 3600000;
            return horas >= 0 ? horas : null;
        }, top, piores);
    },

    /** Setores com o melhor (ou, com piores=true, o pior) TME médio (abertura até fechamento, sem OS reaberta). */
    calcularTmePorSetor(ordens, top = 5, piores = false) {
        const analise = this.analisarEventosDeTodas(ordens);
        return this.agregarPorSetor(ordens, analise, (ordem, info) => {
            if (!ordem.dataAbertura || !info.ultimoFechamento?.data || info.temReabertura) return null;
            const horas = (info.ultimoFechamento.data - ordem.dataAbertura) / 3600000;
            return horas >= 0 ? horas : null;
        }, top, piores);
    },

    /**
     * TME médio por técnico — diferente de TMS/TMA por técnico
     * (calcularFichasTecnicos), aqui não tem segmento por operador pra
     * dividir: TME é a OS inteira (abertura até fechamento), então
     * atribui pra quem fechou, igual cidade/setor já fazem. Mostra
     * todos os técnicos com pelo menos 1 OS válida (sem corte de top N
     * nem mínimo de OS), igual TMS/TMA por técnico já fazem.
     */
    calcularTmePorTecnico(ordens) {
        const analise = this.analisarEventosDeTodas(ordens);
        const acumulado = new Map();

        for (const ordem of ordens.values()) {
            const info = analise.get(ordem.id);
            if (!ordem.dataAbertura || !info?.ultimoFechamento?.data || info.temReabertura) continue;
            if (info.ultimoFechamento.operador === null || info.ultimoFechamento.operador === undefined) continue;

            const horas = (info.ultimoFechamento.data - ordem.dataAbertura) / 3600000;
            if (horas < 0) continue;

            const nome = AuditEngine.resolverReferencia(
                APP.referencias.operadores, info.ultimoFechamento.operador, CONFIG_BASE.operadores.nome
            );

            if (!acumulado.has(nome)) acumulado.set(nome, { soma: 0, contagem: 0 });
            const registro = acumulado.get(nome);
            registro.soma += horas;
            registro.contagem++;
        }

        return [...acumulado.entries()]
            .map(([rotulo, r]) => ({ rotulo, valor: Math.round((r.soma / r.contagem) * 10) / 10 }))
            .sort((a, b) => a.valor - b.valor);
    }

};
