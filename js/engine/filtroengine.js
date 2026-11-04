const FiltroEngine = {

    ordensFiltradas() {
        return this.aplicar(APP.dados.ordens, APP.filtrosGlobais);
    },

    campoAtivo(campo) {
        return (APP.filtrosGlobais?.[campo]?.length ?? 0) > 0;
    },

    ordensFiltradasExceto(campo) {
        if (!this.campoAtivo(campo)) return this.ordensFiltradas();
        return this.aplicar(APP.dados.ordens, { ...APP.filtrosGlobais, [campo]: [] });
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

    algumBate(valoresSelecionados, valorDaOrdem) {
        if (!valoresSelecionados || valoresSelecionados.length === 0) return true;
        const alvo = normalizarTexto(valorDaOrdem ?? "");
        return valoresSelecionados.some(v => normalizarTexto(v) === alvo);
    },

    dataFinalizacaoDaOrdem(ordem) {
        return this.fechamentoEfetivoDaOrdem(ordem)?.data ?? null;
    },

    fechamentoEhDoOperador(ordem, nomeOperadorAlvo) {
        const alvo = normalizarTexto(nomeOperadorAlvo);
        const fechamento = this.fechamentoEfetivoDaOrdem(ordem);
        const nome = IndicatorEngine.nomeResponsavelFechamento(fechamento);

        if (nome === null || nome === undefined) return false;

        return normalizarTexto(nome) === alvo;
    },

    fechamentoEhDoSetor(ordem, nomeSetorAlvo) {
        const alvo = normalizarTexto(nomeSetorAlvo);
        const fechamento = this.fechamentoEfetivoDaOrdem(ordem);
        const operador = fechamento?.operador;

        if (operador === null || operador === undefined) return false;

        const setor = AuditEngine.resolverReferencia(APP.referencias.operadores, operador, CONFIG_BASE.operadores.setor);
        return normalizarTexto(setor ?? "") === alvo;
    },

    diagnosticoDoFechamentoEstaOculto(ordem, diagnosticosOcultos) {
        const fechamento = this.fechamentoEfetivoDaOrdem(ordem);
        if (!fechamento || fechamento.diagnostico === null || fechamento.diagnostico === undefined || fechamento.diagnostico === "") {
            return false;
        }

        const nome = AuditEngine.resolverReferencia(APP.referencias.diagnosticos, fechamento.diagnostico, CONFIG_BASE.diagnosticos.nome);
        if (!nome) return false;

        const alvo = normalizarTexto(nome);
        return diagnosticosOcultos.some(d => normalizarTexto(d) === alvo);
    },

    fechamentoEfetivoDaOrdem(ordem) {
        const alvoFechamento = normalizarTexto(IndicatorEngine.NOME_EVENTO_FECHAMENTO);
        const alvoReabertura = normalizarTexto(IndicatorEngine.NOME_EVENTO_REABERTURA);

        let primeiroFechamento = null;
        let ultimoFechamento = null;
        let ultimaReabertura = null;

        let fechamentoAntesDaUltimaReabertura = null;

        for (const mov of ordem.movimentacoes) {
            if (mov.evento === null || mov.evento === undefined) continue;
            const nome = AuditEngine.resolverReferencia(APP.referencias.eventos, mov.evento, CONFIG_BASE.eventos.nome);
            const nomeNormalizado = normalizarTexto(nome ?? "");

            if (nomeNormalizado === alvoFechamento) {
                if (!primeiroFechamento || (mov.data && primeiroFechamento.data && mov.data < primeiroFechamento.data)) {
                    primeiroFechamento = mov;
                }
                if (!ultimoFechamento || (mov.data && ultimoFechamento.data && mov.data > ultimoFechamento.data)) {
                    ultimoFechamento = mov;
                }
            }

            if (nomeNormalizado === alvoReabertura) {
                if (!ultimaReabertura || (mov.data && ultimaReabertura.data && mov.data > ultimaReabertura.data)) {
                    ultimaReabertura = mov;
                    fechamentoAntesDaUltimaReabertura = ultimoFechamento;
                }
            }
        }

        const mensagemParaClassificar = [fechamentoAntesDaUltimaReabertura?.mensagem, ultimaReabertura?.mensagem]
            .filter(Boolean)
            .join(" ");
        const motivo = ultimaReabertura ? classificarMotivoReabertura(mensagemParaClassificar) : null;
        return motivo === "servico_nao_executado" ? ultimoFechamento : primeiroFechamento;
    },

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

            const fechamento = this.fechamentoEfetivoDaOrdem(ordem);

            const nomeFechamento = IndicatorEngine.nomeResponsavelFechamento(fechamento);
            if (nomeFechamento) operadores.add(nomeFechamento);

            if (fechamento?.operador !== null && fechamento?.operador !== undefined) {
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
