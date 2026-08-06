/**
 * ==========================================================
 * UI de Filtros — Busca de OS (Auditoria)
 * ==========================================================
 * Só lê o campo de busca e pede o resultado ao AuditEngine —
 * nenhuma lógica de busca vive aqui.
 */

function registrarBuscaAuditoria() {
    const form = document.getElementById("formBuscaAuditoria");
    const input = document.getElementById("buscaAuditoria");

    if (form) {
        form.addEventListener("submit", evento => {
            evento.preventDefault();
            executarBuscaAuditoria();
        });
    }

    if (input) {
        input.addEventListener("input", executarBuscaAuditoria);
    }
}

function executarBuscaAuditoria() {
    const input = document.getElementById("buscaAuditoria");
    const container = document.getElementById("resultadosAuditoria");
    const termo = input.value.trim();

    if (!termo) {
        if (container) container.innerHTML = "";
        return;
    }

    if (!APP.status.baseCarregada || APP.dados.ordens.size === 0) {
        if (container) container.innerHTML = '<p class="alerta-vazio">Importe uma Ordens.xlsx antes de pesquisar.</p>';
        return;
    }

    const resultados = AuditEngine.buscar(termo, FiltroEngine.ordensFiltradas());
    renderizarResultadosAuditoria(resultados);
}
