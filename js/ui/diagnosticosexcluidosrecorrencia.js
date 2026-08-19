/**
 * ==========================================================
 * UI de Diagnósticos Excluídos da Recorrência
 * ==========================================================
 * Abre num modal com busca: digita pra filtrar a lista, clica
 * num diagnóstico pra alternar (excluir/manter na recorrência).
 * Lista negra: por padrão nada está excluído. Cada clique já
 * salva e recalcula os indicadores na hora — sem botão "Salvar".
 * Reaproveita coletarDiagnosticosDistintos() de
 * js/ui/diagnosticosexcluidos.js (mesma fonte de diagnósticos).
 */

function registrarDiagnosticosExcluidosRecorrencia() {
    const botaoAbrir = document.getElementById("btnAbrirDiagnosticosExcluidosRecorrencia");
    const inputBusca = document.getElementById("buscaDiagnosticoExcluidoRecorrencia");

    if (botaoAbrir) botaoAbrir.addEventListener("click", abrirDiagnosticosExcluidosRecorrencia);
    if (inputBusca) inputBusca.addEventListener("input", () => renderizarListaDiagnosticosExcluidosRecorrenciaModal(inputBusca.value));

    renderizarResumoDiagnosticosExcluidosRecorrencia();
}

function abrirDiagnosticosExcluidosRecorrencia() {
    const inputBusca = document.getElementById("buscaDiagnosticoExcluidoRecorrencia");
    if (inputBusca) inputBusca.value = "";

    renderizarListaDiagnosticosExcluidosRecorrenciaModal("");
    abrirModal("modalDiagnosticosExcluidosRecorrencia");

    if (inputBusca) inputBusca.focus();
}

function renderizarListaDiagnosticosExcluidosRecorrenciaModal(termoBusca) {
    const container = document.getElementById("listaDiagnosticosExcluidosRecorrenciaModal");
    if (!container) return;

    const todos = coletarDiagnosticosDistintos();

    if (todos.length === 0) {
        container.innerHTML = '<p class="alerta-vazio">Importe uma Ordens.xlsx para ver a lista de diagnósticos.</p>';
        return;
    }

    const termoNormalizado = normalizarTexto(termoBusca);
    const filtrados = termoNormalizado
        ? todos.filter(diagnostico => normalizarTexto(diagnostico).includes(termoNormalizado))
        : todos;

    if (filtrados.length === 0) {
        container.innerHTML = '<p class="alerta-vazio">Nenhum diagnóstico bate com esse termo.</p>';
        return;
    }

    const excluidos = APP.configuracoes.diagnosticosExcluidosRecorrencia ?? new Set();

    container.innerHTML = filtrados.map(diagnostico => {
        const chave = normalizarTexto(diagnostico);
        const excluido = excluidos.has(chave);
        return `
            <div class="item-assunto-modal ${excluido ? "incluido" : ""}" data-diagnostico="${escaparHtml(chave)}">
                <span>${escaparHtml(diagnostico)}</span>
                <span class="item-assunto-tag">${excluido ? "Excluído da recorrência — clique pra voltar a contar" : "Clique pra excluir da recorrência"}</span>
            </div>
        `;
    }).join("");

    container.querySelectorAll(".item-assunto-modal").forEach(item => {
        item.addEventListener("click", () => alternarDiagnosticoExcluidoRecorrencia(item.dataset.diagnostico));
    });
}

function alternarDiagnosticoExcluidoRecorrencia(chaveDiagnostico) {
    const excluidos = APP.configuracoes.diagnosticosExcluidosRecorrencia ?? new Set();

    if (excluidos.has(chaveDiagnostico)) {
        excluidos.delete(chaveDiagnostico);
    } else {
        excluidos.add(chaveDiagnostico);
    }

    APP.configuracoes.diagnosticosExcluidosRecorrencia = excluidos;
    salvarDiagnosticosExcluidosRecorrencia(excluidos);

    atualizarTodasAsTelas();

    const inputBusca = document.getElementById("buscaDiagnosticoExcluidoRecorrencia");
    renderizarListaDiagnosticosExcluidosRecorrenciaModal(inputBusca ? inputBusca.value : "");
    renderizarResumoDiagnosticosExcluidosRecorrencia();
}

function renderizarResumoDiagnosticosExcluidosRecorrencia() {
    const container = document.getElementById("resumoDiagnosticosExcluidosRecorrencia");
    if (!container) return;

    const excluidos = APP.configuracoes.diagnosticosExcluidosRecorrencia ?? new Set();

    container.innerHTML = excluidos.size === 0
        ? '<p class="alerta-vazio">Nenhum diagnóstico excluído ainda — tudo conta normalmente na recorrência.</p>'
        : `<p class="resumo-filtro">${excluidos.size} diagnóstico(s) excluído(s) da recorrência.</p>`;
}
