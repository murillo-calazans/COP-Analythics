const MODULO_DA_SECAO = {
    "inicio": "inicio",
    "acompanhamento-cop": "cop",
    "clientes-cto": "clientes",
    "alertas": "clientes",
    "ctos-lacres": "clientes",
    "enderecos": "clientes",
    "agenda-agendadas": "agendador",   // 1ª aba "Ordens" (relatórios)
    "agenda-hoje": "agendador",        // 2ª aba "Agenda"
    "escala-hoje": "escala",
    "escala-contatos": "escala",
    "escala-capacidade": "escala",
    "escala-terceiras": "escala",
    "usuarios": "admin",
    "configuracoes": "admin"
};

const SECOES_SEMPRE_LIBERADAS = ["inicio", "usuarios", "configuracoes"];

function podeVerSecao(nome) {
    if (SECOES_SEMPRE_LIBERADAS.includes(nome)) return true;
    const abas = APP.usuario?.abasVisiveis;
    if (!abas || (typeof ehAdmin === "function" && ehAdmin())) return true;
    // OS agendadas saiu de dentro da Agenda do dia (23/11): quem vê a agenda vê as agendadas
    if (nome === "agenda-agendadas") return abas.includes("agenda-hoje");
    if (nome === "escala-terceiras") return abas.includes("escala-capacidade");
    // 25/11: todo atendente vê o Acompanhamento COP (o conteúdo já vem filtrado pelo grupo do login)
    if (nome === "acompanhamento-cop") return true;
    return abas.includes(nome);
}

function primeiraSecaoLiberada(modulo) {
    return Object.keys(MODULO_DA_SECAO).find(s => MODULO_DA_SECAO[s] === modulo && podeVerSecao(s)) ?? null;
}

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
    const modulo = MODULO_DA_SECAO[nome] || "inicio";

    const abas = document.querySelectorAll("nav.menu [data-secao]");
    const doModulo = [...abas].filter(b => MODULO_DA_SECAO[b.dataset.secao] === modulo && podeVerSecao(b.dataset.secao));
    abas.forEach(b => { b.hidden = doModulo.length < 2 || !doModulo.includes(b); });

    if (typeof marcarModuloAtivoMenuLateral === "function") marcarModuloAtivoMenuLateral(modulo);
}

function mostrarSecao(nome) {

    if (nome === "configuracoes" && typeof ehAdmin === "function" && !ehAdmin()) {
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
    if (nome === "alertas") renderizarAlertas();
    if (nome === "ctos-lacres") renderizarCtosLacres();
    if (nome === "clientes-cto") renderizarClientesCto();
    if (nome === "enderecos") renderizarEnderecos();
    if (nome === "escala-hoje") renderizarEscalaHoje();
    if (nome === "escala-contatos" && typeof renderizarEscalaContatos === "function") renderizarEscalaContatos();
    if (nome === "escala-capacidade" && typeof renderizarEscalaCapacidade === "function") renderizarEscalaCapacidade();
    if (nome === "escala-terceiras" && typeof renderizarEscalaTerceiras === "function") renderizarEscalaTerceiras();
    if (nome === "acompanhamento-cop" && typeof renderizarAcompanhamentoCop === "function") renderizarAcompanhamentoCop();
    if (nome === "agenda-agendadas" && typeof carregarAgendaAgendadas === "function") carregarAgendaAgendadas();
    if (nome === "agenda-hoje") {
        const sub = document.getElementById("agendaHojeData");
        if (sub) sub.textContent = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
        if (typeof ativarAbaAgenda === "function") ativarAbaAgenda("agendadas");
    }

    if (typeof renderizarInfografico === "function") renderizarInfografico(nome);
    if (nome === "usuarios") renderizarAdminUsuarios();
    if (nome === "configuracoes") {
        if (typeof renderizarAcessoUsuarios === "function") renderizarAcessoUsuarios();
    }
}
