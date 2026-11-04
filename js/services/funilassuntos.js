const FUNIL_ASSUNTOS_CHAVE_STORAGE = "cop_analytics_funil_assuntos";

function carregarFunilAssuntos() {
    const bruta = localStorage.getItem(FUNIL_ASSUNTOS_CHAVE_STORAGE);
    if (!bruta) return { origem: [], destino: [] };

    try {
        const salvo = JSON.parse(bruta);
        return {
            origem: Array.isArray(salvo.origem) ? salvo.origem : [],
            destino: Array.isArray(salvo.destino) ? salvo.destino : []
        };
    } catch (erro) {
        console.error("Falha ao carregar configuração do funil de assuntos:", erro);
        return { origem: [], destino: [] };
    }
}

function salvarFunilAssuntos(configuracao) {
    ConfigRemota.sincronizar(FUNIL_ASSUNTOS_CHAVE_STORAGE, configuracao);
}
