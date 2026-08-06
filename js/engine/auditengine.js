/**
 * ==========================================================
 * Audit Engine
 * ==========================================================
 * Busca de Ordens de Serviço e preparação dos dados de uma OS
 * (com códigos resolvidos contra a Base) para a tela de
 * Auditoria. A interface só renderiza o que este motor devolve
 * — nenhuma busca ou resolução de referência acontece na UI.
 */

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
        if (!linha) return String(codigo); // não encontrado na Base — mostra o código cru

        const colunaReal = encontrarColuna(linha, colunaNome);
        return colunaReal ? linha[colunaReal] : String(codigo);
    }

};
