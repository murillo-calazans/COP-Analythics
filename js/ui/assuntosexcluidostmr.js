/**
 * ==========================================================
 * UI de Assuntos Excluídos do TMR
 * ==========================================================
 * Abre num modal com busca: digita pra filtrar a lista, clica
 * num assunto pra alternar (excluir/manter no TMR). Lista negra:
 * por padrão nada está excluído. Cada clique já salva e recalcula
 * os indicadores na hora — sem botão "Salvar".
 */

function coletarAssuntosDistintosParaTMR() {
    const assuntos = new Set();

    for (const ordem of APP.dados.ordens.values()) {
        if (ordem.assunto) assuntos.add(ordem.assunto);
    }

    return [...assuntos].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function registrarAssuntosExcluidosTMR() {
    const botaoAbrir = document.getElementById("btnAbrirAssuntosExcluidosTMR");
    const inputBusca = document.getElementById("buscaAssuntoExcluidoTMR");

    if (botaoAbrir) botaoAbrir.addEventListener("click", abrirAssuntosExcluidosTMR);
    if (inputBusca) inputBusca.addEventListener("input", () => renderizarListaAssuntosExcluidosTMRModal(inputBusca.value));

    renderizarResumoAssuntosExcluidosTMR();
}

function abrirAssuntosExcluidosTMR() {
    const inputBusca = document.getElementById("buscaAssuntoExcluidoTMR");
    if (inputBusca) inputBusca.value = "";

    renderizarListaAssuntosExcluidosTMRModal("");
    abrirModal("modalAssuntosExcluidosTMR");

    if (inputBusca) inputBusca.focus();
}

function renderizarListaAssuntosExcluidosTMRModal(termoBusca) {
    const container = document.getElementById("listaAssuntosExcluidosTMRModal");
    if (!container) return;

    const todos = coletarAssuntosDistintosParaTMR();

    if (todos.length === 0) {
        container.innerHTML = '<p class="alerta-vazio">Importe uma Ordens.xlsx para ver a lista de assuntos.</p>';
        return;
    }

    const termoNormalizado = normalizarTexto(termoBusca);
    const filtrados = termoNormalizado
        ? todos.filter(assunto => normalizarTexto(assunto).includes(termoNormalizado))
        : todos;

    if (filtrados.length === 0) {
        container.innerHTML = '<p class="alerta-vazio">Nenhum assunto bate com esse termo.</p>';
        return;
    }

    const excluidos = APP.configuracoes.assuntosExcluidosTMR ?? new Set();

    container.innerHTML = filtrados.map(assunto => {
        const chave = normalizarTexto(assunto);
        const excluido = excluidos.has(chave);
        return `
            <div class="item-assunto-modal ${excluido ? "incluido" : ""}" data-assunto="${escaparHtml(chave)}">
                <span>${escaparHtml(assunto)}</span>
                <span class="item-assunto-tag">${excluido ? "Excluído do TMR — clique pra voltar a contar" : "Clique pra excluir do TMR"}</span>
            </div>
        `;
    }).join("");

    container.querySelectorAll(".item-assunto-modal").forEach(item => {
        item.addEventListener("click", () => alternarAssuntoExcluidoTMR(item.dataset.assunto));
    });
}

function alternarAssuntoExcluidoTMR(chaveAssunto) {
    const excluidos = APP.configuracoes.assuntosExcluidosTMR ?? new Set();

    if (excluidos.has(chaveAssunto)) {
        excluidos.delete(chaveAssunto);
    } else {
        excluidos.add(chaveAssunto);
    }

    APP.configuracoes.assuntosExcluidosTMR = excluidos;
    salvarAssuntosExcluidosTMR(excluidos);

    atualizarTodasAsTelas();

    const inputBusca = document.getElementById("buscaAssuntoExcluidoTMR");
    renderizarListaAssuntosExcluidosTMRModal(inputBusca ? inputBusca.value : "");
    renderizarResumoAssuntosExcluidosTMR();
}

function renderizarResumoAssuntosExcluidosTMR() {
    const container = document.getElementById("resumoAssuntosExcluidosTMR");
    if (!container) return;

    const excluidos = APP.configuracoes.assuntosExcluidosTMR ?? new Set();

    container.innerHTML = excluidos.size === 0
        ? '<p class="alerta-vazio">Nenhum assunto excluído ainda — tudo conta normalmente no TMR.</p>'
        : `<p class="resumo-filtro">${excluidos.size} assunto(s) excluído(s) do TMR.</p>`;
}
