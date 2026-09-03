/**
 * ==========================================================
 * UI de Diagnósticos Improdutivos (Produtivo x Improdutivo)
 * ==========================================================
 * Abre num modal com busca: digita pra filtrar a lista, clica num
 * diagnóstico pra alternar (marcar/desmarcar como improdutivo) — ver
 * IndicatorEngine.calcularProdutividade. Lista negra: por padrão nada
 * está marcado (o indicador fica em "Não classificada" até então).
 * Cada clique já salva e recalcula os indicadores na hora — sem botão
 * "Salvar". Mesmo padrão de js/ui/diagnosticosexcluidos.js.
 */

function coletarDiagnosticosDistintosImprodutivos() {
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

function registrarDiagnosticosImprodutivos() {
    const botaoAbrir = document.getElementById("btnAbrirDiagnosticosImprodutivos");
    const inputBusca = document.getElementById("buscaDiagnosticoImprodutivo");

    if (botaoAbrir) botaoAbrir.addEventListener("click", abrirDiagnosticosImprodutivos);
    if (inputBusca) inputBusca.addEventListener("input", () => renderizarListaDiagnosticosImprodutivosModal(inputBusca.value));

    renderizarResumoDiagnosticosImprodutivos();
}

function abrirDiagnosticosImprodutivos() {
    const inputBusca = document.getElementById("buscaDiagnosticoImprodutivo");
    if (inputBusca) inputBusca.value = "";

    renderizarListaDiagnosticosImprodutivosModal("");
    abrirModal("modalDiagnosticosImprodutivos");

    if (inputBusca) inputBusca.focus();
}

function renderizarListaDiagnosticosImprodutivosModal(termoBusca) {
    const container = document.getElementById("listaDiagnosticosImprodutivosModal");
    if (!container) return;

    const todos = coletarDiagnosticosDistintosImprodutivos();

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

    const improdutivos = APP.configuracoes.diagnosticosImprodutivos ?? new Set();

    container.innerHTML = filtrados.map(diagnostico => {
        const chave = normalizarTexto(diagnostico);
        const marcado = improdutivos.has(chave);
        return `
            <div class="item-assunto-modal ${marcado ? "incluido" : ""}" data-diagnostico="${escaparHtml(chave)}">
                <span>${escaparHtml(diagnostico)}</span>
                <span class="item-assunto-tag">${marcado ? "Improdutivo — clique pra desmarcar" : "Clique pra marcar como improdutivo"}</span>
            </div>
        `;
    }).join("");

    container.querySelectorAll(".item-assunto-modal").forEach(item => {
        item.addEventListener("click", () => alternarDiagnosticoImprodutivo(item.dataset.diagnostico));
    });
}

function alternarDiagnosticoImprodutivo(chaveDiagnostico) {
    const improdutivos = APP.configuracoes.diagnosticosImprodutivos ?? new Set();

    if (improdutivos.has(chaveDiagnostico)) {
        improdutivos.delete(chaveDiagnostico);
    } else {
        improdutivos.add(chaveDiagnostico);
    }

    APP.configuracoes.diagnosticosImprodutivos = improdutivos;
    salvarDiagnosticosImprodutivos(improdutivos);

    atualizarTodasAsTelas();

    const inputBusca = document.getElementById("buscaDiagnosticoImprodutivo");
    renderizarListaDiagnosticosImprodutivosModal(inputBusca ? inputBusca.value : "");
    renderizarResumoDiagnosticosImprodutivos();
}

function renderizarResumoDiagnosticosImprodutivos() {
    const container = document.getElementById("resumoDiagnosticosImprodutivos");
    if (!container) return;

    const improdutivos = APP.configuracoes.diagnosticosImprodutivos ?? new Set();

    container.innerHTML = improdutivos.size === 0
        ? '<p class="alerta-vazio">Nenhum diagnóstico marcado ainda — o indicador Produtivo x Improdutivo fica em "Não classificada".</p>'
        : `<p class="resumo-filtro">${improdutivos.size} diagnóstico(s) marcado(s) como improdutivo.</p>`;
}
