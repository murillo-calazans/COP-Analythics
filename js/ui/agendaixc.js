/**
 * ==========================================================
 * Agenda IXC (aba do módulo Agendador IA)
 * ==========================================================
 * Retrato ATUAL de como o IXC está agendado hoje — lido da tabela
 * os_pendentes (gravada pelo robô de hora em hora) e reconstruído com o
 * mesmo motor do pré-agendamento (js/agendador/motor.js -> Motor.montarOS),
 * que já identifica técnico, status, reagendamentos e o "dia combinado"
 * citado na mensagem do agendamento.
 *
 * Mostra, por equipe/técnico, as OS marcadas pra hoje, com o status atual
 * (agendada / deslocamento / em execução / finalizada), o que falta e os
 * reagendados. Cliente marcado pra hoje cuja MENSAGEM cita outro dia fica
 * em VERMELHO com o aviso.
 *
 * "Retrato atual" = o último que o robô puxou (na hora cheia); por isso um
 * "em execução" pode estar com tempo defasado — é esperado.
 */

let agendaIxcCache = null;     // { capturadoEm, model } — evita refazer a cada troca de aba
let agendaIxcCarregando = false;

const AGENDA_IXC_STATUS = {
    "em execucao": { rotulo: "Em execução", cor: "#2563eb" },
    "execucao": { rotulo: "Em execução", cor: "#2563eb" },
    "deslocamento": { rotulo: "Deslocamento", cor: "#d97706" },
    "finalizada": { rotulo: "Finalizada", cor: "#16a34a" },
    "agendada": { rotulo: "Agendada", cor: "#6b7280" },
    "aberta": { rotulo: "Aberta", cor: "#6b7280" },
    "encaminhada": { rotulo: "Encaminhada", cor: "#6b7280" },
    "assumida": { rotulo: "Assumida", cor: "#7c3aed" },
    "aguardando agendamento": { rotulo: "Aguardando", cor: "#6b7280" }
};

function ixcNorm(t) {
    return String(t ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
}

function ixcMeiaNoite() {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
}

/** Lê todas as linhas (eventos) da os_pendentes. */
async function buscarOsPendentes() {
    if (typeof supabaseClient === "undefined") return [];
    const linhas = [];
    for (let de = 0; ; de += 1000) {
        const { data, error } = await supabaseClient
            .from("os_pendentes").select("dados, capturado_em").order("id").range(de, de + 999);
        if (error || !data || !data.length) break;
        linhas.push(...data);
        if (data.length < 1000) break;
    }
    return linhas;
}

/**
 * Monta o modelo da Agenda IXC: OS marcadas pra hoje, SÓ dos técnicos que
 * estão na escala (casados pelo nome via Motor.nomeBate), agrupadas por
 * técnico. Quem não está na escala (terceirizada de fora, pessoa de
 * escritório que agendou, etc.) não entra — é a regra do setor da Base.
 */
function montarAgendaIxc(linhasBrutas, techsEscala) {
    const rows = linhasBrutas.map(l => l.dados);
    const capturadoEm = linhasBrutas.length ? linhasBrutas[0].capturado_em : null;
    if (!rows.length || typeof Motor === "undefined") return { grupos: [], total: 0, alertas: 0, omitidas: 0, capturadoEm, resumo: {} };

    const hoje = ixcMeiaNoite();
    const { os } = Motor.montarOS(rows, hoje, Motor.PADRAO_PARAMS);
    const doDia = os.filter(o => o.marcadaHoje && o.agendaIxc && o.agendaIxc.tecnico);

    const techs = Array.isArray(techsEscala) ? techsEscala : [];
    const separar = typeof separarTerceira === "function" ? separarTerceira : (n => ({ nome: n, terceira: null }));

    const porTec = new Map();
    const resumo = {};
    let alertas = 0, omitidas = 0;

    for (const o of doDia) {
        // só entra quem está na escala (= técnico de campo dos setores da Base)
        const tech = techs.find(t => Motor.nomeBate(o.agendaIxc.tecnico, t));
        if (!tech) { omitidas++; continue; }

        const info = separar(tech.nome);
        const chave = tech.id || info.nome;
        const diaMsg = o.agendaIxc.dia;
        const alerta = diaMsg && diaMsg.toDateString() !== hoje.toDateString();
        if (alerta) alertas++;

        const st = ixcNorm(o.status);
        resumo[o.status] = (resumo[o.status] || 0) + 1;

        if (!porTec.has(chave)) porTec.set(chave, { nome: info.nome, terceira: info.terceira, setor: tech.setor, oss: [] });
        porTec.get(chave).oss.push({
            id: o.id, cliente: o.cliente, cidade: o.cidade, bairro: o.bairro, assunto: o.assunto,
            status: o.status, statusNorm: st, reagendamentos: o.reagendamentos || 0,
            alerta, diaMsg: alerta ? diaMsg : null, finalizada: st === "finalizada"
        });
    }

    const grupos = [...porTec.values()]
        .map(g => ({
            tecnico: g.nome, terceira: g.terceira, setor: g.setor,
            oss: g.oss.sort((a, b) => Number(b.alerta) - Number(a.alerta) || (a.cliente || "").localeCompare(b.cliente || "", "pt-BR")),
            total: g.oss.length,
            feitas: g.oss.filter(o => o.finalizada).length,
            alertas: g.oss.filter(o => o.alerta).length
        }))
        .sort((a, b) => b.total - a.total);

    const total = grupos.reduce((s, g) => s + g.total, 0);
    return { grupos, total, alertas, omitidas, capturadoEm, resumo };
}

function badgeStatus(statusNorm, rotuloOriginal) {
    const info = AGENDA_IXC_STATUS[statusNorm] || { rotulo: rotuloOriginal || "—", cor: "#6b7280" };
    return `<span class="ixc-badge" style="--c:${info.cor}">${escaparHtml(info.rotulo)}</span>`;
}

function htmlOsIxc(o) {
    const local = [o.cidade, o.bairro].filter(Boolean).join(" · ");
    const aviso = o.alerta
        ? `<div class="ixc-alerta">⚠ Cliente pediu outro dia: <b>${o.diaMsg.toLocaleDateString("pt-BR")}</b> — confira a mensagem no IXC</div>`
        : "";
    const reag = o.reagendamentos > 0 ? `<span class="ixc-tag">↻ ${o.reagendamentos} reagend.</span>` : "";
    return `
      <div class="ixc-os${o.alerta ? " ixc-os-alerta" : ""}">
        <div class="ixc-os-topo">
          <span class="ixc-os-cliente">${escaparHtml(o.cliente || "—")}</span>
          ${badgeStatus(o.statusNorm, o.status)}
        </div>
        <div class="ixc-os-sub">#${escaparHtml(String(o.id))} · ${escaparHtml(local || "—")} ${reag}</div>
        <div class="ixc-os-assunto">${escaparHtml(o.assunto || "")}</div>
        ${aviso}
      </div>`;
}

function renderizarAgendaIxc(model) {
    const alvo = document.getElementById("agendaIxcConteudo");
    if (!alvo) return;

    if (!model || model.total === 0) {
        alvo.innerHTML = `<div class="ixc-vazio">
            <p>Nenhuma OS marcada para hoje no IXC${model && model.capturadoEm ? "" : ", ou a tabela ainda não foi populada pelo robô"}.</p>
        </div>`;
        return;
    }

    const quando = model.capturadoEm ? new Date(model.capturadoEm).toLocaleString("pt-BR") : "—";
    const chips = Object.entries(model.resumo)
        .sort((a, b) => b[1] - a[1])
        .map(([s, n]) => `${badgeStatus(ixcNorm(s), s)} ${n}`).join(" &nbsp; ");

    const cards = model.grupos.map(g => `
      <div class="ixc-card">
        <div class="ixc-card-topo">
          <span class="ixc-tec">${escaparHtml(g.tecnico)}${g.terceira ? `<span class="ixc-tag">${escaparHtml(g.terceira)}</span>` : ""}${g.setor ? `<span class="ixc-setor">${escaparHtml(g.setor)}</span>` : ""}</span>
          <span class="ixc-contagem">${g.feitas}/${g.total} feitas${g.alertas ? ` · <b class="ixc-alertas">${g.alertas} ⚠</b>` : ""}</span>
        </div>
        ${g.oss.map(htmlOsIxc).join("")}
      </div>`).join("");

    const omit = model.omitidas ? ` · <span class="ixc-quando">${model.omitidas} OS de técnicos fora da escala omitidas</span>` : "";
    alvo.innerHTML = `
      <div class="ixc-resumo">
        <div><b>${model.total}</b> OS marcadas pra hoje · <b>${model.grupos.length}</b> técnicos da escala${model.alertas ? ` · <b class="ixc-alertas">${model.alertas}</b> alerta(s) de outro dia` : ""}${omit}</div>
        <div class="ixc-chips">${chips}</div>
        <div class="ixc-quando">Retrato do IXC às ${quando} (atualiza de hora em hora)</div>
      </div>
      <div class="ixc-grade">${cards}</div>`;
}

async function carregarAgendaIxc(forcar = false) {
    const alvo = document.getElementById("agendaIxcConteudo");
    if (!alvo || agendaIxcCarregando) return;

    if (agendaIxcCache && !forcar) { renderizarAgendaIxc(agendaIxcCache); return; }

    agendaIxcCarregando = true;
    alvo.innerHTML = `<div class="ixc-vazio"><p>Carregando a agenda do IXC…</p></div>`;
    try {
        const [linhas, techs] = await Promise.all([
            buscarOsPendentes(),
            typeof carregarEscalaTecnicos === "function" ? carregarEscalaTecnicos().catch(() => []) : []
        ]);
        agendaIxcCache = montarAgendaIxc(linhas, techs);
        renderizarAgendaIxc(agendaIxcCache);
    } catch (erro) {
        console.error("Agenda IXC:", erro);
        alvo.innerHTML = `<div class="ixc-vazio"><p>Não consegui carregar a agenda do IXC. ${escaparHtml(erro.message || "")}</p></div>`;
    } finally {
        agendaIxcCarregando = false;
    }
}

/** Troca entre as abas "Agenda IA" e "Agenda IXC" dentro do módulo. */
function registrarAbasAgenda() {
    const botoes = document.querySelectorAll("[data-aba-agenda]");
    if (!botoes.length) return;
    botoes.forEach(botao => botao.addEventListener("click", () => {
        const aba = botao.dataset.abaAgenda;
        botoes.forEach(b => b.classList.toggle("ativo", b === botao));
        const ia = document.getElementById("agendaHojeConteudo");
        const ixc = document.getElementById("agendaIxcConteudo");
        const navDia = document.getElementById("agendaNavDia");
        if (ia) ia.hidden = aba !== "ia";
        if (ixc) ixc.hidden = aba !== "ixc";
        if (navDia) navDia.style.visibility = aba === "ia" ? "" : "hidden"; // nav de dia só faz sentido na Agenda IA
        if (aba === "ixc") carregarAgendaIxc();
    }));
}
