/**
 * ==========================================================
 * UI de Diagnósticos Não Resolvidos (Configurações — admin/editor)
 * ==========================================================
 * Botão "Verificar" lista os códigos numéricos de diagnóstico
 * (movimentações antigas) que não batem com nenhuma linha da Base.xlsx
 * atual — ver AuditEngine.listarDiagnosticosNaoResolvidos. Só calcula
 * quando clicado (não é caro, mas não tem por que rodar sozinho toda
 * hora). Visibilidade do card em si é gate de papel (quem pode
 * importar) — ver js/ui/login.js -> aplicarGateDePapel.
 */

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
