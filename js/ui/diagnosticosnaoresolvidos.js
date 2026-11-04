function registrarDiagnosticosNaoResolvidos() {
    const botao = document.getElementById("btnVerificarDiagnosticosNaoResolvidos");
    if (botao) botao.addEventListener("click", verificarDiagnosticosNaoResolvidos);
}

function verificarDiagnosticosNaoResolvidos() {
    const container = document.getElementById("resultadoDiagnosticosNaoResolvidos");
    if (!container) return;

    if (!APP.status.baseCarregada || APP.dados.ordens.size === 0) {
        container.innerHTML = '<p class="alerta-vazio">Importe dados antes de verificar.</p>';
        return;
    }

    const naoResolvidos = AuditEngine.listarDiagnosticosNaoResolvidos(APP.dados.ordens);

    if (naoResolvidos.length === 0) {
        container.innerHTML = '<p class="alerta-vazio">Nenhum código numérico sem correspondência — todo diagnóstico bate com a Base atual.</p>';
        return;
    }

    const totalMovimentacoes = naoResolvidos.reduce((soma, item) => soma + item.quantidade, 0);

    container.innerHTML = `
        <p class="resumo-filtro">
            ${naoResolvidos.length} código(s) sem correspondência na Base, em ${totalMovimentacoes} movimentação(ões) no total.
        </p>
        <table class="tabela-alertas">
            <thead>
                <tr><th>Código</th><th>Movimentações afetadas</th></tr>
            </thead>
            <tbody>
                ${naoResolvidos.map(item => `
                    <tr><td>${escaparHtml(item.codigo)}</td><td>${item.quantidade}</td></tr>
                `).join("")}
            </tbody>
        </table>
    `;
}
