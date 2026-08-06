/**
 * ==========================================================
 * UI de Tema (claro/escuro)
 * ==========================================================
 * O cabeçalho é sempre navy (cor de marca fixa); só o conteúdo
 * alterna, via atributo data-tema na <html> + variáveis CSS
 * (ver css/style.css). Escolha persistida no localStorage.
 */

const TEMA_CHAVE_STORAGE = "cop_analytics_tema";

const TEMA_ICONE_LUA =
    '<svg class="icone" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

const TEMA_ICONE_SOL =
    '<svg class="icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>' +
    '<line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>' +
    '<line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>' +
    '<line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';

function aplicarTemaSalvo() {
    const salvo = localStorage.getItem(TEMA_CHAVE_STORAGE);
    if (salvo === "dark") {
        document.documentElement.dataset.tema = "dark";
    }
    atualizarIconeTema();
}

function alternarTema() {
    const escuro = document.documentElement.dataset.tema === "dark";

    if (escuro) {
        delete document.documentElement.dataset.tema;
        localStorage.setItem(TEMA_CHAVE_STORAGE, "light");
    } else {
        document.documentElement.dataset.tema = "dark";
        localStorage.setItem(TEMA_CHAVE_STORAGE, "dark");
    }

    atualizarIconeTema();
}

function atualizarIconeTema() {
    const botao = document.getElementById("btnTema");
    if (!botao) return;

    const escuro = document.documentElement.dataset.tema === "dark";
    botao.innerHTML = escuro ? TEMA_ICONE_SOL : TEMA_ICONE_LUA;
    botao.title = escuro ? "Mudar para tema claro" : "Mudar para tema escuro";
}

function registrarTema() {
    const botao = document.getElementById("btnTema");
    if (botao) botao.addEventListener("click", alternarTema);
}
