/**
 * ==========================================================
 * Serviço de Configuração — Assuntos Excluídos da Última OS
 * Antes do Cancelamento
 * ==========================================================
 * Persiste, no localStorage, quais assuntos (ex.: "Conferência de
 * Contrato") NÃO devem aparecer como a "última OS antes do
 * cancelamento" na aba Alertas — ver
 * IndicatorEngine.encontrarCancelamentoCliente. Lista negra: por
 * padrão nada está excluído, a OS mais recente antes do cancelamento
 * aparece normalmente até alguém excluir manualmente o assunto dela.
 *
 * Os valores são guardados normalizados (ver js/utils/texto.js)
 * pra não depender de acento/caixa na hora de comparar.
 */

const ASSUNTOS_EXCLUIDOS_CANCELAMENTO_CHAVE_STORAGE = "cop_analytics_assuntos_excluidos_cancelamento";

function carregarAssuntosExcluidosCancelamento() {
    const bruta = localStorage.getItem(ASSUNTOS_EXCLUIDOS_CANCELAMENTO_CHAVE_STORAGE);
    if (!bruta) return new Set();

    try {
        return new Set(JSON.parse(bruta));
    } catch (erro) {
        console.error("Falha ao carregar assuntos excluídos do cancelamento:", erro);
        return new Set();
    }
}

function salvarAssuntosExcluidosCancelamento(assuntosExcluidos) {
    localStorage.setItem(
        ASSUNTOS_EXCLUIDOS_CANCELAMENTO_CHAVE_STORAGE,
        JSON.stringify([...assuntosExcluidos])
    );
}
