/**
 * ==========================================================
 * Painel de Operação (tela inicial) — visão global do dia
 * ==========================================================
 * Cards de gestão com o retrato do dia pra toda a operação (não é o
 * "Seu mês", que é pessoal): agendadas e reagendadas hoje, fechamentos
 * hoje, OS assumidas em aberto e OS do COP em aberto. Só admin/editor
 * (dado operacional). Cada card abre a lista por trás; a OS abre a
 * ordem cronológica (reusa a timeline da Agenda IXC / modal de ordens).
 *
 * Tudo sai de UMA varredura da os_pendentes (eventos de OS em aberto) +
 * as finalizadas de hoje do relatório de ordens (APP.dados.ordens).
 */

let painelOpCache = null;

/** EVENTO 10 = reagendamento; 5 = agendamento (ver js/agendador/motor.js). */
async function calcularPainelOperacao() {
    const linhas = typeof buscarOsPendentesCacheado === "function" ? await buscarOsPendentesCacheado() : [];
    const parse = typeof ixcDataBR === "function" ? ixcDataBR : () => null;
    const norm = typeof ixcNorm === "function" ? ixcNorm : (t => String(t || "").toLowerCase());
    const ehCop = typeof assuntoEhDoCop === "function" ? assuntoEhDoCop : () => false;

    const hoje = hojeMeiaNoite();
    const amanha = hoje.getTime() + 86400000;
    const ehHoje = d => d && d.getTime() >= hoje.getTime() && d.getTime() < amanha;

    const os = new Map();
    const eventosPorOs = {}, osInfo = {};
    let capturadoEm = null;

    for (const l of linhas) {
        const d = l.dados || {};
        const id = String(d["ID OS"] || "");
        if (!id) continue;
        if (l.capturado_em && (!capturadoEm || l.capturado_em > capturadoEm)) capturadoEm = l.capturado_em;

        (eventosPorOs[id] = eventosPorOs[id] || []).push({ data: parse(d.DATA), evento: d.EVENTO, status: d.STATUS, msg: d.MENSAGEM });
        if (!osInfo[id]) osInfo[id] = { cliente: d.CLIENTE, assunto: d.ASSUNTO, bairro: d.BAIRRO, cidade: d.CIDADE };

        if (!os.has(id)) os.set(id, { id, cliente: d.CLIENTE, assunto: d.ASSUNTO, cidade: d.CIDADE, bairro: d.BAIRRO, statusData: null, statusUlt: null, agendamento: null, reagHoje: false });
        const o = os.get(id);
        const dataEv = parse(d.DATA);
        if (dataEv && (!o.statusData || dataEv > o.statusData)) { o.statusData = dataEv; o.statusUlt = d.STATUS; }
        if (+d.EVENTO === 10 && ehHoje(dataEv)) o.reagHoje = true;
        const ag = parse(d.AGENDAMENTO);
        if (ag && (!o.agendamento || ag > o.agendamento)) o.agendamento = ag;
    }

    const grupos = { agendadas: [], reagendadas: [], assumidas: [], cop: [] };
    for (const o of os.values()) {
        const stn = norm(o.statusUlt);
        if (stn === "finalizada") continue;         // 529 já é <> Finalizada; só segurança
        const cop = ehCop(o.assunto);
        if (o.reagHoje) grupos.reagendadas.push(o);
        if (stn === "assumida") grupos.assumidas.push(o);
        if (cop) grupos.cop.push(o);
        else if (ehHoje(o.agendamento)) grupos.agendadas.push(o);   // agendadas de campo pra hoje
    }

    // Fechamentos de hoje (OS já fechadas -> relatório de ordens, não no pré-agendamento).
    const fechamentos = [];
    const ordens = APP?.dados?.ordens;
    if (ordens) for (const ordem of ordens.values()) {
        const df = ordem.dataFechamento;
        if (df && df.getTime() >= hoje.getTime() && df.getTime() < amanha && norm(ordem.statusAtual) === "finalizada")
            fechamentos.push({ id: ordem.id, cliente: ordem.cliente, assunto: ordem.assunto, cidade: ordem.cidade, bairro: ordem.bairro, hora: df });
    }
    fechamentos.sort((a, b) => (a.hora || 0) - (b.hora || 0));
    grupos.agendadas.sort((a, b) => (a.agendamento || 0) - (b.agendamento || 0));
    grupos.cop.sort((a, b) => (a.cliente || "").localeCompare(b.cliente || "", "pt-BR"));

    return { grupos, fechamentos, eventosPorOs, osInfo, capturadoEm };
}

const PAINEL_OP_CARTOES = [
    { id: "agendadas",   rotulo: "Agendadas hoje",     fonte: "painel", lista: m => m.grupos.agendadas,   titulo: "OS de campo marcadas pra hoje" },
    { id: "reagendadas", rotulo: "Reagendadas hoje",   fonte: "painel", lista: m => m.grupos.reagendadas, titulo: "OS que foram reagendadas hoje" },
    { id: "fechamentos", rotulo: "Fechamentos hoje",   fonte: "fech",   lista: m => m.fechamentos,        titulo: "OS finalizadas hoje" },
    { id: "assumidas",   rotulo: "Assumidas em aberto", fonte: "painel", lista: m => m.grupos.assumidas,  titulo: "OS que um colaborador assumiu e ainda não finalizou" },
    { id: "cop",         rotulo: "COP em aberto",      fonte: "painel", lista: m => m.grupos.cop,          titulo: "OS do Controle de Operações ainda em aberto" }
];

const PAINEL_OP_TETO = 300;   // teto de OS listadas por card

async function renderizarPainelOperacao() {
    const alvo = document.getElementById("inicioPainelOperacao");
    if (!alvo) return;
    // Visível a todos os usuários logados (inclusive leitor).

    try {
        painelOpCache = await calcularPainelOperacao();
    } catch (e) {
        console.warn("Painel de operação:", e);
        alvo.innerHTML = "";
        return;
    }
    const m = painelOpCache;
    const tiles = PAINEL_OP_CARTOES.map(c => {
        const n = c.lista(m).length;
        return `
            <button type="button" class="stat-tile stat-tile-link painel-op-tile" data-painel-cartao="${c.id}" title="${escaparHtml(c.titulo)}">
                <div class="stat-label">${c.rotulo}</div>
                <div class="stat-valor">${n.toLocaleString("pt-BR")}</div>
            </button>`;
    }).join("");

    alvo.innerHTML = `
        <div class="indicadores-secao-titulo">Operação hoje</div>
        <div class="kpi-row">${tiles}</div>`;

    alvo.querySelectorAll("[data-painel-cartao]").forEach(botao =>
        botao.addEventListener("click", () => abrirPopupPainel(PAINEL_OP_CARTOES.find(c => c.id === botao.dataset.painelCartao))));
}

function abrirPopupPainel(cartao) {
    fecharPopupPainel();
    const m = painelOpCache;
    const itens = cartao.lista(m).slice(0, PAINEL_OP_TETO);
    const total = cartao.lista(m).length;

    const linhas = itens.map(o => {
        const attr = cartao.fonte === "fech" ? `data-fech-os="${escaparHtml(String(o.id))}"` : `data-painel-os="${escaparHtml(String(o.id))}"`;
        const dir = cartao.fonte === "fech" && o.hora
            ? `<span class="escala-tag ixc-feita-hora">✔ ${o.hora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>`
            : cartao.id === "agendadas" && o.agendamento
            ? `<span class="escala-tag">📅 ${o.agendamento.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>`
            : `<span class="escala-tag">${escaparHtml((o.statusUlt || "").toString())}</span>`;
        return `
          <li class="ixc-os ixc-os-click" ${attr} title="Ver a ordem completa">
            <div class="ixc-os-linha">
              <span class="ixc-os-cliente">#${escaparHtml(String(o.id))} · ${escaparHtml(o.cliente || "—")}</span>
              ${dir}
            </div>
            <div class="ixc-os-sub">${escaparHtml(o.cidade || "—")}${o.bairro ? " · " + escaparHtml(o.bairro) : ""} · ${escaparHtml(ixcAssuntoCurto ? ixcAssuntoCurto(o.assunto) : (o.assunto || "—"))}</div>
          </li>`;
    }).join("");

    const fundo = document.createElement("div");
    fundo.className = "ixc-popup-fundo painel-popup-fundo";
    fundo.innerHTML = `
      <div class="ixc-popup" role="dialog" aria-modal="true" aria-label="${escaparHtml(cartao.rotulo)}">
        <div class="ixc-popup-topo">
          <div>
            <h2>${escaparHtml(cartao.rotulo)} <span class="escala-pilula">${total.toLocaleString("pt-BR")} OS</span></h2>
            <p>${escaparHtml(cartao.titulo)}${total > PAINEL_OP_TETO ? ` — mostrando as ${PAINEL_OP_TETO} primeiras` : ""}</p>
          </div>
          <button type="button" class="ixc-popup-fechar" aria-label="Fechar">✕</button>
        </div>
        <div class="ixc-popup-corpo">${itens.length ? `<ul class="ixc-lista">${linhas}</ul>` : '<p class="alerta-vazio">Nenhuma OS aqui agora.</p>'}</div>
      </div>`;
    (document.getElementById("secao-inicio") || document.body).appendChild(fundo);
    document.body.classList.add("ixc-popup-aberto");
    fundo.addEventListener("click", e => { if (e.target === fundo) fecharPopupPainel(); });
    fundo.querySelector(".ixc-popup-fechar").addEventListener("click", fecharPopupPainel);
    // OS em aberto -> timeline (eventos do próprio painel); finalizada -> modal de ordens.
    fundo.querySelectorAll("[data-painel-os]").forEach(li =>
        li.addEventListener("click", () => abrirTimelineIxc(li.dataset.painelOs, painelOpCache)));
    fundo.querySelectorAll("[data-fech-os]").forEach(li =>
        li.addEventListener("click", () => { if (typeof abrirModalOS === "function") abrirModalOS(li.dataset.fechOs); }));
    fundo.querySelector(".ixc-popup-fechar").focus();
}

function fecharPopupPainel() {
    document.querySelector(".painel-popup-fundo")?.remove();
    if (!document.querySelector(".ixc-popup-fundo")) document.body.classList.remove("ixc-popup-aberto");
}
