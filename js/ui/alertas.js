/**
 * ==========================================================
 * UI de Alertas
 * ==========================================================
 * Exibe os clientes recorrentes calculados pelo IndicatorEngine.
 * Não calcula nada aqui — só exibe o que já está em
 * APP.indicadores.recorrencia. Clicar num cliente abre um modal
 * com os técnicos responsáveis por cada OS da recorrência.
 */

function renderizarAlertas() {
    const container = document.getElementById("listaAlertas");
    if (!container) return;

    const recorrentes = APP.indicadores.recorrencia;

    if (!recorrentes || recorrentes.size === 0) {
        container.innerHTML = '<p class="alerta-vazio">Nenhum cliente recorrente encontrado nos dados importados.</p>';
        return;
    }

    const linhas = [...recorrentes.values()]
        .sort((a, b) => b.totalOS - a.totalOS)
        .map(item => `
            <tr data-login="${escaparHtml(item.login)}" class="linha-clicavel">
                <td>${escaparHtml(item.cliente ?? "(sem nome)")}</td>
                <td>${escaparHtml(item.login)}</td>
                <td>${item.totalOS}</td>
                <td>${item.ordens.join(", ")}</td>
            </tr>
        `).join("");

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
            <tbody>${linhas}</tbody>
        </table>
    `;

    container.querySelectorAll("tr[data-login]").forEach(tr => {
        tr.addEventListener("click", () => abrirModalCliente(tr.dataset.login));
    });
}

function atualizarBadgeAlertas() {
    const badge = document.getElementById("badgeAlertas");
    if (!badge) return;

    const total = APP.indicadores.recorrencia?.size ?? 0;

    badge.textContent = total;
    badge.hidden = total === 0;
}

function abrirModalCliente(login) {
    const registro = APP.indicadores.recorrencia?.get(login);

    if (!registro) {
        alert("Cliente não encontrado nos dados atuais.");
        return;
    }

    const detalhes = IndicatorEngine.detalharRecorrenciaCliente(registro, FiltroEngine.ordensFiltradas());
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

    document.getElementById("modalClienteResumo").innerHTML = `
        <div class="resumo-grid">
            <div><span>Login</span><strong>${escaparHtml(detalhes.login)}</strong></div>
            <div><span>OS no período</span><strong>${detalhes.totalOS}</strong></div>
            <div><span>Técnicos envolvidos</span><strong>${detalhes.tecnicosEnvolvidos.length}</strong></div>
        </div>

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
