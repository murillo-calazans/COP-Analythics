/**
 * ==========================================================
 * Serviço de Configuração — Assuntos Incluídos na Última OS
 * Antes do Cancelamento
 * ==========================================================
 * Persiste, no localStorage, quais assuntos (ex.: "Sem Conexão / LOS")
 * PODEM aparecer como a "última OS antes do cancelamento" na aba
 * Alertas — ver IndicatorEngine.encontrarCancelamentoCliente. Lista
 * branca: por padrão nenhum assunto conta (mesmo padrão de
 * Configurações > Assuntos que Contam para Recorrência) — marque só
 * os que são visita técnica de verdade, ex.: "Conferência de
 * Contrato" NÃO deve ser marcado.
 *
 * Os valores são guardados normalizados (ver js/utils/texto.js)
 * pra não depender de acento/caixa na hora de comparar.
 */

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
    localStorage.setItem(
        ASSUNTOS_INCLUIDOS_CANCELAMENTO_CHAVE_STORAGE,
        JSON.stringify([...assuntosIncluidos])
    );
}
