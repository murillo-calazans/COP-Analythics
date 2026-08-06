/**
 * ==========================================================
 * UI do Filtro Global
 * ==========================================================
 * Modal com período (único) + assunto/cidade/bairro/evento/
 * operador (seleção múltipla, com busca e chips). Ao aplicar,
 * recalcula tudo que depende do recorte filtrado — Dashboard,
 * Alertas, Técnicos e a busca de Auditoria (se houver uma
 * ativa). Não decide regra nenhuma aqui — só lê o formulário e
 * chama FiltroEngine/IndicatorEngine.
 */

const CAMPOS_MULTIPLOS_FILTRO = [
    { chave: "assuntos", rotulo: "Assunto" },
    { chave: "cidades", rotulo: "Cidade" },
    { chave: "bairros", rotulo: "Bairro" },
    { chave: "eventos", rotulo: "Evento" },
    { chave: "operadores", rotulo: "Operador" },
    { chave: "setores", rotulo: "Setor" }
];

let _filtrosPendentes = { assuntos: [], cidades: [], bairros: [], eventos: [], operadores: [], setores: [] };
let _opcoesFiltroGlobal = { assuntos: [], cidades: [], bairros: [], eventos: [], operadores: [], setores: [] };

function registrarFiltroGlobal() {
    const botaoAbrir = document.getElementById("btnAbrirFiltroGlobal");
    const botaoAplicar = document.getElementById("btnAplicarFiltroGlobal");
    const botaoLimpar = document.getElementById("btnLimparFiltroGlobal");

    if (botaoAbrir) botaoAbrir.addEventListener("click", abrirFiltroGlobal);
    if (botaoAplicar) botaoAplicar.addEventListener("click", aplicarFiltroGlobalDaTela);
    if (botaoLimpar) botaoLimpar.addEventListener("click", limparFiltroGlobal);

    montarCamposMultiplos();
    atualizarBadgeFiltroGlobal();
}

function montarCamposMultiplos() {
    const container = document.getElementById("filtrosMultiplosContainer");
    if (!container) return;

    container.innerHTML = CAMPOS_MULTIPLOS_FILTRO.map(campo => `
        <div class="seletor-multiplo">
            <label>${campo.rotulo}</label>
            <div class="seletor-multiplo-chips" id="chips-${campo.chave}"></div>
            <div class="seletor-multiplo-busca-wrap">
                <input type="text" class="seletor-multiplo-input" id="busca-${campo.chave}"
                    placeholder="Buscar ${campo.rotulo.toLowerCase()}..." autocomplete="off">
                <div class="seletor-multiplo-dropdown" id="dropdown-${campo.chave}" hidden></div>
            </div>
        </div>
    `).join("");

    CAMPOS_MULTIPLOS_FILTRO.forEach(campo => registrarSeletorMultiplo(campo.chave));
}

function registrarSeletorMultiplo(chave) {
    const busca = document.getElementById(`busca-${chave}`);
    if (!busca) return;

    busca.addEventListener("focus", () => renderizarDropdown(chave));
    busca.addEventListener("input", () => renderizarDropdown(chave));
    busca.addEventListener("blur", () => {
        // Atraso pra deixar o mousedown da opção disparar antes do dropdown sumir.
        setTimeout(() => fecharDropdown(chave), 150);
    });
}

function abrirFiltroGlobal() {
    if (APP.dados.ordens.size > 0) {
        _opcoesFiltroGlobal = FiltroEngine.coletarOpcoes(APP.dados.ordens);
    }

    _filtrosPendentes = {
        assuntos: [...APP.filtrosGlobais.assuntos],
        cidades: [...APP.filtrosGlobais.cidades],
        bairros: [...APP.filtrosGlobais.bairros],
        eventos: [...APP.filtrosGlobais.eventos],
        operadores: [...APP.filtrosGlobais.operadores],
        setores: [...APP.filtrosGlobais.setores]
    };

    document.getElementById("filtroDataInicio").value =
        APP.filtrosGlobais.dataInicio ? formatarDataParaInput(APP.filtrosGlobais.dataInicio) : "";
    document.getElementById("filtroDataFim").value =
        APP.filtrosGlobais.dataFim ? formatarDataParaInput(APP.filtrosGlobais.dataFim) : "";

    CAMPOS_MULTIPLOS_FILTRO.forEach(campo => {
        const busca = document.getElementById(`busca-${campo.chave}`);
        if (busca) busca.value = "";
        renderizarChips(campo.chave);
        fecharDropdown(campo.chave);
    });

    abrirModal("modalFiltroGlobal");
}

function renderizarChips(chave) {
    const container = document.getElementById(`chips-${chave}`);
    if (!container) return;

    const selecionados = _filtrosPendentes[chave] ?? [];

    container.innerHTML = selecionados.map(valor => `
        <span class="chip-selecionado" data-valor="${escaparHtml(valor)}">
            ${escaparHtml(valor)}
            <button type="button" aria-label="Remover ${escaparHtml(valor)}">&times;</button>
        </span>
    `).join("");

    container.querySelectorAll(".chip-selecionado button").forEach(botao => {
        botao.addEventListener("click", () => {
            const valor = botao.parentElement.dataset.valor;
            removerValorSelecionado(chave, valor);
        });
    });
}

function renderizarDropdown(chave) {
    const dropdown = document.getElementById(`dropdown-${chave}`);
    const busca = document.getElementById(`busca-${chave}`);
    if (!dropdown || !busca) return;

    const todasOpcoes = _opcoesFiltroGlobal[chave] ?? [];
    const selecionados = _filtrosPendentes[chave] ?? [];
    const termoNormalizado = normalizarTexto(busca.value);

    const disponiveis = todasOpcoes
        .filter(opcao => !selecionados.includes(opcao))
        .filter(opcao => !termoNormalizado || normalizarTexto(opcao).includes(termoNormalizado))
        .slice(0, 50);

    if (todasOpcoes.length === 0) {
        dropdown.innerHTML = '<div class="seletor-multiplo-vazio">Importe dados pra ver as opções.</div>';
    } else if (disponiveis.length === 0) {
        dropdown.innerHTML = '<div class="seletor-multiplo-vazio">Nenhuma opção encontrada.</div>';
    } else {
        dropdown.innerHTML = disponiveis.map(opcao => `
            <div class="seletor-multiplo-opcao" data-valor="${escaparHtml(opcao)}">${escaparHtml(opcao)}</div>
        `).join("");

        dropdown.querySelectorAll(".seletor-multiplo-opcao").forEach(item => {
            item.addEventListener("mousedown", evento => {
                evento.preventDefault(); // dispara antes do blur do campo de busca
                adicionarValorSelecionado(chave, item.dataset.valor);
            });
        });
    }

    dropdown.hidden = false;
}

function fecharDropdown(chave) {
    const dropdown = document.getElementById(`dropdown-${chave}`);
    if (dropdown) dropdown.hidden = true;
}

function adicionarValorSelecionado(chave, valor) {
    if (!_filtrosPendentes[chave].includes(valor)) {
        _filtrosPendentes[chave].push(valor);
    }

    const busca = document.getElementById(`busca-${chave}`);
    if (busca) busca.value = "";

    renderizarChips(chave);
    renderizarDropdown(chave);
}

function removerValorSelecionado(chave, valor) {
    _filtrosPendentes[chave] = _filtrosPendentes[chave].filter(v => v !== valor);
    renderizarChips(chave);
    renderizarDropdown(chave);
}

function formatarDataParaInput(data) {
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, "0");
    const dia = String(data.getDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
}

function aplicarFiltroGlobalDaTela() {
    const dataInicioBruta = document.getElementById("filtroDataInicio").value;
    const dataFimBruta = document.getElementById("filtroDataFim").value;

    APP.filtrosGlobais = {
        dataInicio: dataInicioBruta ? new Date(`${dataInicioBruta}T00:00:00`) : null,
        dataFim: dataFimBruta ? new Date(`${dataFimBruta}T23:59:59`) : null,
        assuntos: [..._filtrosPendentes.assuntos],
        cidades: [..._filtrosPendentes.cidades],
        bairros: [..._filtrosPendentes.bairros],
        eventos: [..._filtrosPendentes.eventos],
        operadores: [..._filtrosPendentes.operadores],
        setores: [..._filtrosPendentes.setores]
    };

    fecharModal("modalFiltroGlobal");
    atualizarBadgeFiltroGlobal();
    atualizarTodasAsTelas();
}

function limparFiltroGlobal() {
    APP.filtrosGlobais = {
        dataInicio: null,
        dataFim: null,
        assuntos: [],
        cidades: [],
        bairros: [],
        eventos: [],
        operadores: [],
        setores: []
    };

    _filtrosPendentes = { assuntos: [], cidades: [], bairros: [], eventos: [], operadores: [], setores: [] };

    const dataInicio = document.getElementById("filtroDataInicio");
    const dataFim = document.getElementById("filtroDataFim");
    if (dataInicio) dataInicio.value = "";
    if (dataFim) dataFim.value = "";

    CAMPOS_MULTIPLOS_FILTRO.forEach(campo => renderizarChips(campo.chave));

    atualizarBadgeFiltroGlobal();
    atualizarTodasAsTelas();
}

function atualizarBadgeFiltroGlobal() {
    const badge = document.getElementById("badgeFiltroGlobal");
    if (!badge) return;

    const total = FiltroEngine.contarFiltrosAtivos(APP.filtrosGlobais);
    badge.textContent = total;
    badge.hidden = total === 0;
}

function atualizarTodasAsTelas() {
    if (APP.dados.ordens.size === 0) return;

    const ordensFiltradas = FiltroEngine.ordensFiltradas();

    APP.indicadores.recorrencia = IndicatorEngine.calcularRecorrencia(ordensFiltradas);
    atualizarBadgeAlertas();

    renderizarDashboard();
    renderizarAlertas();
    renderizarSecaoTecnicos();
    renderizarSecaoIndicadores();

    const buscaAuditoria = document.getElementById("buscaAuditoria");
    if (buscaAuditoria && buscaAuditoria.value.trim()) {
        executarBuscaAuditoria();
    }
}
