/**
 * ==========================================================
 * UI de Modal — Popup genérico
 * ==========================================================
 * Suporta múltiplos modais na mesma página, identificados por
 * ID. Cada modal precisa de um botão com [data-fechar-modal]
 * dentro dele para fechar.
 *
 * Suporta também "modal com retorno": abrir um modal a partir de
 * outro (ex.: OS aberta de dentro da ficha do técnico) e, ao
 * fechar, voltar pro modal anterior em vez de fechar tudo. Isso
 * é opcional — um modal aberto sem retorno fecha normalmente.
 */

const _modalRetorno = new Map(); // idModalAberto -> idModalParaVoltar

function abrirModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add("aberto");
}

function abrirModalComRetorno(idNovo, idAnterior) {
    fecharModalSemRetorno(idAnterior);
    _modalRetorno.set(idNovo, idAnterior);
    abrirModal(idNovo);
}

function fecharModalSemRetorno(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove("aberto");
}

function fecharModal(id) {
    fecharModalSemRetorno(id);

    const idRetorno = _modalRetorno.get(id);
    if (idRetorno) {
        _modalRetorno.delete(id);
        abrirModal(idRetorno);
    }
}

function fecharTodosModais() {
    document.querySelectorAll(".modal.aberto").forEach(modal => fecharModal(modal.id));
}

function registrarModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;

    const botaoFechar = modal.querySelector("[data-fechar-modal]");
    if (botaoFechar) botaoFechar.addEventListener("click", () => fecharModal(id));

    modal.addEventListener("click", evento => {
        if (evento.target === modal) fecharModal(id);
    });
}

document.addEventListener("keydown", evento => {
    if (evento.key === "Escape") fecharTodosModais();
});
