/**
 * ==========================================================
 * Navegação entre Seções
 * ==========================================================
 * Só troca qual <section class="secao"> fica visível — nenhum
 * cálculo acontece aqui, é puramente apresentação. Seletor é
 * global (não preso a "nav.menu") porque o botão de
 * Configurações vive fora da nav, junto dos utilitários.
 *
 * Cada seção pertence a um módulo do menu lateral (ver
 * js/ui/menulateral.js); o menu do topo só mostra as abas do
 * módulo aberto. A seção atual fica no endereço (#auditoria), pra
 * dar pra abrir direto de outra página ou de um favorito.
 */

const MODULO_DA_SECAO = {
    "dashboard": "ordens",
    "ordens": "ordens",
    "tecnicos": "ordens",
    "indicadores": "ordens",
    "terceiras": "terceiras",
    "auditoria": "auditoria",
    "auditoria-ia": "auditoria",
    "alertas": "alertas",
    "configuracoes": "admin"
};

function registrarNavegacao() {
    const botoes = document.querySelectorAll("[data-secao]");
    botoes.forEach(botao => {
        botao.addEventListener("click", () => mostrarSecao(botao.dataset.secao));
    });

    window.addEventListener("hashchange", abrirSecaoDoEndereco);
    atualizarMenuDoModulo("dashboard");
}

/**
 * Abre a seção pedida no endereço (index.html#alertas). Chamado ao
 * terminar de carregar os dados (js/core/app.js) e quando o # muda.
 */
function abrirSecaoDoEndereco() {
    const nome = decodeURIComponent(location.hash.slice(1));
    if (nome && MODULO_DA_SECAO[nome] && !document.getElementById(`secao-${nome}`)?.classList.contains("ativa")) {
        mostrarSecao(nome);
    }
}

function atualizarMenuDoModulo(nome) {
    const modulo = MODULO_DA_SECAO[nome] || "ordens";

    // Abas do topo: só as do módulo atual; módulo de uma tela só não mostra aba.
    const abas = document.querySelectorAll("nav.menu [data-secao]");
    const doModulo = [...abas].filter(b => MODULO_DA_SECAO[b.dataset.secao] === modulo);
    abas.forEach(b => { b.hidden = doModulo.length < 2 || !doModulo.includes(b); });

    if (typeof marcarModuloAtivoMenuLateral === "function") marcarModuloAtivoMenuLateral(modulo);
}

function mostrarSecao(nome) {
    document.querySelectorAll("section.secao").forEach(secao => {
        secao.classList.toggle("ativa", secao.id === `secao-${nome}`);
    });

    document.querySelectorAll("[data-secao]").forEach(botao => {
        botao.classList.toggle("ativo", botao.dataset.secao === nome);
    });

    atualizarMenuDoModulo(nome);
    if (location.hash.slice(1) !== nome) history.replaceState(null, "", `#${nome}`);

    if (nome === "dashboard") renderizarDashboard();
    if (nome === "auditoria") renderizarPainelAuditoriaOperacional();
    if (nome === "ordens") renderizarOrdens();
    if (nome === "tecnicos") renderizarSecaoTecnicos();
    if (nome === "indicadores") renderizarSecaoIndicadores();
    if (nome === "alertas") renderizarAlertas();
    if (nome === "configuracoes") {
        preencherFormularioConfig();
        renderizarResumoFiltroAssuntos();
    }
}
