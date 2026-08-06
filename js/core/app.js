/**
 * ==========================================================
 * Inicialização da Aplicação
 * ==========================================================
 */

document.addEventListener("DOMContentLoaded", iniciarSistema);

async function iniciarSistema() {

    console.clear();

    console.log("========================================");
    console.log(APP.info.nome);
    console.log("Versão:", APP.info.versao);
    console.log("Inicializando...");
    console.log("========================================");

    carregarConfigColunasSalva();
    APP.configuracoes.assuntosIncluidos = carregarAssuntosIncluidos();
    APP.configuracoes.funilAssuntos = carregarFunilAssuntos();
    APP.configuracoes.diagnosticosExcluidosTempo = carregarDiagnosticosExcluidosTempo();
    aplicarTemaSalvo();

    registrarEventos();
    registrarNavegacao();
    registrarTema();
    registrarFormularioConfig();
    registrarFiltroAssuntos();
    registrarFiltroGlobal();
    registrarFunilAssuntos();
    registrarDiagnosticosExcluidos();
    registrarBuscaAuditoria();
    registrarBuscaTecnicos();
    registrarModal("modalImportar");
    registrarModal("modalOS");
    registrarModal("modalFiltro");
    registrarModal("modalDiagnosticosExcluidos");
    registrarModal("modalTecnico");
    registrarModal("modalTecnicoDetalhe");
    registrarModal("modalCliente");
    registrarModal("modalFiltroGlobal");
    registrarModal("modalFunilAssuntos");

    await tentarRestaurarDoArmazenamento();

    // Sem dado nenhum ainda: o popup de importação já nasce aberto no
    // HTML (classe "aberto"), então não faz nada aqui. Com dado
    // restaurado, fecha o popup — não precisa importar de novo.
    if (APP.status.baseCarregada) {
        fecharModal("modalImportar");
    }

    renderizarDashboard();

    APP.status.inicializado = true;

}

async function tentarRestaurarDoArmazenamento() {
    const restaurado = await tentarRestaurarEstado();
    if (!restaurado) return;

    const status = document.getElementById("status");
    APP.indicadores.recorrencia = IndicatorEngine.calcularRecorrencia(FiltroEngine.ordensFiltradas());
    atualizarBadgeAlertas();

    if (status) {
        status.textContent =
            `Dados restaurados do último import: ${APP.dados.ordens.size} ordens, ` +
            `${APP.referencias.operadores.size} operadores, ${APP.referencias.eventos.size} eventos, ` +
            `${APP.referencias.diagnosticos.size} diagnósticos.`;
    }
}

function registrarEventos() {

    const botaoAbrirImportar = document.getElementById("btnAbrirImportar");
    const botaoGerarRelatorio = document.getElementById("btnGerarRelatorio");
    const botaoLimparDados = document.getElementById("btnLimparDados");

    if (botaoAbrirImportar) botaoAbrirImportar.addEventListener("click", () => abrirModal("modalImportar"));
    if (botaoGerarRelatorio) botaoGerarRelatorio.addEventListener("click", gerarRelatorio);
    if (botaoLimparDados) botaoLimparDados.addEventListener("click", limparDadosImportados);

}
