/**
 * ==========================================================
 * Filtro Engine
 * ==========================================================
 * Filtro Global de verdade: recorta APP.dados.ordens por período,
 * assunto, cidade, bairro, operador, setor ou diagnóstico — e essa
 * mesma fatia é o que Dashboard, Auditoria, Técnicos e Indicadores
 * usam pra calcular/exibir (Alertas é a única exceção — ver
 * js/ui/alertas.js).
 *
 * Período, operador, setor e diagnóstico são todos amarrados ao
 * FECHAMENTO da OS (ver ultimoFechamentoDaOrdem): "período" é a data
 * de finalização (não a de abertura), e "operador" é quem finalizou
 * (não qualquer um que só abriu, assumiu ou movimentou a OS no meio
 * do caminho) — mesma regra já usada em setor/diagnóstico. É por isso
 * que reagendamentos e deslocamentos abandonados (calculados em cima
 * do resultado deste filtro, ver IndicatorEngine) respeitam o Filtro
 * Global: a OS só entra nesse conjunto se o SEU FECHAMENTO bater com
 * os critérios — o que rolou antes dele (reagendamento por outro
 * operador, deslocamento abandonado por outro operador) continua
 * fazendo parte da mesma OS.
 *
 * "diagnosticosOcultos" é o único campo com lógica INVERTIDA (lista
 * negra): os demais são lista branca (nada selecionado = mostra tudo,
 * selecionar restringe); esse aqui começa com tudo visível e marcar um
 * diagnóstico ESCONDE as OS com aquele diagnóstico no fechamento — ver
 * js/ui/filtroperiodo.js.
 *
 * Não confundir com o filtro de "Assuntos que Contam para
 * Recorrência" (js/services/filtroglobal.js) — aquele decide o
 * que entra no CÁLCULO de recorrência; este decide o que
 * aparece nas TELAS.
 */

const FiltroEngine = {

    ordensFiltradas() {
        return this.aplicar(APP.dados.ordens, APP.filtrosGlobais);
    },

    aplicar(ordens, filtros) {
        if (!this.temFiltroAtivo(filtros)) return ordens;

        const filtradas = new Map();

        for (const [id, ordem] of ordens) {
            if (this.combina(ordem, filtros)) {
                filtradas.set(id, ordem);
            }
        }

        return filtradas;
    },

    CAMPOS_MULTIPLOS: ["assuntos", "cidades", "bairros", "operadores", "setores", "diagnosticosOcultos"],

    temFiltroAtivo(filtros) {
        if (!filtros) return false;
        if (filtros.dataInicio || filtros.dataFim) return true;
        return this.CAMPOS_MULTIPLOS.some(campo => (filtros[campo]?.length ?? 0) > 0);
    },

    contarFiltrosAtivos(filtros) {
        if (!filtros) return 0;

        let total = 0;
        if (filtros.dataInicio || filtros.dataFim) total++;
        for (const campo of this.CAMPOS_MULTIPLOS) {
            total += filtros[campo]?.length ?? 0;
        }
        return total;
    },

    combina(ordem, filtros) {
        // Período é sobre a data de FINALIZAÇÃO da OS, não a de abertura —
        // uma OS aberta fora do período mas finalizada dentro dele deve
        // entrar; uma aberta dentro mas finalizada fora, não.
        if (filtros.dataInicio || filtros.dataFim) {
            const dataFinalizacao = this.dataFinalizacaoDaOrdem(ordem);
            if (filtros.dataInicio && (!dataFinalizacao || dataFinalizacao < filtros.dataInicio)) return false;
            if (filtros.dataFim && (!dataFinalizacao || dataFinalizacao > filtros.dataFim)) return false;
        }

        if (!this.algumBate(filtros.assuntos, ordem.assunto)) return false;
        if (!this.algumBate(filtros.cidades, ordem.cidade)) return false;
        if (!this.algumBate(filtros.bairros, ordem.bairro)) return false;

        if (filtros.operadores?.length && !filtros.operadores.some(o => this.fechamentoEhDoOperador(ordem, o))) return false;
        if (filtros.setores?.length && !filtros.setores.some(s => this.fechamentoEhDoSetor(ordem, s))) return false;
        if (filtros.diagnosticosOcultos?.length && this.diagnosticoDoFechamentoEstaOculto(ordem, filtros.diagnosticosOcultos)) return false;

        return true;
    },

    /** Sem seleção nesse campo (array vazio) = não filtra por ele. */
    algumBate(valoresSelecionados, valorDaOrdem) {
        if (!valoresSelecionados || valoresSelecionados.length === 0) return true;
        const alvo = normalizarTexto(valorDaOrdem ?? "");
        return valoresSelecionados.some(v => normalizarTexto(v) === alvo);
    },

    /** Data de finalização da OS = data da movimentação de Fechamento mais recente, ou null se nunca fechou. */
    dataFinalizacaoDaOrdem(ordem) {
        return this.ultimoFechamentoDaOrdem(ordem)?.data ?? null;
    },

    /**
     * Operador filtra igual setor: não é "qualquer movimentação bate", é
     * só quem FECHOU a OS — quem só abriu, assumiu ou movimentou ela no
     * meio do caminho não conta.
     */
    fechamentoEhDoOperador(ordem, nomeOperadorAlvo) {
        const alvo = normalizarTexto(nomeOperadorAlvo);
        const fechamento = this.ultimoFechamentoDaOrdem(ordem);

        if (!fechamento || fechamento.operador === null || fechamento.operador === undefined) return false;

        const nome = AuditEngine.resolverReferencia(APP.referencias.operadores, fechamento.operador, CONFIG_BASE.operadores.nome);
        return normalizarTexto(nome ?? "") === alvo;
    },

    /**
     * Setor é igual operador (fechamentoEhDoOperador): só o operador que
     * FECHOU a OS conta — um dispatcher de outro setor que só agendou ou
     * alterou a OS no meio do caminho não conta. Setor é atributo do
     * OPERADOR na Base (coluna ao lado do nome), não da movimentação —
     * reaproveita resolverReferencia trocando só a coluna lida (nome →
     * setor).
     */
    fechamentoEhDoSetor(ordem, nomeSetorAlvo) {
        const alvo = normalizarTexto(nomeSetorAlvo);
        const fechamento = this.ultimoFechamentoDaOrdem(ordem);

        if (!fechamento || fechamento.operador === null || fechamento.operador === undefined) return false;

        const setor = AuditEngine.resolverReferencia(APP.referencias.operadores, fechamento.operador, CONFIG_BASE.operadores.setor);
        return normalizarTexto(setor ?? "") === alvo;
    },

    /**
     * Diagnóstico só existe de verdade no FECHAMENTO da OS (outras
     * movimentações costumam trazer o campo vazio) — mesma regra já
     * usada em IndicatorEngine.calcularDiagnosticosMaisUsados. OS sem
     * diagnóstico nenhum no fechamento nunca é escondida por aqui (não
     * dá pra saber se ela "é" um dos diagnósticos ocultos).
     */
    diagnosticoDoFechamentoEstaOculto(ordem, diagnosticosOcultos) {
        const fechamento = this.ultimoFechamentoDaOrdem(ordem);
        if (!fechamento || fechamento.diagnostico === null || fechamento.diagnostico === undefined || fechamento.diagnostico === "") {
            return false;
        }

        const nome = AuditEngine.resolverReferencia(APP.referencias.diagnosticos, fechamento.diagnostico, CONFIG_BASE.diagnosticos.nome);
        if (!nome) return false;

        const alvo = normalizarTexto(nome);
        return diagnosticosOcultos.some(d => normalizarTexto(d) === alvo);
    },

    /** Movimentação de Fechamento mais recente da OS, ou null se nunca fechou. */
    ultimoFechamentoDaOrdem(ordem) {
        const alvoFechamento = normalizarTexto(IndicatorEngine.NOME_EVENTO_FECHAMENTO);
        let ultimoFechamento = null;

        for (const mov of ordem.movimentacoes) {
            if (mov.evento === null || mov.evento === undefined) continue;
            const nome = AuditEngine.resolverReferencia(APP.referencias.eventos, mov.evento, CONFIG_BASE.eventos.nome);
            if (normalizarTexto(nome ?? "") !== alvoFechamento) continue;

            if (!ultimoFechamento || (mov.data && ultimoFechamento.data && mov.data > ultimoFechamento.data)) {
                ultimoFechamento = mov;
            }
        }

        return ultimoFechamento;
    },

    /**
     * Valores distintos existentes nos dados, pra popular os <select>
     * do modal de filtro — evita deixar escolher um valor que não
     * existe em nenhuma OS.
     */
    coletarOpcoes(ordens) {
        const assuntos = new Set();
        const cidades = new Set();
        const bairros = new Set();
        const operadores = new Set();
        const setores = new Set();
        const diagnosticos = new Set();

        for (const ordem of ordens.values()) {
            if (ordem.assunto) assuntos.add(ordem.assunto);
            if (ordem.cidade) cidades.add(ordem.cidade);
            if (ordem.bairro) bairros.add(ordem.bairro);

            // Operador, setor e diagnóstico só consideram o FECHAMENTO da
            // OS — mesma regra usada no filtro em si (fechamentoEhDoOperador
            // / fechamentoEhDoSetor / diagnosticoDoFechamentoEstaOculto),
            // senão a lista de opções mostraria valores que não existem em
            // nenhum fechamento (ex.: técnico que só agenda, nunca finaliza).
            const fechamento = this.ultimoFechamentoDaOrdem(ordem);

            if (fechamento?.operador !== null && fechamento?.operador !== undefined) {
                const nome = AuditEngine.resolverReferencia(APP.referencias.operadores, fechamento.operador, CONFIG_BASE.operadores.nome);
                if (nome) operadores.add(nome);

                const setor = AuditEngine.resolverReferencia(APP.referencias.operadores, fechamento.operador, CONFIG_BASE.operadores.setor);
                if (setor) setores.add(setor);
            }

            if (fechamento?.diagnostico !== null && fechamento?.diagnostico !== undefined && fechamento?.diagnostico !== "") {
                const diagnostico = AuditEngine.resolverReferencia(APP.referencias.diagnosticos, fechamento.diagnostico, CONFIG_BASE.diagnosticos.nome);
                if (diagnostico) diagnosticos.add(diagnostico);
            }
        }

        const ordenar = conjunto => [...conjunto].sort((a, b) => String(a).localeCompare(String(b), "pt-BR"));

        return {
            assuntos: ordenar(assuntos),
            cidades: ordenar(cidades),
            bairros: ordenar(bairros),
            operadores: ordenar(operadores),
            setores: ordenar(setores),
            diagnosticos: ordenar(diagnosticos)
        };
    }

};
