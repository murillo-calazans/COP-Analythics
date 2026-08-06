/**
 * ==========================================================
 * Navegação entre Seções
 * ==========================================================
 * Só troca qual <section class="secao"> fica visível — nenhum
 * cálculo acontece aqui, é puramente apresentação. Seletor é
 * global (não preso a "nav.menu") porque o botão de
 * Configurações vive fora da nav, junto dos utilitários.
 */

function registrarNavegacao() {
    const botoes = document.querySelectorAll("[data-secao]");
    botoes.forEach(botao => {
        botao.addEventListener("click", () => mostrarSecao(botao.dataset.secao));
    });
}

function mostrarSecao(nome) {
    document.querySelectorAll("section.secao").forEach(secao => {
        secao.classList.toggle("ativa", secao.id === `secao-${nome}`);
    });

    document.querySelectorAll("[data-secao]").forEach(botao => {
        botao.classList.toggle("ativo", botao.dataset.secao === nome);
    });

    if (nome === "dashboard") renderizarDashboard();
    if (nome === "tecnicos") renderizarSecaoTecnicos();
    if (nome === "indicadores") renderizarSecaoIndicadores();
    if (nome === "alertas") renderizarAlertas();
    if (nome === "configuracoes") {
        preencherFormularioConfig();
        renderizarResumoFiltroAssuntos();
    }
}
