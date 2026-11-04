const ASSUNTOS_INCLUIDOS_CANCELAMENTO_CHAVE_STORAGE = "cop_analytics_assuntos_incluidos_cancelamento";

function carregarAssuntosIncluidosCancelamento() {
    const bruta = localStorage.getItem(ASSUNTOS_INCLUIDOS_CANCELAMENTO_CHAVE_STORAGE);
    if (!bruta) return new Set();

    try {
        return new Set(JSON.parse(bruta));
    } catch (erro) {
        console.error("Falha ao carregar assuntos incluídos do cancelamento:", erro);
        return new Set();
    }
}

function salvarAssuntosIncluidosCancelamento(assuntosIncluidos) {
    ConfigRemota.sincronizar(ASSUNTOS_INCLUIDOS_CANCELAMENTO_CHAVE_STORAGE, [...assuntosIncluidos]);
}
