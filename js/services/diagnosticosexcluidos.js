const DIAGNOSTICOS_EXCLUIDOS_CHAVE_STORAGE = "cop_analytics_diagnosticos_excluidos_tempo";

function carregarDiagnosticosExcluidosTempo() {
    const bruta = localStorage.getItem(DIAGNOSTICOS_EXCLUIDOS_CHAVE_STORAGE);
    if (!bruta) return new Set();

    try {
        return new Set(JSON.parse(bruta));
    } catch (erro) {
        console.error("Falha ao carregar diagnósticos excluídos do tempo:", erro);
        return new Set();
    }
}

function salvarDiagnosticosExcluidosTempo(diagnosticosExcluidos) {
    ConfigRemota.sincronizar(DIAGNOSTICOS_EXCLUIDOS_CHAVE_STORAGE, [...diagnosticosExcluidos]);
}
