/**
 * ==========================================================
 * UI de Diagnósticos Excluídos do Tempo (TMS/TMA)
 * ==========================================================
 * Abre num modal com busca: digita pra filtrar a lista, clica
 * num diagnóstico pra alternar (excluir/manter no TMS/TMA).
 * Lista negra: por padrão nada está excluído. Cada clique já
 * salva e recalcula os indicadores na hora — sem botão "Salvar".
 */

function coletarDiagnosticosDistintos() {
    const diagnosticos = new Set();

    for (const ordem of APP.dados.ordens.values()) {
        for (const mov of ordem.movimentacoes) {
            if (mov.diagnostico === null || mov.diagnostico === undefined || mov.diagnostico === "") continue;

            const nome = AuditEngine.resolverReferencia(
                APP.referencias.diagnosticos, mov.diagnostico, CONFIG_BASE.diagnosticos.nome
            );
            if (nome) diagnosticos.add(nome);
        }
    }

    return [...diagnosticos].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function registrarDiagnosticosExcluidos() {
    const botaoAbrir = document.getElementById("btnAbrirDiagnosticosExcluidos");
    const inputBusca = document.getElementById("buscaDiagnosticoExcluido");

    if (botaoAbrir) botaoAbrir.addEventListener("click", abrirDiagnosticosExcluidos);
    if (inputBusca) inputBusca.addEventListener("input", () => renderizarListaDiagnosticosExcluidosModal(inputBusca.value));

    renderizarResumoDiagnosticosExcluidos();
}

function abrirDiagnosticosExcluidos() {
    const inputBusca = document.getElementById("buscaDiagnosticoExcluido");
    if (inputBusca) inputBusca.value = "";

    renderizarListaDiagnosticosExcluidosModal("");
    abrirModal("modalDiagnosticosExcluidos");

    if (inputBusca) inputBusca.focus();
}

function renderizarListaDiagnosticosExcluidosModal(termoBusca) {
    const container = document.getElementById("listaDiagnosticosExcluidosModal");
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

    const excluidos = APP.configuracoes.diagnosticosExcluidosTempo ?? new Set();

    container.innerHTML = filtrados.map(diagnostico => {
        const chave = normalizarTexto(diagnostico);
        const excluido = excluidos.has(chave);
        return `
            <div class="item-assunto-modal ${excluido ? "incluido" : ""}" data-diagnostico="${escaparHtml(chave)}">
                <span>${escaparHtml(diagnostico)}</span>
                <span class="item-assunto-tag">${excluido ? "Excluído do TMS/TMA — clique pra voltar a contar" : "Clique pra excluir do TMS/TMA"}</span>
            </div>
        `;
    }).join("");

    container.querySelectorAll(".item-assunto-modal").forEach(item => {
        item.addEventListener("click", () => alternarDiagnosticoExcluido(item.dataset.diagnostico));
    });
}

function alternarDiagnosticoExcluido(chaveDiagnostico) {
    const excluidos = APP.configuracoes.diagnosticosExcluidosTempo ?? new Set();

    if (excluidos.has(chaveDiagnostico)) {
        excluidos.delete(chaveDiagnostico);
    } else {
        excluidos.add(chaveDiagnostico);
    }

    APP.configuracoes.diagnosticosExcluidosTempo = excluidos;
    salvarDiagnosticosExcluidosTempo(excluidos);

    atualizarTodasAsTelas();

    const inputBusca = document.getElementById("buscaDiagnosticoExcluido");
    renderizarListaDiagnosticosExcluidosModal(inputBusca ? inputBusca.value : "");
    renderizarResumoDiagnosticosExcluidos();
}

function renderizarResumoDiagnosticosExcluidos() {
    const container = document.getElementById("resumoDiagnosticosExcluidos");
    if (!container) return;

    const excluidos = APP.configuracoes.diagnosticosExcluidosTempo ?? new Set();

    container.innerHTML = excluidos.size === 0
        ? '<p class="alerta-vazio">Nenhum diagnóstico excluído ainda — tudo conta normalmente no TMS/TMA.</p>'
        : `<p class="resumo-filtro">${excluidos.size} diagnóstico(s) excluído(s) do TMS/TMA.</p>`;
}
