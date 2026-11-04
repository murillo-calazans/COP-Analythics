const MODULO_DA_SECAO = {
    "inicio": "inicio",
    "dashboard": "ordens",
    "tempos": "ordens",
    "indicadores": "ordens",
    "cop-abertas": "cop",
    "gestao-cop": "cop",
    "ordens": "ordens",
    "tecnicos": "ordens",
    "mapa-calor": "ordens",
    "clientes-cto": "clientes",
    "alertas": "clientes",
    "ctos-lacres": "clientes",
    "enderecos": "clientes",
    "terceiras": "terceiras",
    "terceiras-fechamento": "terceiras",
    "terceiras-lpu": "terceiras",
    "terceiras-qualidade": "terceiras",
    "auditoria": "auditoria",
    "auditoria-ia": "auditoria",
    "agenda-hoje": "agendador",
    "escala-hoje": "escala",
    "usuarios": "admin",
    "configuracoes": "admin"
};

const SECOES_SEMPRE_LIBERADAS = ["inicio", "usuarios", "configuracoes"];

function podeVerSecao(nome) {
    if (SECOES_SEMPRE_LIBERADAS.includes(nome)) return true;
    const abas = APP.usuario?.abasVisiveis;
    if (!abas || (typeof ehAdmin === "function" && ehAdmin())) return true;
    return abas.includes(nome);
}

function primeiraSecaoLiberada(modulo) {
    return Object.keys(MODULO_DA_SECAO).find(s => MODULO_DA_SECAO[s] === modulo && podeVerSecao(s)) ?? null;
}

const SECOES_INDICADORES = ["tempos", "indicadores", "gestao-cop"];

function registrarNavegacao() {
    const botoes = document.querySelectorAll("[data-secao]");
    botoes.forEach(botao => {
        botao.addEventListener("click", () => mostrarSecao(botao.dataset.secao));
    });

    window.addEventListener("hashchange", abrirSecaoDoEndereco);
    atualizarMenuDoModulo("inicio");

    const logo = document.querySelector("header .logo");
    if (logo) {
        logo.style.cursor = "pointer";
        logo.title = "Início";
        logo.addEventListener("click", () => mostrarSecao("inicio"));
    }
}

function secaoAtiva() {
    return document.querySelector("section.secao.ativa")?.id.replace("secao-", "") ?? "inicio";
}

function renderizarSecaoAtiva() {
    mostrarSecao(secaoAtiva());
}

function abrirSecaoDoEndereco() {
    const nome = decodeURIComponent(location.hash.slice(1));
    if (nome && MODULO_DA_SECAO[nome] && !document.getElementById(`secao-${nome}`)?.classList.contains("ativa")) {
        mostrarSecao(nome);
    }
}

function atualizarMenuDoModulo(nome) {
    const modulo = MODULO_DA_SECAO[nome] || "ordens";

    const abas = document.querySelectorAll("nav.menu [data-secao]");
    const doModulo = [...abas].filter(b => MODULO_DA_SECAO[b.dataset.secao] === modulo && podeVerSecao(b.dataset.secao));
    abas.forEach(b => { b.hidden = doModulo.length < 2 || !doModulo.includes(b); });

    if (typeof marcarModuloAtivoMenuLateral === "function") marcarModuloAtivoMenuLateral(modulo);
}

function mostrarSecao(nome) {

    if (MODULO_DA_SECAO[nome] === "terceiras" && typeof podeEditarOperacao === "function" && !podeEditarOperacao()) {
        return mostrarSecao("inicio");
    }

    if (!podeVerSecao(nome)) {
        return mostrarSecao(primeiraSecaoLiberada(MODULO_DA_SECAO[nome]) ?? "inicio");
    }

    const moduloFiltro = MODULO_DA_SECAO[nome] || "ordens";
    if (APP.moduloFiltroAtual && APP.moduloFiltroAtual !== moduloFiltro) {
        APP.filtrosGlobais = {
            dataInicio: inicioMesAtual(), dataFim: fimDeHoje(),
            assuntos: [], cidades: [], bairros: [], operadores: [], setores: [], diagnosticosOcultos: []
        };
        if (typeof atualizarBadgeFiltroGlobal === "function") atualizarBadgeFiltroGlobal();
        if (typeof renderizarFiltrosAtivos === "function") renderizarFiltrosAtivos();
    }
    APP.moduloFiltroAtual = moduloFiltro;

    document.querySelectorAll("section.secao").forEach(secao => {
        secao.classList.toggle("ativa", secao.id === `secao-${nome}`);
    });

    document.querySelectorAll("[data-secao]").forEach(botao => {
        botao.classList.toggle("ativo", botao.dataset.secao === nome);
    });

    atualizarMenuDoModulo(nome);
    if (location.hash.slice(1) !== nome) history.replaceState(null, "", nome === "inicio" ? location.pathname : `#${nome}`);

    if (nome === "inicio") renderizarInicio();
    if (nome === "dashboard") renderizarDashboard();
    if (nome === "cop-abertas") renderizarCopAbertas();
    if (nome === "auditoria") renderizarPainelAuditoriaOperacional();
    if (nome === "ordens") renderizarOrdens();
    if (nome === "tecnicos") renderizarSecaoTecnicos();
    if (SECOES_INDICADORES.includes(nome)) renderizarSecaoIndicadores();
    if (nome === "alertas") renderizarAlertas();
    if (nome === "ctos-lacres") renderizarCtosLacres();
    if (nome === "clientes-cto") renderizarClientesCto();
    if (nome === "enderecos") renderizarEnderecos();
    if (nome === "mapa-calor") renderizarMapaCalor();
    if (nome === "escala-hoje") renderizarEscalaHoje();
    if (nome === "agenda-hoje") {
        renderizarAgendaHoje();
        if (typeof ativarAbaAgenda === "function") ativarAbaAgenda("aberto");
    }

    if (typeof renderizarInfografico === "function") renderizarInfografico(nome);
    if (nome === "usuarios") renderizarAdminUsuarios();
    if (nome === "terceiras") renderizarTerceirasPainel();
    if (nome === "terceiras-fechamento") renderizarTerceirasFechamento();
    if (nome === "terceiras-lpu") renderizarTerceirasLpu();
    if (nome === "terceiras-qualidade") renderizarTerceirasQualidade();
    if (nome === "configuracoes") {
        preencherFormularioConfig();
        renderizarResumoFiltroAssuntos();
        if (typeof renderizarAcessoUsuarios === "function") renderizarAcessoUsuarios();
    }
}
