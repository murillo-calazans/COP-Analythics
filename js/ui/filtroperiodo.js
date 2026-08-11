/**
 * ==========================================================
 * UI do Filtro Global
 * ==========================================================
 * Modal com período (único) + assunto/cidade/bairro/evento/
 * operador/setor (seleção múltipla, com busca e chips) +
 * diagnóstico (lista com toggle, lógica invertida — ver mais
 * abaixo). Ao aplicar, recalcula tudo que depende do recorte
 * filtrado — Dashboard, Alertas, Técnicos e a busca de Auditoria
 * (se houver uma ativa). Não decide regra nenhuma aqui — só lê o
 * formulário e chama FiltroEngine/IndicatorEngine.
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
let _opcoesFiltroGlobal = { assuntos: [], cidades: [], bairros: [], eventos: [], operadores: [], setores: [], diagnosticos: [] };

// Diagnóstico é o único campo com lógica invertida (lista negra): guarda
// as CHAVES normalizadas dos diagnósticos ESCONDIDOS, não dos mostrados —
// tudo que não estiver aqui continua visível (padrão: nada escondido).
let _diagnosticosOcultosPendentes = [];

function registrarFiltroGlobal() {
    const botaoAbrir = document.getElementById("btnAbrirFiltroGlobal");
    const botaoAplicar = document.getElementById("btnAplicarFiltroGlobal");
    const botaoLimpar = document.getElementById("btnLimparFiltroGlobal");
    const buscaDiagnostico = document.getElementById("buscaFiltroDiagnostico");

    if (botaoAbrir) botaoAbrir.addEventListener("click", abrirFiltroGlobal);
    if (botaoAplicar) botaoAplicar.addEventListener("click", aplicarFiltroGlobalDaTela);
    if (botaoLimpar) botaoLimpar.addEventListener("click", limparFiltroGlobal);
    if (buscaDiagnostico) {
        buscaDiagnostico.addEventListener("input", () => renderizarListaFiltroDiagnosticos(buscaDiagnostico.value));
    }

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
    _diagnosticosOcultosPendentes = [...APP.filtrosGlobais.diagnosticosOcultos];

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

    const buscaDiagnostico = document.getElementById("buscaFiltroDiagnostico");
    if (buscaDiagnostico) buscaDiagnostico.value = "";
    renderizarListaFiltroDiagnosticos("");

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

/**
 * Diagnóstico é o único campo do Filtro Global com lógica invertida:
 * mostra TODOS os diagnósticos como "visível" por padrão — clicar
 * ESCONDE (some da tela, evento é o oposto dos outros campos, que
 * começam vazios e você ADICIONA pra restringir).
 */
function renderizarListaFiltroDiagnosticos(termoBusca) {
    const container = document.getElementById("listaFiltroDiagnosticos");
    if (!container) return;

    const todos = _opcoesFiltroGlobal.diagnosticos ?? [];

    if (todos.length === 0) {
        container.innerHTML = '<p class="alerta-vazio">Importe dados pra ver os diagnósticos.</p>';
        return;
    }

    const termoNormalizado = normalizarTexto(termoBusca ?? "");
    const filtrados = termoNormalizado
        ? todos.filter(diagnostico => normalizarTexto(diagnostico).includes(termoNormalizado))
        : todos;

    if (filtrados.length === 0) {
        container.innerHTML = '<p class="alerta-vazio">Nenhum diagnóstico bate com esse termo.</p>';
        return;
    }

    container.innerHTML = filtrados.map(diagnostico => {
        const chave = normalizarTexto(diagnostico);
        const oculto = _diagnosticosOcultosPendentes.includes(chave);
        return `
            <div class="item-assunto-modal ${!oculto ? "incluido" : ""}" data-diagnostico="${escaparHtml(chave)}">
                <span>${escaparHtml(diagnostico)}</span>
                <span class="item-assunto-tag">${oculto ? "Oculto — clique pra mostrar" : "Visível — clique pra ocultar"}</span>
            </div>
        `;
    }).join("");

    container.querySelectorAll(".item-assunto-modal").forEach(item => {
        item.addEventListener("click", () => alternarDiagnosticoOculto(item.dataset.diagnostico));
    });
}

function alternarDiagnosticoOculto(chaveDiagnostico) {
    if (_diagnosticosOcultosPendentes.includes(chaveDiagnostico)) {
        _diagnosticosOcultosPendentes = _diagnosticosOcultosPendentes.filter(d => d !== chaveDiagnostico);
    } else {
        _diagnosticosOcultosPendentes.push(chaveDiagnostico);
    }

    const busca = document.getElementById("buscaFiltroDiagnostico");
    renderizarListaFiltroDiagnosticos(busca ? busca.value : "");
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
        setores: [..._filtrosPendentes.setores],
        diagnosticosOcultos: [..._diagnosticosOcultosPendentes]
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
        setores: [],
        diagnosticosOcultos: []
    };

    _filtrosPendentes = { assuntos: [], cidades: [], bairros: [], eventos: [], operadores: [], setores: [] };
    _diagnosticosOcultosPendentes = [];

    const dataInicio = document.getElementById("filtroDataInicio");
    const dataFim = document.getElementById("filtroDataFim");
    if (dataInicio) dataInicio.value = "";
    if (dataFim) dataFim.value = "";

    CAMPOS_MULTIPLOS_FILTRO.forEach(campo => renderizarChips(campo.chave));

    const buscaDiagnostico = document.getElementById("buscaFiltroDiagnostico");
    if (buscaDiagnostico) buscaDiagnostico.value = "";
    renderizarListaFiltroDiagnosticos("");

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
