/**
 * ==========================================================
 * UI do Filtro Global
 * ==========================================================
 * Modal com período (único, filtra pela data de FINALIZAÇÃO da OS) +
 * assunto/cidade/bairro/operador/setor/diagnóstico — cada campo é um
 * botão que abre um popup compartilhado (modalSeletorFiltro) com
 * busca por nome e caixa de marcação, igual pros seis campos.
 * Operador e setor consideram só quem FECHOU a OS (ver
 * js/engine/filtroengine.js). Ao aplicar, recalcula tudo que depende do
 * recorte filtrado — Dashboard, Técnicos, Indicadores e a busca de
 * Auditoria (se houver uma ativa). Alertas é a única tela independente
 * disso (ver js/ui/alertas.js). Não decide regra nenhuma aqui — só lê o
 * formulário e chama FiltroEngine/IndicatorEngine.
 *
 * Diagnóstico é o único campo "invertido" (chave "diagnosticos",
 * invertido:true): guarda as CHAVES normalizadas dos diagnósticos
 * ESCONDIDOS, não dos mostrados — tudo que não estiver na lista de
 * ocultos continua visível (padrão: nada escondido, caixa vem
 * marcada). Os demais campos são lista branca normal: guardam os
 * valores SELECIONADOS, caixa começa desmarcada.
 */

const CAMPOS_MULTIPLOS_FILTRO = [
    { chave: "assuntos", rotulo: "Assunto" },
    { chave: "cidades", rotulo: "Cidade" },
    { chave: "bairros", rotulo: "Bairro" },
    { chave: "operadores", rotulo: "Colaborador Responsável" },
    { chave: "setores", rotulo: "Setor" },
    { chave: "diagnosticos", rotulo: "Diagnóstico", invertido: true }
];

let _filtrosPendentes = { assuntos: [], cidades: [], bairros: [], operadores: [], setores: [] };
let _opcoesFiltroGlobal = { assuntos: [], cidades: [], bairros: [], operadores: [], setores: [], diagnosticos: [] };
let _diagnosticosOcultosPendentes = [];

// Campo atualmente aberto no popup compartilhado (modalSeletorFiltro) — null quando nenhum está aberto.
let _campoPopupAtivo = null;

function registrarFiltroGlobal() {
    const botaoAbrir = document.getElementById("btnAbrirFiltroGlobal");
    const botaoAplicar = document.getElementById("btnAplicarFiltroGlobal");
    const botaoLimpar = document.getElementById("btnLimparFiltroGlobal");
    const buscaSeletor = document.getElementById("buscaSeletorFiltro");
    const botaoSelecionarTodos = document.getElementById("btnSeletorFiltroSelecionarTodos");
    const botaoLimparSelecao = document.getElementById("btnSeletorFiltroLimpar");

    if (botaoAbrir) botaoAbrir.addEventListener("click", abrirFiltroGlobal);
    if (botaoAplicar) botaoAplicar.addEventListener("click", aplicarFiltroGlobalDaTela);
    if (botaoLimpar) botaoLimpar.addEventListener("click", limparFiltroGlobal);
    if (buscaSeletor) buscaSeletor.addEventListener("input", () => renderizarListaSeletorFiltro(buscaSeletor.value));
    if (botaoSelecionarTodos) botaoSelecionarTodos.addEventListener("click", selecionarTodosVisiveisSeletorFiltro);
    if (botaoLimparSelecao) botaoLimparSelecao.addEventListener("click", limparSelecaoSeletorFiltro);

    montarCamposMultiplos();
    atualizarBadgeFiltroGlobal();
}

/** Um botão por campo (não mais dropdown+chips inline) — clicar abre o popup compartilhado com busca e checkbox. */
function montarCamposMultiplos() {
    const container = document.getElementById("filtrosMultiplosContainer");
    if (!container) return;

    container.innerHTML = CAMPOS_MULTIPLOS_FILTRO.map(campo => `
        <div class="seletor-multiplo">
            <label>${campo.rotulo}</label>
            <button type="button" class="seletor-multiplo-abrir" data-campo="${campo.chave}">
                <span class="seletor-multiplo-resumo" id="resumo-${campo.chave}">Todos</span>
                <span class="seletor-multiplo-seta">▾</span>
            </button>
        </div>
    `).join("");

    container.querySelectorAll(".seletor-multiplo-abrir").forEach(botao => {
        const campo = CAMPOS_MULTIPLOS_FILTRO.find(c => c.chave === botao.dataset.campo);
        if (campo) botao.addEventListener("click", () => abrirSeletorFiltro(campo));
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
        operadores: [...APP.filtrosGlobais.operadores],
        setores: [...APP.filtrosGlobais.setores]
    };
    _diagnosticosOcultosPendentes = [...APP.filtrosGlobais.diagnosticosOcultos];

    document.getElementById("filtroDataInicio").value =
        APP.filtrosGlobais.dataInicio ? formatarDataParaInput(APP.filtrosGlobais.dataInicio) : "";
    document.getElementById("filtroDataFim").value =
        APP.filtrosGlobais.dataFim ? formatarDataParaInput(APP.filtrosGlobais.dataFim) : "";

    CAMPOS_MULTIPLOS_FILTRO.forEach(campo => atualizarResumoCampo(campo));

    abrirModal("modalFiltroGlobal");
}

/** Abre o popup compartilhado (modalSeletorFiltro) já carregado pro campo clicado. */
function abrirSeletorFiltro(campo) {
    _campoPopupAtivo = campo;

    document.getElementById("seletorFiltroTitulo").textContent = campo.rotulo;

    const botaoSelecionarTodos = document.getElementById("btnSeletorFiltroSelecionarTodos");
    const botaoLimpar = document.getElementById("btnSeletorFiltroLimpar");
    if (botaoSelecionarTodos) botaoSelecionarTodos.textContent = campo.invertido ? "Mostrar todos" : "Selecionar todos";
    if (botaoLimpar) botaoLimpar.textContent = campo.invertido ? "Ocultar todos" : "Limpar seleção";

    const busca = document.getElementById("buscaSeletorFiltro");
    if (busca) busca.value = "";

    renderizarListaSeletorFiltro("");
    abrirModalComRetorno("modalSeletorFiltro", "modalFiltroGlobal");

    if (busca) busca.focus();
}

function opcaoEstaMarcada(campo, opcao) {
    if (campo.invertido) return !_diagnosticosOcultosPendentes.includes(normalizarTexto(opcao));
    return _filtrosPendentes[campo.chave].includes(opcao);
}

function renderizarListaSeletorFiltro(termoBusca) {
    const container = document.getElementById("listaSeletorFiltro");
    if (!container || !_campoPopupAtivo) return;

    const campo = _campoPopupAtivo;
    const todasOpcoes = _opcoesFiltroGlobal[campo.chave] ?? [];

    if (todasOpcoes.length === 0) {
        container.innerHTML = '<p class="alerta-vazio">Importe dados pra ver as opções.</p>';
        return;
    }

    const termoNormalizado = normalizarTexto(termoBusca ?? "");
    const filtradas = termoNormalizado
        ? todasOpcoes.filter(opcao => normalizarTexto(opcao).includes(termoNormalizado))
        : todasOpcoes;

    if (filtradas.length === 0) {
        container.innerHTML = '<p class="alerta-vazio">Nenhuma opção bate com esse termo.</p>';
        return;
    }

    container.innerHTML = filtradas.map(opcao => {
        const marcado = opcaoEstaMarcada(campo, opcao);
        return `
            <label class="item-checkbox-modal ${marcado ? "marcado" : ""}">
                <input type="checkbox" data-valor="${escaparHtml(opcao)}" ${marcado ? "checked" : ""}>
                <span>${escaparHtml(opcao)}</span>
            </label>
        `;
    }).join("");

    container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener("change", () => alternarValorSeletorFiltro(checkbox.dataset.valor));
    });
}

function alternarValorSeletorFiltro(valor) {
    if (!_campoPopupAtivo) return;
    const campo = _campoPopupAtivo;

    if (campo.invertido) {
        const chaveValor = normalizarTexto(valor);
        if (_diagnosticosOcultosPendentes.includes(chaveValor)) {
            _diagnosticosOcultosPendentes = _diagnosticosOcultosPendentes.filter(d => d !== chaveValor);
        } else {
            _diagnosticosOcultosPendentes.push(chaveValor);
        }
    } else if (_filtrosPendentes[campo.chave].includes(valor)) {
        _filtrosPendentes[campo.chave] = _filtrosPendentes[campo.chave].filter(v => v !== valor);
    } else {
        _filtrosPendentes[campo.chave].push(valor);
    }

    atualizarResumoCampo(campo);

    const busca = document.getElementById("buscaSeletorFiltro");
    renderizarListaSeletorFiltro(busca ? busca.value : "");
}

/** "Selecionar/Mostrar todos" age só sobre as opções que a busca atual está mostrando, não a lista inteira. */
function selecionarTodosVisiveisSeletorFiltro() {
    if (!_campoPopupAtivo) return;
    const campo = _campoPopupAtivo;

    const busca = document.getElementById("buscaSeletorFiltro");
    const termoNormalizado = normalizarTexto(busca ? busca.value : "");
    const todasOpcoes = _opcoesFiltroGlobal[campo.chave] ?? [];
    const visiveis = termoNormalizado
        ? todasOpcoes.filter(opcao => normalizarTexto(opcao).includes(termoNormalizado))
        : todasOpcoes;

    if (campo.invertido) {
        const chavesVisiveis = visiveis.map(normalizarTexto);
        _diagnosticosOcultosPendentes = _diagnosticosOcultosPendentes.filter(d => !chavesVisiveis.includes(d));
    } else {
        for (const opcao of visiveis) {
            if (!_filtrosPendentes[campo.chave].includes(opcao)) _filtrosPendentes[campo.chave].push(opcao);
        }
    }

    atualizarResumoCampo(campo);
    renderizarListaSeletorFiltro(busca ? busca.value : "");
}

function limparSelecaoSeletorFiltro() {
    if (!_campoPopupAtivo) return;
    const campo = _campoPopupAtivo;

    if (campo.invertido) {
        _diagnosticosOcultosPendentes = [..._opcoesFiltroGlobal.diagnosticos.map(normalizarTexto)];
    } else {
        _filtrosPendentes[campo.chave] = [];
    }

    atualizarResumoCampo(campo);
    const busca = document.getElementById("buscaSeletorFiltro");
    renderizarListaSeletorFiltro(busca ? busca.value : "");
}

/** Texto curto no botão do campo, na tela principal do Filtro Global (ex.: "3 selecionados", "Todos", "2 ocultos"). */
function atualizarResumoCampo(campo) {
    const resumo = document.getElementById(`resumo-${campo.chave}`);
    if (!resumo) return;

    if (campo.invertido) {
        const ocultos = _diagnosticosOcultosPendentes.length;
        resumo.textContent = ocultos === 0 ? "Todos visíveis" : `${ocultos} oculto(s)`;
    } else {
        const total = _filtrosPendentes[campo.chave].length;
        resumo.textContent = total === 0 ? "Todos" : `${total} selecionado(s)`;
    }
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
        operadores: [],
        setores: [],
        diagnosticosOcultos: []
    };

    _filtrosPendentes = { assuntos: [], cidades: [], bairros: [], operadores: [], setores: [] };
    _diagnosticosOcultosPendentes = [];

    const dataInicio = document.getElementById("filtroDataInicio");
    const dataFim = document.getElementById("filtroDataFim");
    if (dataInicio) dataInicio.value = "";
    if (dataFim) dataFim.value = "";

    CAMPOS_MULTIPLOS_FILTRO.forEach(campo => atualizarResumoCampo(campo));

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

    // APP.indicadores.recorrencia (Dashboard) respeita o Filtro Global
    // normalmente. Alertas é independente disso — atualizarAlertas() usa
    // sua própria fonte de dados (ver js/ui/alertas.js -> ordensParaAlertas).
    APP.indicadores.recorrencia = IndicatorEngine.calcularRecorrencia(ordensFiltradas);
    atualizarAlertas();

    renderizarDashboard();
    renderizarSecaoTecnicos();
    renderizarSecaoIndicadores();
    renderizarPainelAuditoriaOperacional();

    const buscaAuditoria = document.getElementById("buscaAuditoria");
    if (buscaAuditoria && buscaAuditoria.value.trim()) {
        executarBuscaAuditoria();
    }
}
