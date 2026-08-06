/**
 * ==========================================================
 * Serviço de Configuração — Diagnósticos Excluídos do Tempo
 * ==========================================================
 * Persiste, no localStorage, quais diagnósticos (ex.: "Cancelada
 * pelo Cliente", "Aberto Errado") NÃO devem contar no TMS/TMA —
 * uma OS cancelada não representa trabalho de campo de verdade.
 * Lista negra: por padrão nada está excluído, tudo conta
 * normalmente até alguém marcar manualmente. Fica configurável
 * porque o texto exato do diagnóstico varia — não dá pra fixar
 * no código com segurança.
 *
 * Os valores são guardados normalizados (ver js/utils/texto.js)
 * pra não depender de acento/caixa na hora de comparar.
 */

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
    localStorage.setItem(
        DIAGNOSTICOS_EXCLUIDOS_CHAVE_STORAGE,
        JSON.stringify([...diagnosticosExcluidos])
    );
}
