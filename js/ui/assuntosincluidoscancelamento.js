/**
 * ==========================================================
 * UI de Assuntos Incluídos na Última OS Antes do Cancelamento
 * ==========================================================
 * Abre num modal com busca: digita pra filtrar a lista, clica
 * num assunto pra alternar (incluir/remover como possível "última OS
 * antes do cancelamento"). Lista branca: por padrão nada está
 * incluído. Cada clique já salva e recalcula os indicadores na hora —
 * sem botão "Salvar". Reaproveita coletarAssuntosDistintos() de
 * js/ui/filtroglobal.js (mesma fonte de assuntos).
 */

function registrarAssuntosIncluidosCancelamento() {
    const botaoAbrir = document.getElementById("btnAbrirAssuntosIncluidosCancelamento");
    const inputBusca = document.getElementById("buscaAssuntoIncluidoCancelamento");

    if (botaoAbrir) botaoAbrir.addEventListener("click", abrirAssuntosIncluidosCancelamento);
    if (inputBusca) inputBusca.addEventListener("input", () => renderizarListaAssuntosIncluidosCancelamentoModal(inputBusca.value));

    renderizarResumoAssuntosIncluidosCancelamento();
}

function abrirAssuntosIncluidosCancelamento() {
    const inputBusca = document.getElementById("buscaAssuntoIncluidoCancelamento");
    if (inputBusca) inputBusca.value = "";

    renderizarListaAssuntosIncluidosCancelamentoModal("");
    abrirModal("modalAssuntosIncluidosCancelamento");

    if (inputBusca) inputBusca.focus();
}

function renderizarListaAssuntosIncluidosCancelamentoModal(termoBusca) {
    const container = document.getElementById("listaAssuntosIncluidosCancelamentoModal");
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

    const incluidos = APP.configuracoes.assuntosIncluidosCancelamento ?? new Set();

    container.innerHTML = filtrados.map(assunto => {
        const chave = normalizarTexto(assunto);
        const incluido = incluidos.has(chave);
        return `
            <div class="item-assunto-modal ${incluido ? "incluido" : ""}" data-assunto="${escaparHtml(chave)}">
                <span>${escaparHtml(assunto)}</span>
                <span class="item-assunto-tag">${incluido ? "Incluído — clique pra remover" : "Clique pra incluir"}</span>
            </div>
        `;
    }).join("");

    container.querySelectorAll(".item-assunto-modal").forEach(item => {
        item.addEventListener("click", () => alternarAssuntoIncluidoCancelamento(item.dataset.assunto));
    });
}

function alternarAssuntoIncluidoCancelamento(chaveAssunto) {
    const incluidos = APP.configuracoes.assuntosIncluidosCancelamento ?? new Set();

    if (incluidos.has(chaveAssunto)) {
        incluidos.delete(chaveAssunto);
    } else {
        incluidos.add(chaveAssunto);
    }

    APP.configuracoes.assuntosIncluidosCancelamento = incluidos;
    salvarAssuntosIncluidosCancelamento(incluidos);

    atualizarTodasAsTelas();

    const inputBusca = document.getElementById("buscaAssuntoIncluidoCancelamento");
    renderizarListaAssuntosIncluidosCancelamentoModal(inputBusca ? inputBusca.value : "");
    renderizarResumoAssuntosIncluidosCancelamento();
}

function renderizarResumoAssuntosIncluidosCancelamento() {
    const container = document.getElementById("resumoAssuntosIncluidosCancelamento");
    if (!container) return;

    const incluidos = APP.configuracoes.assuntosIncluidosCancelamento ?? new Set();

    container.innerHTML = incluidos.size === 0
        ? '<p class="alerta-vazio">Nenhum assunto incluído ainda — nenhuma "última OS antes do cancelamento" vai aparecer até incluir algum.</p>'
        : `<p class="resumo-filtro">${incluidos.size} assunto(s) incluído(s) na última OS antes do cancelamento.</p>`;
}
