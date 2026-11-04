const ProducaoEngine = {

    inicioDoMes(data = new Date()) {
        return new Date(data.getFullYear(), data.getMonth(), 1);
    },

    calcularPorOperador(ordens, inicio, fim) {
        const alvoAgendamento = normalizarTexto(IndicatorEngine.NOME_EVENTO_AGENDAMENTO);
        const alvoReagendamento = normalizarTexto(IndicatorEngine.NOME_EVENTO_REAGENDAMENTO);
        const alvoFechamento = normalizarTexto(IndicatorEngine.NOME_EVENTO_FECHAMENTO);

        const nomesEvento = new Map();
        const nomeEventoNormalizado = codigo => {
            if (!nomesEvento.has(codigo)) {
                nomesEvento.set(codigo, normalizarTexto(
                    AuditEngine.resolverReferencia(APP.referencias.eventos, codigo, CONFIG_BASE.eventos.nome) ?? ""
                ));
            }
            return nomesEvento.get(codigo);
        };

        const porCodigo = new Map();
        const registro = codigo => {
            if (!porCodigo.has(codigo)) {
                porCodigo.set(codigo, {
                    codigo,
                    nome: AuditEngine.resolverReferencia(APP.referencias.operadores, codigo, CONFIG_BASE.operadores.nome) ?? String(codigo),
                    setor: AuditEngine.resolverReferencia(APP.referencias.operadores, codigo, CONFIG_BASE.operadores.setor) ?? "",
                    aberturas: 0,
                    agendamentos: 0,
                    reagendamentos: 0,
                    fechamentos: 0
                });
            }
            return porCodigo.get(codigo);
        };
        const noPeriodo = data => data && data >= inicio && data < fim;

        for (const ordem of ordens.values()) {
            let primeira = null;

            for (const mov of ordem.movimentacoes) {
                if (!mov.data) continue;
                if (!primeira || mov.data < primeira.data) primeira = mov;

                if (mov.operador === null || mov.operador === undefined || !noPeriodo(mov.data)) continue;

                const evento = nomeEventoNormalizado(mov.evento);
                if (evento === alvoAgendamento) registro(mov.operador).agendamentos++;
                else if (evento === alvoReagendamento) registro(mov.operador).reagendamentos++;
                else if (evento === alvoFechamento) registro(mov.operador).fechamentos++;
            }

            if (primeira && primeira.operador !== null && primeira.operador !== undefined && noPeriodo(primeira.data)) {
                registro(primeira.operador).aberturas++;
            }
        }

        const porNome = new Map();
        for (const item of porCodigo.values()) {
            const existente = porNome.get(item.nome);
            if (!existente) { porNome.set(item.nome, item); continue; }
            existente.aberturas += item.aberturas;
            existente.agendamentos += item.agendamentos;
            existente.reagendamentos += item.reagendamentos;
            existente.fechamentos += item.fechamentos;
        }
        return porNome;
    },

    doMesAtual() {
        const inicio = this.inicioDoMes();
        const fim = new Date(inicio.getFullYear(), inicio.getMonth() + 1, 1);
        return this.calcularPorOperador(APP.dados.ordens, inicio, fim);
    },

    encontrarOperador(producao, nomeUsuario) {
        if (!nomeUsuario) return null;
        const alvo = normalizarTexto(nomeUsuario);
        const palavras = alvo.split(/\s+/).filter(p => p.length > 1);
        if (palavras.length === 0) return null;

        let achado = null;
        for (const item of producao.values()) {
            const nome = normalizarTexto(item.nome);
            if (nome === alvo) return item;
            const palavrasNome = nome.split(/\s+/);
            if (!achado && palavras.every(p => palavrasNome.includes(p))) achado = item;
        }
        return achado;
    }
};
