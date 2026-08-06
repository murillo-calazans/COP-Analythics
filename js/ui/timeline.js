/**
 * ==========================================================
 * UI de Timeline — Detalhes da OS + histórico de movimentações
 * ==========================================================
 * Recebe do AuditEngine tudo já resolvido (nomes, não códigos)
 * — aqui só monta o HTML.
 */

function abrirModalOS(id, idModalRetorno = null) {
    const detalhes = AuditEngine.obterDetalhes(id);

    if (!detalhes) {
        alert("OS não encontrada.");
        return;
    }

    renderizarDetalhesOS(detalhes);

    if (idModalRetorno) {
        abrirModalComRetorno("modalOS", idModalRetorno);
    } else {
        abrirModal("modalOS");
    }
}

function renderizarDetalhesOS({ ordem, timeline }) {
    document.getElementById("modalTitulo").textContent = `OS ${ordem.id}`;

    document.getElementById("modalResumo").innerHTML = `
        <div class="resumo-grid">
            <div><span>Cliente</span><strong>${escaparHtml(ordem.cliente ?? "-")}</strong></div>
            <div><span>Login</span><strong>${escaparHtml(ordem.login ?? "-")}</strong></div>
            <div><span>Cidade / Bairro</span><strong>${escaparHtml(ordem.cidade ?? "-")} / ${escaparHtml(ordem.bairro ?? "-")}</strong></div>
            <div><span>Assunto</span><strong>${escaparHtml(ordem.assunto ?? "-")}</strong></div>
            <div><span>Status atual</span><strong>${escaparHtml(ordem.statusAtual ?? "-")}</strong></div>
            <div><span>Abertura</span><strong>${formatarDataHora(ordem.dataAbertura)}</strong></div>
            <div><span>Fechamento</span><strong>${formatarDataHora(ordem.dataFechamento)}</strong></div>
        </div>
        ${ordem.alertas.length > 0 ? `
            <div class="alertas-os">
                ${ordem.alertas.map(a => `<span class="tag-alerta">⚠ ${escaparHtml(a.mensagem)}</span>`).join("")}
            </div>
        ` : ""}
    `;

    document.getElementById("modalTimeline").innerHTML = timeline.map(item => `
        <div class="timeline-item">
            <div class="timeline-data">${formatarDataHora(item.data)}</div>
            <div class="timeline-conteudo">
                <strong>${escaparHtml(item.evento ?? "Evento não informado")}</strong>
                <span class="timeline-status">${escaparHtml(item.status ?? "-")}</span>
                <p class="timeline-operador">Operador: ${escaparHtml(item.operador ?? "-")}</p>
                ${item.diagnostico ? `<p class="timeline-diagnostico">Diagnóstico: ${escaparHtml(item.diagnostico)}</p>` : ""}
                ${item.mensagem ? `<p class="timeline-mensagem">${escaparHtml(item.mensagem)}</p>` : ""}
            </div>
        </div>
    `).join("");
}
