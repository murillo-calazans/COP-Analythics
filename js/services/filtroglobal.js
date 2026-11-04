const FILTRO_GLOBAL_CHAVE_STORAGE = "cop_analytics_assuntos_incluidos";

function carregarAssuntosIncluidos() {
    const bruta = localStorage.getItem(FILTRO_GLOBAL_CHAVE_STORAGE);
    if (!bruta) return new Set();

    try {
        return new Set(JSON.parse(bruta));
    } catch (erro) {
        console.error("Falha ao carregar filtro global de assuntos:", erro);
        return new Set();
    }
}

function salvarAssuntosIncluidos(assuntosIncluidos) {
    ConfigRemota.sincronizar(FILTRO_GLOBAL_CHAVE_STORAGE, [...assuntosIncluidos]);
}
