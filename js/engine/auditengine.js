const AuditEngine = {

    LIMITE_RESULTADOS: 200,

    buscar(termo, ordens = APP.dados.ordens) {
        const termoNormalizado = normalizarTexto(termo);
        if (!termoNormalizado) return [];

        const resultados = [];

        for (const ordem of ordens.values()) {
            if (this.combina(ordem, termoNormalizado)) {
                resultados.push(ordem);
                if (resultados.length >= this.LIMITE_RESULTADOS) break;
            }
        }

        return resultados;
    },

    combina(ordem, termoNormalizado) {
        const campos = [ordem.id, ordem.cliente, ordem.login, ordem.cidade, ordem.bairro, ordem.assunto];
        return campos.some(campo =>
            campo !== null && campo !== undefined &&
            normalizarTexto(String(campo)).includes(termoNormalizado)
        );
    },

    obterDetalhes(idBruto) {
        const ordem = APP.dados.ordens.get(idBruto)
            ?? APP.dados.ordens.get(Number(idBruto))
            ?? APP.dados.ordens.get(String(idBruto));

        if (!ordem) return null;

        return {
            ordem,
            timeline: ordem.movimentacoes.map(mov => this.resolverMovimentacao(mov))
        };
    },

    resolverMovimentacao(mov) {
        return {
            data: mov.data,
            operador: this.resolverReferencia(APP.referencias.operadores, mov.operador, CONFIG_BASE.operadores.nome),

            colaboradorResponsavel: this.resolverReferencia(
                APP.referencias.colaboradoresResponsaveis, mov.colaboradorResponsavel, CONFIG_BASE.colaboradoresResponsaveis.nome
            ),
            evento: this.resolverReferencia(APP.referencias.eventos, mov.evento, CONFIG_BASE.eventos.nome),
            diagnostico: this.resolverReferencia(APP.referencias.diagnosticos, mov.diagnostico, CONFIG_BASE.diagnosticos.nome),
            status: mov.status,
            respostaPadrao: mov.respostaPadrao,
            mensagem: mov.mensagem,
            historico: mov.historico
        };
    },

    resolverReferencia(mapa, codigo, colunaNome) {
        if (codigo === null || codigo === undefined || codigo === "") return null;

        const linha = mapa.get(codigo) ?? mapa.get(Number(codigo)) ?? mapa.get(String(codigo));
        if (!linha) return String(codigo);

        const colunaReal = encontrarColuna(linha, colunaNome);
        return colunaReal ? linha[colunaReal] : String(codigo);
    },

    listarDiagnosticosNaoResolvidos(ordens) {
        const contagem = new Map();

        for (const ordem of ordens.values()) {
            for (const mov of ordem.movimentacoes) {
                const bruto = mov.diagnostico;
                if (bruto === null || bruto === undefined || bruto === "") continue;

                const textoBruto = String(bruto).trim();
                if (textoBruto === "0") continue;
                if (!/^\d+$/.test(textoBruto)) continue;

                const linha = APP.referencias.diagnosticos.get(bruto)
                    ?? APP.referencias.diagnosticos.get(Number(bruto))
                    ?? APP.referencias.diagnosticos.get(String(bruto));
                if (linha) continue;

                contagem.set(textoBruto, (contagem.get(textoBruto) ?? 0) + 1);
            }
        }

        return [...contagem.entries()]
            .map(([codigo, quantidade]) => ({ codigo, quantidade }))
            .sort((a, b) => b.quantidade - a.quantidade);
    }

};
