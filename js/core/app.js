document.addEventListener("DOMContentLoaded", iniciarSistema);

async function iniciarSistema() {

    console.clear();

    console.log("========================================");
    console.log(APP.info.nome);
    console.log("Versão:", APP.info.versao);
    console.log("Inicializando...");
    console.log("========================================");

    aplicarConfiguracoesLocais();
    aplicarTemaSalvo();

    registrarEventos();
    registrarNavegacao();
    registrarEscalaHoje();
    registrarAbasAgenda();
    registrarRoboComando();
    registrarAdminUsuarios();
    registrarTema();
    registrarLogin();
    registrarAbasAlertas();
    registrarModal("modalAtrasadas");
    registrarModal("modalOS");
    registrarModal("modalCliente");
    registrarModal("modalOsIxc");
    registrarModal("modalGraficoCompleto");

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

function aplicarConfiguracoesLocais() {
    carregarConfigColunasSalva();
    APP.configuracoes.assuntosIncluidos = carregarAssuntosIncluidos();
    APP.configuracoes.funilAssuntos = carregarFunilAssuntos();
    APP.configuracoes.diagnosticosExcluidosTempo = carregarDiagnosticosExcluidosTempo();
    APP.configuracoes.diagnosticosExcluidosRecorrencia = carregarDiagnosticosExcluidosRecorrencia();
    APP.configuracoes.diagnosticosImprodutivos = carregarDiagnosticosImprodutivos();
    APP.configuracoes.assuntosIncluidosCancelamento = carregarAssuntosIncluidosCancelamento();
    APP.configuracoes.setoresCop = carregarSetoresCop();
}

async function inicializarDadosAutenticado() {

    await ConfigRemota.carregarTudo();
    aplicarConfiguracoesLocais();

    const tinhaCache = await restaurarDoCacheLocal();

    if (!tinhaCache) mostrarCarregandoDados();

    buscarCorrecoesAuditoria().then(mapa => { APP.correcoesAuditoria = mapa; });

    const carregado = await atualizarDoSupabase(
        mensagem => atualizarTextoCarregando(`Carregando ${mensagem}...`),
        tinhaCache
    );
    if (carregado && typeof atualizarAlertas === "function") {
        APP.indicadores.recorrencia = IndicatorEngine.calcularRecorrencia(FiltroEngine.ordensFiltradas());
        atualizarAlertas();
    }

    if (!tinhaCache) esconderCarregandoDados();

    const status = document.getElementById("status");

    if (carregado) {
        if (status) {
            status.textContent =
                `Dados carregados: ${APP.dados.ordens.size} ordens, ` +
                `${APP.referencias.operadores.size} operadores, ${APP.referencias.eventos.size} eventos, ` +
                `${APP.referencias.diagnosticos.size} diagnósticos.`;
        }
    }

    const secaoAntes = secaoAtiva();
    abrirSecaoDoEndereco();
    if (secaoAtiva() === secaoAntes) renderizarSecaoAtiva();

    iniciarAoVivo();
}

function registrarEventos() {
    // 25/11: relatórios, importação de planilha e logs foram para o site Gestão COP
    document.getElementById("btnLimparCache")?.addEventListener("click", limparCacheEAtualizar);
}

function mostrarCarregandoDados() {
    const overlay = document.getElementById("carregandoDados");
    if (overlay) overlay.hidden = false;
    atualizarTextoCarregando("Carregando dados do banco compartilhado...");
}

function atualizarTextoCarregando(texto) {
    const elemento = document.getElementById("carregandoDadosTexto");
    if (elemento) elemento.textContent = texto;
}

function esconderCarregandoDados() {
    const overlay = document.getElementById("carregandoDados");
    if (overlay) overlay.hidden = true;
}

async function limparCacheEAtualizar() {
    const confirmado = confirm(
        "Isso vai limpar o cache local deste navegador e recarregar a página, buscando a versão " +
        "mais recente do site. Use se a tela parecer estar desatualizada. Continuar?"
    );
    if (!confirmado) return;

    try {
        await limparCacheLocal();
    } catch (erro) {
        console.warn("Falha ao limpar cache local (IndexedDB):", erro);
    }

    if (window.caches?.keys) {
        try {
            const nomes = await caches.keys();
            await Promise.all(nomes.map(nome => caches.delete(nome)));
        } catch (erro) {
            console.warn("Falha ao limpar Cache Storage:", erro);
        }
    }

    if (navigator.serviceWorker?.getRegistrations) {
        try {
            const registros = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registros.map(registro => registro.unregister()));
        } catch (erro) {
            console.warn("Falha ao remover service workers:", erro);
        }
    }

    location.href = location.pathname + "?_cb=" + Date.now();
}
