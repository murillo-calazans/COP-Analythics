/**
 * ==========================================================
 * UI do Filtro Global de Assuntos
 * ==========================================================
 * Abre num modal com busca: digita pra filtrar a lista, clica
 * num assunto pra alternar (incluir/remover da recorrência).
 * Lista branca: por padrão nada está incluído. Cada clique já
 * salva e recalcula a recorrência na hora — sem botão "Salvar".
 */

function coletarAssuntosDistintos() {
    const assuntos = new Set();

    for (const ordem of APP.dados.ordens.values()) {
        if (ordem.assunto) assuntos.add(ordem.assunto);
    }

    return [...assuntos].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function registrarFiltroAssuntos() {
    const botaoAbrir = document.getElementById("btnAbrirFiltroAssuntos");
    const inputBusca = document.getElementById("buscaFiltroAssunto");

    if (botaoAbrir) botaoAbrir.addEventListener("click", abrirFiltroAssuntos);
    if (inputBusca) inputBusca.addEventListener("input", () => renderizarListaAssuntosModal(inputBusca.value));

    renderizarResumoFiltroAssuntos();
}

function abrirFiltroAssuntos() {
    const inputBusca = document.getElementById("buscaFiltroAssunto");
    if (inputBusca) inputBusca.value = "";

    renderizarListaAssuntosModal("");
    abrirModal("modalFiltro");

    if (inputBusca) inputBusca.focus();
}

function renderizarListaAssuntosModal(termoBusca) {
    const container = document.getElementById("listaAssuntosModal");
    if (!container) return;

    const todos = coletarAssuntosDistintos();

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

    const incluidos = APP.configuracoes.assuntosIncluidos ?? new Set();

    container.innerHTML = filtrados.map(assunto => {
        const chave = normalizarTexto(assunto);
        const incluido = incluidos.has(chave);
        return `
            <div class="item-assunto-modal ${incluido ? "incluido" : ""}" data-assunto="${escaparHtml(chave)}">
                <span>${escaparHtml(assunto)}</span>
                <span class="item-assunto-tag">${incluido ? "Incluído — clique pra remover" : "Clique pra incluir na recorrência"}</span>
            </div>
        `;
    }).join("");

    container.querySelectorAll(".item-assunto-modal").forEach(item => {
        item.addEventListener("click", () => alternarAssuntoIncluido(item.dataset.assunto));
    });
}

function alternarAssuntoIncluido(chaveAssunto) {
    const incluidos = APP.configuracoes.assuntosIncluidos ?? new Set();

    if (incluidos.has(chaveAssunto)) {
        incluidos.delete(chaveAssunto);
    } else {
        incluidos.add(chaveAssunto);
    }

    APP.configuracoes.assuntosIncluidos = incluidos;
    salvarAssuntosIncluidos(incluidos);

    if (APP.dados.ordens.size > 0) {
        APP.indicadores.recorrencia = IndicatorEngine.calcularRecorrencia(FiltroEngine.ordensFiltradas());
        renderizarAlertas();
        atualizarBadgeAlertas();
        renderizarDashboard();
    }

    const inputBusca = document.getElementById("buscaFiltroAssunto");
    renderizarListaAssuntosModal(inputBusca ? inputBusca.value : "");
    renderizarResumoFiltroAssuntos();
}

function renderizarResumoFiltroAssuntos() {
    const container = document.getElementById("resumoFiltroAssuntos");
    if (!container) return;

    const incluidos = APP.configuracoes.assuntosIncluidos ?? new Set();

    container.innerHTML = incluidos.size === 0
        ? '<p class="alerta-vazio">Nenhum assunto incluído ainda — nada conta para a recorrência.</p>'
        : `<p class="resumo-filtro">${incluidos.size} assunto(s) incluído(s) na recorrência.</p>`;
}
