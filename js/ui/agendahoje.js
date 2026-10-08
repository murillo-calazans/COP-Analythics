/**
 * ==========================================================
 * Agenda do Dia (módulo Agendador IA)
 * ==========================================================
 * Só leitura: mostra o plano que um admin publicou pelo
 * pré-agendamento (agendador.html -> botão "Publicar agenda"),
 * guardado em agenda_publicada (database/patch-15). Uma linha por
 * dia, com uma lista de paradas: técnico, horário, OS, cliente...
 *
 * O pré-agendamento em si abre numa guia nova e só admin vê o botão.
 */

let agendaHojeData = null; // dia exibido (Date à meia-noite)

async function buscarAgendaPublicada(data) {
    const { data: linha, error } = await supabaseClient
        .from("agenda_publicada")
        .select("data, itens, resumo, publicado_por, atualizado_em")
        .eq("data", isoDataLocal(data))
        .maybeSingle();
    if (error) throw error;
    return linha;
}

/** Quantas OS a agenda de hoje tem — pra tela inicial. null = sem agenda/erro. */
async function totalAgendaDeHoje() {
    try {
        const linha = await buscarAgendaPublicada(hojeMeiaNoite());
        return linha ? (linha.itens ?? []).filter(i => i.tecnico).length : 0;
    } catch {
        return null;
    }
}

async function renderizarAgendaHoje() {
    const container = document.getElementById("agendaHojeConteudo");
    if (!container) return;

    const botaoPre = document.getElementById("btnAbrirPreAgendamento");
    if (botaoPre) botaoPre.hidden = !ehAdmin();

    agendaHojeData ??= hojeMeiaNoite();
    const data = agendaHojeData;
    const titulo = document.getElementById("agendaHojeTitulo");
    if (titulo) titulo.textContent = `${ehMesmoDia(data, hojeMeiaNoite()) ? "Agenda do dia" : "Agenda"} — ${formatarDataLonga(data)}`;

    container.innerHTML = '<p class="alerta-vazio">Carregando a agenda...</p>';

    let linha;
    try {
        linha = await buscarAgendaPublicada(data);
    } catch (erro) {
        const faltaTabela = /agenda_publicada/.test(erro.message ?? "") || erro.code === "42P01" || erro.code === "PGRST205";
        container.innerHTML = faltaTabela
            ? '<p class="alerta-vazio">A tabela da agenda ainda não existe no banco — falta rodar o database/patch-15-inicio-e-agenda.sql no Supabase.</p>'
            : `<p class="alerta-vazio">Não deu pra carregar a agenda: ${escaparHtml(erro.message ?? String(erro))}</p>`;
        return;
    }

    if (agendaHojeData !== data) return; // trocou de dia enquanto carregava

    if (!linha || !(linha.itens ?? []).length) {
        container.innerHTML = `
            <div class="placeholder-card">
                <h2>📭 Nenhuma agenda publicada para este dia</h2>
                <p>${ehAdmin()
                    ? 'Gere o plano no Pré-agendamento e clique em "Publicar agenda" para ela aparecer aqui.'
                    : "Assim que o pré-agendamento do dia for publicado, ele aparece aqui."}</p>
            </div>`;
        return;
    }

    const itens = linha.itens;
    const agendadas = itens.filter(i => i.tecnico);
    const semTecnico = itens.filter(i => !i.tecnico);

    const porTecnico = new Map();
    for (const item of agendadas) {
        if (!porTecnico.has(item.tecnico)) porTecnico.set(item.tecnico, []);
        porTecnico.get(item.tecnico).push(item);
    }
    const tecnicos = [...porTecnico.keys()].sort((a, b) => a.localeCompare(b, "pt-BR"));

    const publicadoEm = new Date(linha.atualizado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

    container.innerHTML = `
        <div class="kpi-row">
            <div class="stat-tile"><div class="stat-label">OS agendadas</div><div class="stat-valor">${agendadas.length}</div></div>
            <div class="stat-tile"><div class="stat-label">Técnicos com rota</div><div class="stat-valor">${tecnicos.length}</div></div>
            <div class="stat-tile"><div class="stat-label">Não couberam no dia</div><div class="stat-valor">${semTecnico.length}</div></div>
        </div>

        <div class="agenda-tecnicos">
            ${tecnicos.map(nome => {
                const paradas = porTecnico.get(nome).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
                const primeiro = paradas[0];
                return `
                <div class="grafico-card">
                    <div class="grafico-cabecalho">
                        <div>
                            <div class="grafico-titulo">${escaparHtml(nome)}${primeiro.dupla ? ` <span class="escala-dupla">+ ${escaparHtml(primeiro.dupla)}</span>` : ""}</div>
                            <div class="grafico-subtitulo">${escaparHtml([primeiro.grupo, primeiro.setor].filter(Boolean).join(" · "))} · ${paradas.length} OS</div>
                        </div>
                    </div>
                    <ol class="agenda-paradas">
                        ${paradas.map(p => `
                            <li>
                                <span class="agenda-hora">${escaparHtml(p.chegada ?? "")}</span>
                                <div>
                                    <strong>OS ${escaparHtml(String(p.os ?? ""))}</strong> · ${escaparHtml(p.cliente ?? "")}
                                    <div class="agenda-detalhe">${escaparHtml([p.bairro, p.cidade].filter(Boolean).join(", "))} — ${escaparHtml(p.assunto ?? "")}</div>
                                    ${p.observacao ? `<div class="agenda-alerta">${escaparHtml(p.observacao)}</div>` : ""}
                                </div>
                            </li>`).join("")}
                    </ol>
                </div>`;
            }).join("")}
        </div>

        ${semTecnico.length ? `
            <div class="indicadores-secao-titulo">Não couberam no dia (${semTecnico.length})</div>
            <div class="grafico-card">
                <ul class="agenda-sem-tecnico">
                    ${semTecnico.map(p => `<li><strong>OS ${escaparHtml(String(p.os ?? ""))}</strong> · ${escaparHtml(p.cliente ?? "")} — ${escaparHtml([p.bairro, p.cidade].filter(Boolean).join(", "))}${p.observacao ? ` <span class="agenda-detalhe">(${escaparHtml(p.observacao)})</span>` : ""}</li>`).join("")}
                </ul>
            </div>` : ""}

        <p class="rodape-modulo">Publicada em ${publicadoEm}${linha.publicado_por ? ` por ${escaparHtml(linha.publicado_por)}` : ""}.</p>
    `;
}

function registrarAgendaHoje() {
    const mudarDia = delta => {
        agendaHojeData = new Date((agendaHojeData ?? hojeMeiaNoite()).getTime());
        agendaHojeData.setDate(agendaHojeData.getDate() + delta);
        renderizarAgendaHoje();
    };
    document.getElementById("btnAgendaDiaAnterior")?.addEventListener("click", () => mudarDia(-1));
    document.getElementById("btnAgendaProximoDia")?.addEventListener("click", () => mudarDia(1));
    document.getElementById("btnAgendaHoje")?.addEventListener("click", () => { agendaHojeData = hojeMeiaNoite(); renderizarAgendaHoje(); });
}
