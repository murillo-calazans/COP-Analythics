/**
 * ==========================================================
 * UI de Assuntos Excluídos da Última OS Antes do Cancelamento
 * ==========================================================
 * Abre num modal com busca: digita pra filtrar a lista, clica
 * num assunto pra alternar (excluir/manter como possível "última OS
 * antes do cancelamento"). Lista negra: por padrão nada está
 * excluído. Cada clique já salva e recalcula os indicadores na hora —
 * sem botão "Salvar". Reaproveita coletarAssuntosDistintos() de
 * js/ui/filtroglobal.js (mesma fonte de assuntos).
 */

function registrarAssuntosExcluidosCancelamento() {
    const botaoAbrir = document.getElementById("btnAbrirAssuntosExcluidosCancelamento");
    const inputBusca = document.getElementById("buscaAssuntoExcluidoCancelamento");

    if (botaoAbrir) botaoAbrir.addEventListener("click", abrirAssuntosExcluidosCancelamento);
    if (inputBusca) inputBusca.addEventListener("input", () => renderizarListaAssuntosExcluidosCancelamentoModal(inputBusca.value));

    renderizarResumoAssuntosExcluidosCancelamento();
}

function abrirAssuntosExcluidosCancelamento() {
    const inputBusca = document.getElementById("buscaAssuntoExcluidoCancelamento");
    if (inputBusca) inputBusca.value = "";

    renderizarListaAssuntosExcluidosCancelamentoModal("");
    abrirModal("modalAssuntosExcluidosCancelamento");

    if (inputBusca) inputBusca.focus();
}

function renderizarListaAssuntosExcluidosCancelamentoModal(termoBusca) {
    const container = document.getElementById("listaAssuntosExcluidosCancelamentoModal");
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

    const excluidos = APP.configuracoes.assuntosExcluidosCancelamento ?? new Set();

    container.innerHTML = filtrados.map(assunto => {
        const chave = normalizarTexto(assunto);
        const excluido = excluidos.has(chave);
        return `
            <div class="item-assunto-modal ${excluido ? "incluido" : ""}" data-assunto="${escaparHtml(chave)}">
                <span>${escaparHtml(assunto)}</span>
                <span class="item-assunto-tag">${excluido ? "Excluído — clique pra voltar a aparecer" : "Clique pra excluir"}</span>
            </div>
        `;
    }).join("");

    container.querySelectorAll(".item-assunto-modal").forEach(item => {
        item.addEventListener("click", () => alternarAssuntoExcluidoCancelamento(item.dataset.assunto));
    });
}

function alternarAssuntoExcluidoCancelamento(chaveAssunto) {
    const excluidos = APP.configuracoes.assuntosExcluidosCancelamento ?? new Set();

    if (excluidos.has(chaveAssunto)) {
        excluidos.delete(chaveAssunto);
    } else {
        excluidos.add(chaveAssunto);
    }

    APP.configuracoes.assuntosExcluidosCancelamento = excluidos;
    salvarAssuntosExcluidosCancelamento(excluidos);

    atualizarTodasAsTelas();

    const inputBusca = document.getElementById("buscaAssuntoExcluidoCancelamento");
    renderizarListaAssuntosExcluidosCancelamentoModal(inputBusca ? inputBusca.value : "");
    renderizarResumoAssuntosExcluidosCancelamento();
}

function renderizarResumoAssuntosExcluidosCancelamento() {
    const container = document.getElementById("resumoAssuntosExcluidosCancelamento");
    if (!container) return;

    const excluidos = APP.configuracoes.assuntosExcluidosCancelamento ?? new Set();

    container.innerHTML = excluidos.size === 0
        ? '<p class="alerta-vazio">Nenhum assunto excluído ainda — a OS mais recente antes do cancelamento sempre aparece.</p>'
        : `<p class="resumo-filtro">${excluidos.size} assunto(s) excluído(s) da última OS antes do cancelamento.</p>`;
}
