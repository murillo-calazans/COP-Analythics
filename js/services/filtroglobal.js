/**
 * ==========================================================
 * Serviço de Filtro Global
 * ==========================================================
 * Persiste, no localStorage, quais "assuntos" devem CONTAR
 * para os indicadores (recorrência hoje, outros no futuro —
 * ex.: MTTR, SLA). É uma lista branca: por padrão nenhum
 * assunto conta, inclusive um assunto novo nunca visto antes
 * — alguém precisa incluir manualmente. Existe porque nem todo
 * assunto é uma visita técnica de manutenção (ex.: "Conferência
 * de Contrato" não deve contar como recorrência).
 *
 * Os valores são guardados normalizados (ver js/utils/texto.js)
 * pra não depender de acento/caixa na hora de comparar.
 */

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
    localStorage.setItem(
        FILTRO_GLOBAL_CHAVE_STORAGE,
        JSON.stringify([...assuntosIncluidos])
    );
}
