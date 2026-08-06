/**
 * ==========================================================
 * Data Engine
 * ==========================================================
 * Responsável por transformar as linhas brutas de Ordens.xlsx
 * em objetos Movimentacao/OrdemServico e popular APP.dados.
 * Não conhece Excel além do array de linhas já convertido
 * por XLSX.utils.sheet_to_json — nenhuma outra camada deve
 * tocar em planilha diretamente.
 */

const DataEngine = {

    processarOrdens(linhas) {
        const inicio = performance.now();

        this.validarEstrutura(linhas);

        // Resolve os nomes reais das colunas 1x (não a cada linha) —
        // essencial para processar milhares de movimentações rapidamente.
        const colunas = this.resolverColunas(linhas[0]);

        const ordens = new Map();
        let totalMovimentacoes = 0;
        let linhasIgnoradas = 0;

        for (const linha of linhas) {
            const id = this.valor(linha, colunas.id);

            if (id === null) {
                linhasIgnoradas++;
                continue;
            }

            let ordem = ordens.get(id);
            if (!ordem) {
                ordem = new OrdemServico({
                    id,
                    cliente: this.valor(linha, colunas.cliente),
                    login: this.valor(linha, colunas.login),
                    cidade: this.valor(linha, colunas.cidade),
                    bairro: this.valor(linha, colunas.bairro),
                    assunto: this.valor(linha, colunas.assunto)
                });
                ordens.set(id, ordem);
            }

            ordem.adicionarMovimentacao(this.criarMovimentacao(linha, colunas));
            totalMovimentacoes++;
        }

        for (const ordem of ordens.values()) {
            ordem.movimentacoes.sort((a, b) => (a.data ?? 0) - (b.data ?? 0));
        }

        const tempoMs = Math.round(performance.now() - inicio);

        return {
            ordens,
            estatisticas: {
                linhas: linhas.length,
                linhasIgnoradas,
                ordens: ordens.size,
                movimentacoes: totalMovimentacoes,
                tempoMs
            }
        };
    },

    /**
     * Acrescenta "novas" (Map de OrdemServico recém-processado) dentro de
     * "existentes" — em vez de substituir. Existe porque um arquivo de
     * Ordens.xlsx de um ano inteiro é grande demais pro navegador processar
     * de uma vez (memória); dividindo em pedaços menores (por mês, por
     * trimestre) e importando um de cada vez, os dados vão se acumulando.
     * Se a mesma OS aparecer nos dois pedaços, as movimentações se somam
     * (adicionarMovimentacao recalcula status/técnico/datas sozinho).
     */
    mesclarOrdens(existentes, novas) {
        for (const [id, novaOrdem] of novas) {
            const existente = existentes.get(id);

            if (!existente) {
                existentes.set(id, novaOrdem);
                continue;
            }

            for (const mov of novaOrdem.movimentacoes) {
                existente.adicionarMovimentacao(mov);
            }

            existente.movimentacoes.sort((a, b) => (a.data ?? 0) - (b.data ?? 0));

            existente.cliente ??= novaOrdem.cliente;
            existente.login ??= novaOrdem.login;
            existente.cidade ??= novaOrdem.cidade;
            existente.bairro ??= novaOrdem.bairro;
            existente.assunto ??= novaOrdem.assunto;
        }

        return existentes;
    },

    resolverColunas(linhaExemplo) {
        const colunas = {};
        for (const campo of Object.keys(CONFIG_ORDENS)) {
            colunas[campo] = encontrarColuna(linhaExemplo, CONFIG_ORDENS[campo]);
        }
        return colunas;
    },

    criarMovimentacao(linha, colunas) {
        return new Movimentacao({
            operador: this.valor(linha, colunas.operador),
            equipe: this.valor(linha, colunas.equipe),
            evento: this.valor(linha, colunas.evento),
            diagnostico: this.valor(linha, colunas.diagnostico),
            status: this.valor(linha, colunas.status),
            respostaPadrao: this.valor(linha, colunas.respostaPadrao),
            mensagem: this.valor(linha, colunas.mensagem) ?? "",
            historico: this.valor(linha, colunas.historico),
            data: paraData(this.valor(linha, colunas.data))
        });
    },

    valor(linha, colunaReal) {
        if (!colunaReal) return null;
        const valor = linha[colunaReal];
        return valor === "" || valor === undefined ? null : valor;
    },

    validarEstrutura(linhas) {
        if (!Array.isArray(linhas) || linhas.length === 0) {
            throw new Error("Ordens.xlsx está vazio ou não pôde ser lido.");
        }

        const colunasEncontradas = Object.keys(linhas[0]);
        const obrigatorias = { id: CONFIG_ORDENS.id, data: CONFIG_ORDENS.data };
        const faltando = Object.values(obrigatorias).filter(c => !encontrarColuna(linhas[0], c));

        if (faltando.length > 0) {
            throw new Error(
                `Colunas obrigatórias não encontradas em Ordens.xlsx: ${faltando.join(", ")}. ` +
                `Ajuste CONFIG_ORDENS em js/config/colunas.js. ` +
                `Colunas disponíveis na planilha: ${colunasEncontradas.join(", ")}`
            );
        }
    }

};
