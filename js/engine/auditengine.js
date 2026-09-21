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
            // Colaborador Responsável é resolvido pela aba PRÓPRIA da
            // Base.xlsx (colaboradoresResponsaveis), NÃO pela de
            // Operadores — cadastros separados, o mesmo ID é pessoas
            // diferentes nas duas abas (ver
            // IndicatorEngine.nomeResponsavelFechamento e
            // database/patch-08-colaborador-responsavel.sql). Resolver
            // contra a tabela errada aqui mostrava, na timeline da OS, o
            // nome de um OPERADOR qualquer que por coincidência tem o
            // mesmo ID do Colaborador Responsável de verdade.
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
        if (!linha) return String(codigo); // não encontrado na Base — mostra o código cru

        const colunaReal = encontrarColuna(linha, colunaNome);
        return colunaReal ? linha[colunaReal] : String(codigo);
    },

    /**
     * Diagnóstico numérico (formato antigo — movimentações importadas
     * antes da planilha de Ordens passar a trazer o nome direto) que
     * não bate com nenhuma linha da aba Diagnósticos da Base.xlsx
     * atual — resolverReferencia mostra o código cru nesses casos (ver
     * acima), o que aparece como um número solto na tela em vez de um
     * nome. Só considera valor PURAMENTE NUMÉRICO (diagnóstico já no
     * formato novo é sempre texto, ex.: "INSTALAÇÃO CONCLUÍDA (340)"
     * — isso nunca é confundido com um ID sem correspondência).
     * Devolve, por código, quantas movimentações ele afeta — pra
     * saber se vale importar uma Base mais antiga ou se é só
     * diagnóstico já descontinuado.
     *
     * "0" é ignorado de propósito: é o valor padrão que o sistema de
     * origem grava quando a movimentação simplesmente não tem
     * diagnóstico (confirmado nos dados reais — a maioria das
     * ocorrências é em eventos que nunca preenchem diagnóstico, tipo
     * Alteração/Registro de Mensagem) — não é um ID órfão de verdade,
     * é o mesmo que vazio. Sem esse filtro ele afoga o resultado.
     */
    listarDiagnosticosNaoResolvidos(ordens) {
        const contagem = new Map();

        for (const ordem of ordens.values()) {
            for (const mov of ordem.movimentacoes) {
                const bruto = mov.diagnostico;
                if (bruto === null || bruto === undefined || bruto === "") continue;

                const textoBruto = String(bruto).trim();
                if (textoBruto === "0") continue; // sentinela de "sem diagnóstico" — ver comentário acima
                if (!/^\d+$/.test(textoBruto)) continue; // já é texto (formato novo) — não é o caso

                const linha = APP.referencias.diagnosticos.get(bruto)
                    ?? APP.referencias.diagnosticos.get(Number(bruto))
                    ?? APP.referencias.diagnosticos.get(String(bruto));
                if (linha) continue; // achou na Base — resolve normalmente, não é o caso

                contagem.set(textoBruto, (contagem.get(textoBruto) ?? 0) + 1);
            }
        }

        return [...contagem.entries()]
            .map(([codigo, quantidade]) => ({ codigo, quantidade }))
            .sort((a, b) => b.quantidade - a.quantidade);
    }

};
