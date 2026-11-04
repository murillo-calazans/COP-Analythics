const RegiaoAtuacaoEngine = {

    calcular(ordens) {
        const config = CONFIG_REGIAO_ATUACAO;
        const analise = IndicatorEngine.analisarEventosDeTodas(ordens);
        const porTecnico = new Map();

        for (const ordem of ordens.values()) {
            if (!this.ehDeCampo(ordem)) continue;

            const fechamento = analise.get(ordem.id)?.fechamentoEfetivo;
            if (!fechamento || this.diagnosticoIgnorado(fechamento.diagnostico)) continue;

            const nome = IndicatorEngine.nomeResponsavelFechamento(fechamento);
            if (nome === null || nome === undefined || nome === "") continue;

            if (!porTecnico.has(nome)) porTecnico.set(nome, { total: 0, bairros: new Map(), cidades: new Map() });
            const acumulado = porTecnico.get(nome);
            const cidade = ordem.cidade || "Sem cidade";
            const bairro = ordem.bairro || "Sem bairro";

            const chave = `${normalizarTexto(cidade)}|${normalizarTexto(bairro)}`;

            acumulado.total++;
            const chaveCidade = normalizarTexto(cidade);
            const contCidade = acumulado.cidades.get(chaveCidade) ?? { cidade, quantidade: 0 };
            contCidade.quantidade++;
            acumulado.cidades.set(chaveCidade, contCidade);
            const item = acumulado.bairros.get(chave) ?? { bairro, cidade, quantidade: 0 };
            item.quantidade++;
            acumulado.bairros.set(chave, item);
        }

        const fichas = [];
        for (const [nome, acumulado] of porTecnico) {
            if (acumulado.total < config.minimoOS) continue;

            const bairros = [...acumulado.bairros.values()]
                .sort((a, b) => b.quantidade - a.quantidade)
                .map(item => ({ ...item, percentual: item.quantidade / acumulado.total }));
            const { cidade: cidadePrincipal, quantidade: osCidade } = [...acumulado.cidades.values()].sort((a, b) => b.quantidade - a.quantidade)[0];
            const concentracao = bairros
                .slice(0, config.bairrosNaConcentracao)
                .reduce((soma, item) => soma + item.percentual, 0);

            fichas.push({
                nome,
                total: acumulado.total,
                cidadePrincipal,
                percentualCidade: osCidade / acumulado.total,
                concentracao,
                perfil: this.perfilPorConcentracao(concentracao),
                bairros
            });
        }

        return fichas.sort((a, b) => b.concentracao - a.concentracao);
    },

    cidades(fichas) {
        return [...new Set(fichas.map(f => f.cidadePrincipal))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    },

    ehDeCampo(ordem) {
        const assunto = normalizarTexto(ordem.assunto ?? "").toLowerCase();
        return !CONFIG_REGIAO_ATUACAO.assuntosForaDeCampo.some(trecho => assunto.includes(trecho));
    },

    diagnosticoIgnorado(diagnostico) {
        const texto = normalizarTexto(diagnostico ?? "").toLowerCase();
        return CONFIG_REGIAO_ATUACAO.diagnosticosIgnorados.some(trecho => texto.includes(trecho));
    },

    perfilPorConcentracao(concentracao) {
        const perfil = CONFIG_REGIAO_ATUACAO.perfis.find(p => concentracao >= p.minimo)
            ?? CONFIG_REGIAO_ATUACAO.perfis[CONFIG_REGIAO_ATUACAO.perfis.length - 1];
        return { chave: perfil.chave, rotulo: perfil.rotulo };
    }
};
