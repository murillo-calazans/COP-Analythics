/**
 * ==========================================================
 * UI de Configuração — Setor do COP
 * ==========================================================
 * Um único seletor de busca+chips (mesmo padrão visual do Filtro
 * Global / Funil de Assuntos) pra marcar qual(is) setor(es) da
 * Base.xlsx contam como "Controle de Operações" nos TMRs de
 * agendamento/reagendamento por colaborador.
 */

let _setoresCopPendente = [];

/**
 * Setor é atributo do OPERADOR de QUALQUER movimentação — diferente de
 * FiltroEngine.coletarOpcoes()/coletarAssuntosDistintos(), que só olham
 * quem FECHOU a OS. Um colaborador do COP que só agenda/reagenda e
 * nunca fecha ficaria invisível se reaproveitássemos aquelas listas.
 */
function coletarSetoresDistintosOperadores() {
    const setores = new Set();

    for (const ordem of APP.dados.ordens.values()) {
        for (const mov of ordem.movimentacoes) {
            if (mov.operador === null || mov.operador === undefined) continue;

            const setor = AuditEngine.resolverReferencia(APP.referencias.operadores, mov.operador, CONFIG_BASE.operadores.setor);
            if (setor) setores.add(setor);
        }
    }

    return [...setores].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/**
 * Só cuida do que é permanente na página (o modal e seu campo de
 * busca) — o botão "Configurar" fica dentro da aba Indicadores, que é
 * remontada via innerHTML toda vez, então esse botão é religado em
 * cada renderizarSecaoIndicadores() (ver js/ui/indicadores.js).
 */
function registrarSetoresCop() {
    const botaoSalvar = document.getElementById("btnSalvarSetoresCop");
    if (botaoSalvar) botaoSalvar.addEventListener("click", salvarSetoresCopDaTela);

    const busca = document.getElementById("busca-setoresCop");
    if (!busca) return;

    busca.addEventListener("focus", renderizarDropdownSetoresCop);
    busca.addEventListener("input", renderizarDropdownSetoresCop);
    busca.addEventListener("blur", () => {
        setTimeout(() => {
            const dropdown = document.getElementById("dropdown-setoresCop");
            if (dropdown) dropdown.hidden = true;
        }, 150);
    });
}

function abrirModalSetoresCop() {
    _setoresCopPendente = [...(APP.configuracoes.setoresCop ?? [])];

    const busca = document.getElementById("busca-setoresCop");
    if (busca) busca.value = "";

    renderizarChipsSetoresCop();

    const dropdown = document.getElementById("dropdown-setoresCop");
    if (dropdown) dropdown.hidden = true;

    abrirModal("modalSetoresCop");
}

function renderizarChipsSetoresCop() {
    const container = document.getElementById("chips-setoresCop");
    if (!container) return;

    container.innerHTML = _setoresCopPendente.map(valor => `
        <span class="chip-selecionado" data-valor="${escaparHtml(valor)}">
            ${escaparHtml(valor)}
            <button type="button" aria-label="Remover ${escaparHtml(valor)}">&times;</button>
        </span>
    `).join("");

    container.querySelectorAll(".chip-selecionado button").forEach(botao => {
        botao.addEventListener("click", () => {
            const valor = botao.parentElement.dataset.valor;
            _setoresCopPendente = _setoresCopPendente.filter(v => v !== valor);
            renderizarChipsSetoresCop();
            renderizarDropdownSetoresCop();
        });
    });
}

function renderizarDropdownSetoresCop() {
    const dropdown = document.getElementById("dropdown-setoresCop");
    const busca = document.getElementById("busca-setoresCop");
    if (!dropdown || !busca) return;

    const todasOpcoes = coletarSetoresDistintosOperadores();
    const termoNormalizado = normalizarTexto(busca.value);

    const disponiveis = todasOpcoes
        .filter(opcao => !_setoresCopPendente.includes(opcao))
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
                evento.preventDefault();
                if (!_setoresCopPendente.includes(item.dataset.valor)) {
                    _setoresCopPendente.push(item.dataset.valor);
                }
                busca.value = "";
                renderizarChipsSetoresCop();
                renderizarDropdownSetoresCop();
            });
        });
    }

    dropdown.hidden = false;
}

function salvarSetoresCopDaTela() {
    APP.configuracoes.setoresCop = [..._setoresCopPendente];
    salvarSetoresCop(APP.configuracoes.setoresCop);
    fecharModal("modalSetoresCop");
    renderizarTmrAgendamentoCop();
}

function renderizarTmrAgendamentoCop() {
    const container = document.getElementById("tmrCopConteudo");
    const subtitulo = document.getElementById("tmrCopSubtitulo");
    if (!container) return;

    const setoresCop = APP.configuracoes.setoresCop ?? [];

    if (setoresCop.length === 0) {
        if (subtitulo) subtitulo.textContent = "Configure o(s) setor(es) do COP pra calcular";
        container.innerHTML = '<p class="alerta-vazio">Clique em "Configurar" pra escolher o(s) setor(es).</p>';
        return;
    }

    if (subtitulo) subtitulo.textContent = `Setor(es): ${setoresCop.join(", ")}`;

    if (!APP.status.baseCarregada || APP.dados.ordens.size === 0) {
        container.innerHTML = '<p class="alerta-vazio">Importe dados pra calcular.</p>';
        return;
    }

    const ordensFiltradas = FiltroEngine.ordensFiltradas();

    const primeiroAgendamento = IndicatorEngine.calcularTmrPrimeiroAgendamentoCop(ordensFiltradas);
    const reagendamento = IndicatorEngine.calcularTmrReagendamentoCop(ordensFiltradas);

    container.innerHTML = `
        <div class="kpi-row">
            <div class="stat-tile">
                <div class="stat-label">TMR Primeiro Agendamento do COP &middot; ${primeiroAgendamento.contagem.toLocaleString("pt-BR")} OS</div>
                <div class="stat-valor">${formatarDuracaoHoras(primeiroAgendamento.horas)}</div>
            </div>
            <div class="stat-tile">
                <div class="stat-label">TMR Reagendamento do COP &middot; ${reagendamento.contagem.toLocaleString("pt-BR")} reagendamentos</div>
                <div class="stat-valor">${formatarDuracaoHoras(reagendamento.horas)}</div>
            </div>
        </div>

        <div class="graficos-grid">
            <div class="grafico-card">
                <div class="grafico-cabecalho">
                    <div>
                        <div class="grafico-titulo">Primeiro Agendamento por Colaborador</div>
                        <div class="grafico-subtitulo">TMR médio — abertura até o 1º agendamento do COP</div>
                    </div>
                </div>
                <div id="tmrCopPrimeiroPorColaborador"></div>
            </div>
            <div class="grafico-card">
                <div class="grafico-cabecalho">
                    <div>
                        <div class="grafico-titulo">Reagendamento por Colaborador</div>
                        <div class="grafico-subtitulo">TMR médio — OS precisando reagendar até o COP reagendar</div>
                    </div>
                </div>
                <div id="tmrCopReagendamentoPorColaborador"></div>
            </div>
        </div>
    `;

    renderizarGraficoBarras("tmrCopPrimeiroPorColaborador", IndicatorEngine.calcularTmrPrimeiroAgendamentoCopPorColaborador(ordensFiltradas), {
        serie: "serie-2",
        limite: 5,
        formatoValor: formatarDuracaoHoras,
        titulo: "TMR de Primeiro Agendamento por Colaborador",
        aoClicar: item => abrirDetalheAgendamentoCop(item.rotulo)
    });

    renderizarGraficoBarras("tmrCopReagendamentoPorColaborador", IndicatorEngine.calcularTmrReagendamentoCopPorColaborador(ordensFiltradas), {
        serie: "serie-2",
        limite: 5,
        formatoValor: formatarDuracaoHoras,
        titulo: "TMR de Reagendamento por Colaborador",
        aoClicar: item => abrirDetalheReagendamentoCop(item.rotulo)
    });
}

/** Clique num colaborador do gráfico "Primeiro Agendamento" — abre as OS que ele agendou, com o tempo de cada uma. */
function abrirDetalheAgendamentoCop(nome) {
    const detalhado = IndicatorEngine.calcularAgendamentosCopDetalhado(FiltroEngine.ordensFiltradas());
    abrirModalTmrCopDetalhe(`Primeiro agendamento do COP — ${nome}`, detalhado.get(nome) ?? []);
}

/** Clique num colaborador do gráfico "Reagendamento" — abre as OS que ele reagendou, com o tempo de cada uma. */
function abrirDetalheReagendamentoCop(nome) {
    const detalhado = IndicatorEngine.calcularReagendamentosCopDetalhado(FiltroEngine.ordensFiltradas());
    abrirModalTmrCopDetalhe(`Reagendamento do COP — ${nome}`, detalhado.get(nome) ?? []);
}

function abrirModalTmrCopDetalhe(titulo, itens) {
    document.getElementById("modalTmrCopDetalheTitulo").textContent = titulo;

    const conteudo = document.getElementById("modalTmrCopDetalheConteudo");
    const ordenados = [...itens].sort((a, b) => (b.horas ?? -1) - (a.horas ?? -1));

    conteudo.innerHTML = ordenados.length > 0 ? `
        <div class="lista-tmr-detalhe">
            ${ordenados.map(item => `
                <div class="item-tmr">
                    <button type="button" class="item-recorrencia-os" data-id="${escaparHtml(String(item.ordemId))}">${escaparHtml(String(item.ordemId))}</button>
                    <span class="item-tmr-assunto">${escaparHtml(item.assunto ?? "sem assunto")}</span>
                    <span class="item-tmr-valor">${formatarDuracaoHoras(item.horas)}</span>
                </div>
            `).join("")}
        </div>
    ` : '<p class="alerta-vazio">Nenhuma OS encontrada.</p>';

    conteudo.querySelectorAll(".item-recorrencia-os").forEach(botao => {
        botao.addEventListener("click", () => abrirModalOS(botao.dataset.id, "modalTmrCopDetalhe"));
    });

    abrirModal("modalTmrCopDetalhe");
}
