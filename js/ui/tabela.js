/**
 * ==========================================================
 * UI de Tabela — Resultados da Busca de OS
 * ==========================================================
 */

function renderizarResultadosAuditoria(ordens) {
    const container = document.getElementById("resultadosAuditoria");
    if (!container) return;

    if (ordens.length === 0) {
        container.innerHTML = '<p class="alerta-vazio">Nenhuma OS encontrada para esse termo.</p>';
        return;
    }

    const linhas = ordens.map(ordem => `
        <tr data-id="${escaparHtml(ordem.id)}" class="linha-clicavel">
            <td>${escaparHtml(ordem.id)}</td>
            <td>${escaparHtml(ordem.cliente ?? "-")}</td>
            <td>${escaparHtml(ordem.login ?? "-")}</td>
            <td>${escaparHtml(ordem.cidade ?? "-")}</td>
            <td>${escaparHtml(ordem.assunto ?? "-")}</td>
            <td>${escaparHtml(ordem.statusAtual ?? "-")}</td>
            <td>${ordem.movimentacoes.length}</td>
        </tr>
    `).join("");

    container.innerHTML = `
        <p class="resultados-contagem">
            ${ordens.length} OS encontrada(s)${ordens.length === AuditEngine.LIMITE_RESULTADOS ? ` (mostrando as ${AuditEngine.LIMITE_RESULTADOS} primeiras)` : ""}.
        </p>
        <table class="tabela-alertas">
            <thead>
                <tr>
                    <th>ID OS</th>
                    <th>Cliente</th>
                    <th>Login</th>
                    <th>Cidade</th>
                    <th>Assunto</th>
                    <th>Status</th>
                    <th>Movimentações</th>
                </tr>
            </thead>
            <tbody>${linhas}</tbody>
        </table>
    `;

    container.querySelectorAll("tr[data-id]").forEach(tr => {
        tr.addEventListener("click", () => abrirModalOS(tr.dataset.id));
    });
}
