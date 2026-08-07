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

    renderizarAuditorIA(ordem);

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

/**
 * Mostra o veredito já salvo (se existir) e, só pra admin, o botão pra
 * rodar/re-rodar a análise — a Edge Function confere o papel de novo
 * do lado do servidor, então esconder o botão aqui é só conveniência
 * de UI, não é a proteção de verdade.
 */
function renderizarAuditorIA(ordem) {
    const container = document.getElementById("modalAuditorIA");
    if (!container) return;

    const avaliacao = ordem.auditoriaIA;

    const rotulos = { ok: "OK", questionavel: "Questionável", problematico: "Problemático" };
    const classes = { ok: "veredito-ok", questionavel: "veredito-questionavel", problematico: "veredito-problematico" };

    const blocoResultado = avaliacao ? `
        <div class="auditoria-ia-resultado ${classes[avaliacao.veredito] ?? ""}">
            <span class="auditoria-ia-veredito">${escaparHtml(rotulos[avaliacao.veredito] ?? avaliacao.veredito)}</span>
            <p class="auditoria-ia-justificativa">${escaparHtml(avaliacao.justificativa)}</p>
            <span class="auditoria-ia-data">Avaliado em ${formatarDataHora(new Date(avaliacao.avaliadoEm))}</span>
        </div>
    ` : `<p class="auditoria-ia-vazio">Essa OS ainda não foi avaliada pelo Auditor IA.</p>`;

    container.innerHTML = `
        <h3 class="modal-subtitulo">🤖 Auditor IA</h3>
        <div class="auditoria-ia-card">
            ${blocoResultado}
            ${ehAdmin() ? `
                <button type="button" class="botao-secundario" id="btnRodarAuditorIA">
                    ${avaliacao ? "Rodar de novo" : "Rodar Auditor IA"}
                </button>
            ` : ""}
            <p class="auditoria-ia-status" id="auditoriaIAStatus" hidden></p>
        </div>
    `;

    const botao = document.getElementById("btnRodarAuditorIA");
    if (botao) {
        botao.addEventListener("click", () => acionarAuditorIA(ordem.id, botao));
    }
}

async function acionarAuditorIA(ordemId, botao) {
    const status = document.getElementById("auditoriaIAStatus");

    botao.disabled = true;
    if (status) {
        status.hidden = false;
        status.textContent = "Rodando análise, pode levar alguns segundos...";
    }

    const resultado = await rodarAuditorIA(ordemId);

    if (!resultado.ok) {
        if (status) status.textContent = resultado.mensagem;
        botao.disabled = false;
        return;
    }

    // Atualiza a OS em memória com o resultado novo, sem precisar
    // recarregar tudo do Supabase só pra ver a avaliação que acabou de sair.
    const ordem = APP.dados.ordens.get(ordemId)
        ?? APP.dados.ordens.get(Number(ordemId))
        ?? APP.dados.ordens.get(String(ordemId));

    if (ordem) {
        ordem.auditoriaIA = resultado.avaliacao;
        renderizarAuditorIA(ordem);
    }
}
