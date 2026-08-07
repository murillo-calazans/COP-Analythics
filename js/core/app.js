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
    registrarLogin();
    registrarModal("modalImportar");
    registrarModal("modalOS");
    registrarModal("modalFiltro");
    registrarModal("modalDiagnosticosExcluidos");
    registrarModal("modalTecnico");
    registrarModal("modalTecnicoDetalhe");
    registrarModal("modalGraficoCompleto");
    registrarModal("modalCliente");
    registrarModal("modalFiltroGlobal");
    registrarModal("modalFunilAssuntos");

    // Sem login, nada mais roda — a tela de login (ver js/ui/login.js)
    // é a única coisa visível até autenticar (css/layout.css,
    // body.nao-autenticado). Uma sessão do Supabase Auth já existente
    // (aba recarregada, por exemplo) pula direto pro app autenticado.
    const sessao = await obterSessaoAtual();

    if (sessao) {
        const usuario = await carregarUsuarioAtual(sessao);

        if (usuario) {
            APP.usuario = usuario;
            APP.status.autenticado = true;
            mostrarAppAutenticado();
            await inicializarDadosAutenticado();
        } else {
            await sair();
            mostrarTelaLogin();
        }
    } else {
        mostrarTelaLogin();
    }

    APP.status.inicializado = true;

}

/**
 * Busca os dados compartilhados do Supabase e mostra o Dashboard —
 * chamado tanto ao carregar a página com sessão já ativa (acima)
 * quanto logo depois de um login bem-sucedido (js/ui/login.js).
 */
async function inicializarDadosAutenticado() {
    const carregado = await tentarRestaurarEstado();

    const status = document.getElementById("status");

    if (carregado) {
        fecharModal("modalImportar");

        APP.indicadores.recorrencia = IndicatorEngine.calcularRecorrencia(FiltroEngine.ordensFiltradas());
        atualizarBadgeAlertas();

        if (status) {
            status.textContent =
                `Dados carregados: ${APP.dados.ordens.size} ordens, ` +
                `${APP.referencias.operadores.size} operadores, ${APP.referencias.eventos.size} eventos, ` +
                `${APP.referencias.diagnosticos.size} diagnósticos.`;
        }
    } else if (ehAdmin()) {
        // Sem dado nenhum ainda — só faz sentido oferecer o popup de
        // importação pra quem pode importar.
        abrirModal("modalImportar");
    }

    renderizarDashboard();
}

function registrarEventos() {

    const botaoAbrirImportar = document.getElementById("btnAbrirImportar");
    const botaoGerarRelatorio = document.getElementById("btnGerarRelatorio");
    const botaoLimparDados = document.getElementById("btnLimparDados");

    if (botaoAbrirImportar) botaoAbrirImportar.addEventListener("click", () => abrirModal("modalImportar"));
    if (botaoGerarRelatorio) botaoGerarRelatorio.addEventListener("click", gerarRelatorio);
    if (botaoLimparDados) botaoLimparDados.addEventListener("click", limparDadosImportados);

}
