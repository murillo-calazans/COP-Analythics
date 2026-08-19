/**
 * ==========================================================
 * UI de Alertas
 * ==========================================================
 * Exibe os registros calculados pelo IndicatorEngine (calcularRecorrencia),
 * em duas abas: Ativos (exige o padrão de recorrência — ver
 * LIMITE_QTD_RECORRENCIA/LIMITE_DIAS_RECORRENCIA) e Cancelados (TODO
 * cliente com uma OS de assunto IndicatorEngine.ASSUNTO_CANCELAMENTO
 * em algum ponto do histórico, independente de ter batido o padrão de
 * recorrência — ver encontrarCancelamentoCliente).
 *
 * De propósito INDEPENDENTE do Filtro Global: usa APP.dados.ordens
 * (tudo) em vez de FiltroEngine.ordensFiltradas(), só recortado pelo
 * período PRÓPRIO desta aba (APP.filtrosAlertas — ver ordensParaAlertas)
 * — cidade/setor/assunto/etc. do Filtro Global não valem aqui. Quem
 * decide o que conta pra recorrência são só as configurações dela
 * (Assuntos que Contam / Diagnósticos Excluídos da Recorrência).
 * Guardado em APP.indicadores.recorrenciaAlertas — separado do
 * APP.indicadores.recorrencia usado pelo Dashboard (esse continua
 * respeitando o Filtro Global normalmente).
 *
 * Clicar num cliente abre um modal com o detalhe de cada OS e a
 * quantidade por mês.
 */

/** Ordens pra recorrência de Alertas: tudo, só recortado pelo período local (se houver). Ignora Filtro Global. */
function ordensParaAlertas() {
    const { dataInicio, dataFim } = APP.filtrosAlertas;
    if (!dataInicio && !dataFim) return APP.dados.ordens;

    const filtradas = new Map();
    for (const [id, ordem] of APP.dados.ordens) {
        if (dataInicio && (!ordem.dataAbertura || ordem.dataAbertura < dataInicio)) continue;
        if (dataFim && (!ordem.dataAbertura || ordem.dataAbertura > dataFim)) continue;
        filtradas.set(id, ordem);
    }
    return filtradas;
}

/** Recalcula a recorrência de Alertas (independente do Filtro Global) e redesenha badge + tabelas. */
function atualizarAlertas() {
    if (APP.dados.ordens.size === 0) return;

    APP.indicadores.recorrenciaAlertas = IndicatorEngine.calcularRecorrencia(ordensParaAlertas());
    atualizarBadgeAlertas();
    renderizarAlertas();
}

function registrarAbasAlertas() {
    const botaoAtivos = document.getElementById("abaAlertasAtivos");
    const botaoCancelados = document.getElementById("abaAlertasCancelados");

    if (botaoAtivos) botaoAtivos.addEventListener("click", () => alternarAbaAlertas("ativos"));
    if (botaoCancelados) botaoCancelados.addEventListener("click", () => alternarAbaAlertas("cancelados"));

    registrarPeriodoAlertas();
}

function registrarPeriodoAlertas() {
    const botaoAplicar = document.getElementById("btnAplicarPeriodoAlertas");
    const botaoLimpar = document.getElementById("btnLimparPeriodoAlertas");

    if (botaoAplicar) botaoAplicar.addEventListener("click", aplicarPeriodoAlertas);
    if (botaoLimpar) botaoLimpar.addEventListener("click", limparPeriodoAlertas);

    renderizarResumoPeriodoAlertas();
}

function aplicarPeriodoAlertas() {
    const dataInicioBruta = document.getElementById("alertasDataInicio")?.value;
    const dataFimBruta = document.getElementById("alertasDataFim")?.value;

    APP.filtrosAlertas = {
        dataInicio: dataInicioBruta ? new Date(`${dataInicioBruta}T00:00:00`) : null,
        dataFim: dataFimBruta ? new Date(`${dataFimBruta}T23:59:59`) : null
    };

    renderizarResumoPeriodoAlertas();
    atualizarAlertas();
}

function limparPeriodoAlertas() {
    APP.filtrosAlertas = { dataInicio: null, dataFim: null };

    const inputInicio = document.getElementById("alertasDataInicio");
    const inputFim = document.getElementById("alertasDataFim");
    if (inputInicio) inputInicio.value = "";
    if (inputFim) inputFim.value = "";

    renderizarResumoPeriodoAlertas();
    atualizarAlertas();
}

function renderizarResumoPeriodoAlertas() {
    const container = document.getElementById("resumoPeriodoAlertas");
    if (!container) return;

    const { dataInicio, dataFim } = APP.filtrosAlertas;

    if (!dataInicio && !dataFim) {
        container.innerHTML = '<p class="resumo-filtro">Mostrando o histórico inteiro.</p>';
        return;
    }

    const de = dataInicio ? formatarDataParaInput(dataInicio) : "início";
    const ate = dataFim ? formatarDataParaInput(dataFim) : "hoje";
    container.innerHTML = `<p class="resumo-filtro">Período: ${de} até ${ate}.</p>`;
}

function alternarAbaAlertas(aba) {
    const botaoAtivos = document.getElementById("abaAlertasAtivos");
    const botaoCancelados = document.getElementById("abaAlertasCancelados");
    const painelAtivos = document.getElementById("painelAlertasAtivos");
    const painelCancelados = document.getElementById("painelAlertasCancelados");
    if (!botaoAtivos || !botaoCancelados || !painelAtivos || !painelCancelados) return;

    const ehAtivos = aba === "ativos";
    botaoAtivos.classList.toggle("ativo", ehAtivos);
    botaoCancelados.classList.toggle("ativo", !ehAtivos);
    painelAtivos.hidden = !ehAtivos;
    painelCancelados.hidden = ehAtivos;
}

function renderizarAlertas() {
    const recorrentes = APP.indicadores.recorrenciaAlertas;
    const lista = recorrentes ? [...recorrentes.values()] : [];

    const ativos = lista.filter(item => !item.cancelado).sort((a, b) => b.totalOS - a.totalOS);
    const cancelados = lista.filter(item => item.cancelado).sort((a, b) => b.totalOS - a.totalOS);

    renderizarTabelaAlertasAtivos(ativos);
    renderizarTabelaAlertasCancelados(cancelados);
}

function renderizarTabelaAlertasAtivos(itens) {
    const container = document.getElementById("listaAlertasAtivos");
    if (!container) return;

    if (itens.length === 0) {
        container.innerHTML = '<p class="alerta-vazio">Nenhum cliente ativo recorrente encontrado nos dados importados.</p>';
        return;
    }

    container.innerHTML = `
        <table class="tabela-alertas">
            <thead>
                <tr>
                    <th>Cliente</th>
                    <th>Login</th>
                    <th>OS nos últimos ${IndicatorEngine.LIMITE_DIAS_RECORRENCIA} dias</th>
                    <th>IDs das OS</th>
                </tr>
            </thead>
            <tbody>
                ${itens.map(item => `
                    <tr data-login="${escaparHtml(item.login)}" class="linha-clicavel">
                        <td>${escaparHtml(item.cliente ?? "(sem nome)")}</td>
                        <td>${escaparHtml(item.login)}</td>
                        <td>${item.totalOS}</td>
                        <td>${escaparHtml(item.ordens.join(", "))}</td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
    `;

    container.querySelectorAll("tr[data-login]").forEach(tr => {
        tr.addEventListener("click", () => abrirModalCliente(tr.dataset.login));
    });
}

function renderizarTabelaAlertasCancelados(itens) {
    const container = document.getElementById("listaAlertasCancelados");
    if (!container) return;

    if (itens.length === 0) {
        container.innerHTML = '<p class="alerta-vazio">Nenhum cliente cancelado encontrado nos dados importados.</p>';
        return;
    }

    container.innerHTML = `
        <table class="tabela-alertas">
            <thead>
                <tr>
                    <th>Cliente</th>
                    <th>Login</th>
                    <th>OS nos últimos ${IndicatorEngine.LIMITE_DIAS_RECORRENCIA} dias</th>
                    <th>Última OS antes do cancelamento</th>
                </tr>
            </thead>
            <tbody>
                ${itens.map(item => `
                    <tr data-login="${escaparHtml(item.login)}" class="linha-clicavel">
                        <td>${escaparHtml(item.cliente ?? "(sem nome)")}</td>
                        <td>${escaparHtml(item.login)}</td>
                        <td>${item.totalOS}</td>
                        <td>${resumoUltimaOrdemAntesCancelamento(item.ultimaOrdemAntesCancelamento)}</td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
    `;

    container.querySelectorAll("tr[data-login]").forEach(tr => {
        tr.addEventListener("click", () => abrirModalCliente(tr.dataset.login));
    });
}

function resumoUltimaOrdemAntesCancelamento(ultimaOrdem) {
    if (!ultimaOrdem) return "-";
    return `OS ${escaparHtml(String(ultimaOrdem.id))} — ${escaparHtml(ultimaOrdem.assunto ?? "sem assunto")}`;
}

function atualizarBadgeAlertas() {
    const badge = document.getElementById("badgeAlertas");
    if (!badge) return;

    const total = APP.indicadores.recorrenciaAlertas?.size ?? 0;

    badge.textContent = total;
    badge.hidden = total === 0;
}

function abrirModalCliente(login) {
    const registro = APP.indicadores.recorrenciaAlertas?.get(login);

    if (!registro) {
        alert("Cliente não encontrado nos dados atuais.");
        return;
    }

    const detalhes = IndicatorEngine.detalharRecorrenciaCliente(registro, ordensParaAlertas());
    renderizarFichaCliente(detalhes);
    abrirModal("modalCliente");
}

function renderizarFichaCliente(detalhes) {
    document.getElementById("modalClienteTitulo").textContent = detalhes.cliente ?? "(sem nome)";

    const linhasOS = detalhes.ordensDetalhes.map(d => `
        <div class="item-recorrencia">
            <div class="item-recorrencia-lado">
                <span class="item-recorrencia-label">OS</span>
                <button type="button" class="item-recorrencia-os" data-id="${escaparHtml(String(d.id))}">${escaparHtml(String(d.id))}</button>
                <span class="item-recorrencia-assunto">${escaparHtml(d.assunto ?? "sem assunto")}</span>
            </div>
            <div class="item-recorrencia-lado">
                <span class="item-recorrencia-label">Técnico responsável</span>
                <strong>${escaparHtml(d.tecnico ?? "não identificado")}</strong>
            </div>
        </div>
    `).join("");

    const linhasPorMes = detalhes.porMes.map(m => `
        <div class="item-por-mes">
            <span>${escaparHtml(m.rotulo)}/${m.ano}</span>
            <strong>${m.quantidade}</strong>
        </div>
    `).join("");

    const avisoCancelamento = detalhes.cancelado ? `
        <div class="aviso-cancelamento">
            ⚠ Cliente cancelado (OS ${escaparHtml(String(detalhes.ordemCancelamento?.id ?? "?"))}).
            ${detalhes.ultimaOrdemAntesCancelamento
                ? `Última OS antes do cancelamento: <button type="button" class="item-recorrencia-os" data-id="${escaparHtml(String(detalhes.ultimaOrdemAntesCancelamento.id))}">${escaparHtml(String(detalhes.ultimaOrdemAntesCancelamento.id))}</button> — ${escaparHtml(detalhes.ultimaOrdemAntesCancelamento.assunto ?? "sem assunto")}.`
                : "Nenhuma OS anterior encontrada."}
        </div>
    ` : "";

    document.getElementById("modalClienteResumo").innerHTML = `
        <div class="resumo-grid">
            <div><span>Login</span><strong>${escaparHtml(detalhes.login)}</strong></div>
            <div><span>OS no período</span><strong>${detalhes.totalOS}</strong></div>
            <div><span>Técnicos envolvidos</span><strong>${detalhes.tecnicosEnvolvidos.length}</strong></div>
        </div>

        ${avisoCancelamento}

        <h3 class="modal-subtitulo">OS no período por mês</h3>
        <div class="lista-por-mes">${linhasPorMes}</div>

        <h3 class="modal-subtitulo">Técnico responsável por cada OS</h3>
        <div class="lista-recorrencias">${linhasOS}</div>
    `;

    document.querySelectorAll("#modalClienteResumo .item-recorrencia-os").forEach(botao => {
        botao.addEventListener("click", () => abrirOSDoModalCliente(botao.dataset.id));
    });
}

function abrirOSDoModalCliente(id) {
    abrirModalOS(id, "modalCliente");
}
