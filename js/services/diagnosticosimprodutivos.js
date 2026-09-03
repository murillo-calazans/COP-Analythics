/**
 * ==========================================================
 * Serviço de Configuração — Diagnósticos Improdutivos
 * ==========================================================
 * Persiste, no localStorage, quais diagnósticos do fechamento contam
 * como "improdutivo" (ex.: "Cliente Ausente", "CTO Sem Vaga") pro
 * indicador Produtivo x Improdutivo (ver IndicatorEngine.
 * calcularProdutividade) — mesmo padrão de Diagnósticos Excluídos do
 * Tempo/Recorrência. Lista negra: por padrão nada está classificado
 * (o indicador fica em "Não classificada" até alguém marcar).
 *
 * Os valores são guardados normalizados (ver js/utils/texto.js)
 * pra não depender de acento/caixa na hora de comparar.
 */

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
