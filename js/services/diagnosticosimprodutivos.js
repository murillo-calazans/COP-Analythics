const DIAGNOSTICOS_IMPRODUTIVOS_CHAVE_STORAGE = "cop_analytics_diagnosticos_improdutivos";

function carregarDiagnosticosImprodutivos() {
    const bruta = localStorage.getItem(DIAGNOSTICOS_IMPRODUTIVOS_CHAVE_STORAGE);
    if (!bruta) return new Set();

    try {
        return new Set(JSON.parse(bruta));
    } catch (erro) {
        console.error("Falha ao carregar diagnósticos improdutivos:", erro);
        return new Set();
    }
}

function salvarDiagnosticosImprodutivos(diagnosticosImprodutivos) {
    localStorage.setItem(
        DIAGNOSTICOS_IMPRODUTIVOS_CHAVE_STORAGE,
        JSON.stringify([...diagnosticosImprodutivos])
    );
}
