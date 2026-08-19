/**
 * ==========================================================
 * Serviço de Configuração — Diagnósticos Excluídos da Recorrência
 * ==========================================================
 * Persiste, no localStorage, quais diagnósticos (ex.: "Verificação
 * sem problema encontrado") NÃO devem contar como visita recorrente
 * de verdade — ver IndicatorEngine.diagnosticoExcluidoDaRecorrencia.
 * Lista negra independente da usada no TMS/TMA (diagnosticosexcluidos.js):
 * por padrão nada está excluído.
 *
 * Os valores são guardados normalizados (ver js/utils/texto.js)
 * pra não depender de acento/caixa na hora de comparar.
 */

const DIAGNOSTICOS_EXCLUIDOS_RECORRENCIA_CHAVE_STORAGE = "cop_analytics_diagnosticos_excluidos_recorrencia";

function carregarDiagnosticosExcluidosRecorrencia() {
    const bruta = localStorage.getItem(DIAGNOSTICOS_EXCLUIDOS_RECORRENCIA_CHAVE_STORAGE);
    if (!bruta) return new Set();

    try {
        return new Set(JSON.parse(bruta));
    } catch (erro) {
        console.error("Falha ao carregar diagnósticos excluídos da recorrência:", erro);
        return new Set();
    }
}

function salvarDiagnosticosExcluidosRecorrencia(diagnosticosExcluidos) {
    localStorage.setItem(
        DIAGNOSTICOS_EXCLUIDOS_RECORRENCIA_CHAVE_STORAGE,
        JSON.stringify([...diagnosticosExcluidos])
    );
}
