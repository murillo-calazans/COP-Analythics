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
 *
 * "Pedidos de prioridade": OS de campo em aberto (mesmo recorte da aba Em
 * aberto) cujo texto pede prioridade/urgência (PrioridadeEngine), quebradas
 * pelo status atual, + as finalizadas hoje que tinham pedido.
 */

let painelOpCache = null;

/** Técnico (equipe de campo) que iniciou o deslocamento — lido do texto do evento. */
function tecnicoDoDeslocamento(msg) {
    const m = String(msg || "").match(/usu[aá]rio\s+(.+?)\s*,\s*iniciou o deslocamento/i);
    return m ? m[1].trim() : null;
}

/** EVENTO 10 = reagendamento; 5 = agendamento; 2 = deslocamento; 9 = execução. */
async function calcularPainelOperacao() {
    const linhas = typeof buscarOsPendentesCacheado === "function" ? await buscarOsPendentesCacheado() : [];
    const parse = typeof ixcDataBR === "function" ? ixcDataBR : () => null;
    const norm = typeof ixcNorm === "function" ? ixcNorm : (t => String(t || "").toLowerCase());
    const ehCop = typeof assuntoEhDoCop === "function" ? assuntoEhDoCop : () => false;
    const techsEscala = typeof carregarEscalaTecnicos === "function" ? await carregarEscalaTecnicos().catch(() => []) : [];
    const bate = (typeof Motor !== "undefined" && Motor.nomeBate) ? Motor.nomeBate : () => false;
    const nomeCurto = typeof separarTerceira === "function" ? (n => separarTerceira(n).nome) : (n => n);

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

    // Início da operação: RETRATO do momento da importação (status ATUAL de cada
    // OS, não "eventos do dia"). Equipe = o técnico de campo (com/sem auxiliar),
    // lido do texto do deslocamento. Quem está AGORA em deslocamento, quem em
    // execução, e quem da escala ainda não saiu (sem nenhuma OS em desloc/execução).
    const deslocAgora = new Map(), execAgora = new Map();   // nomeTécnico -> [OS]
    for (const id in eventosPorOs) {
        const o = os.get(id) || {};
        const st = norm(o.statusUlt);
        const isDesloc = st === "deslocamento";
        const isExec = st.includes("execu");
        if (!isDesloc && !isExec) continue;            // só o que está em campo AGORA
        const evs = eventosPorOs[id];
        let tec = null;
        for (const e of evs) if (+e.evento === 2) { const t = tecnicoDoDeslocamento(e.msg); if (t) tec = t; }
        if (!tec) continue;                            // sem técnico identificável no deslocamento
        const info = { id, cliente: o.cliente, assunto: o.assunto, cidade: o.cidade, bairro: o.bairro, statusUlt: o.statusUlt };
        const alvo = isDesloc ? deslocAgora : execAgora;
        if (!alvo.has(tec)) alvo.set(tec, []);
        alvo.get(tec).push(info);
    }
    const emMov = [...new Set([...deslocAgora.keys(), ...execAgora.keys()])];
    const semMov = techsEscala
        .filter(t => !emMov.some(nm => bate(nm, t)))
        .map(t => nomeCurto(t.nome))
        .filter((v, i, a) => v && a.indexOf(v) === i)
        .sort((a, b) => a.localeCompare(b, "pt-BR"))
        .map(nome => ({ nome, oss: [] }));
    const equipesLista = mp => [...mp.entries()]
        .map(([nome, oss]) => ({ nome: nomeCurto(nome), oss }))
        .sort((a, b) => b.oss.length - a.oss.length);
    const inicioOperacao = { desloc: equipesLista(deslocAgora), exec: equipesLista(execAgora), semMov };

    // Pedidos de prioridade: pesado (refaz o recorte de campo da aba Em aberto), por
    // isso é calculado depois que o resto do painel aparece (ver renderizarPainelOperacao).
    const calcularPrioridade = () => calcularPrioridadesPainel(linhas, hoje, amanha, norm);

    return { grupos, fechamentos, eventosPorOs, osInfo, capturadoEm, inicioOperacao, calcularPrioridade, prioridade: null };
}

// Segmentos do bloco "Pedidos de prioridade", na ordem da barra.
const PRIORIDADE_PAINEL_GRUPOS = [
    { id: "semAgenda",   rotulo: "Sem agendamento",  cor: "#dc2626" },
    { id: "agendada",    rotulo: "Agendadas",        cor: "#2563eb" },
    { id: "assumida",    rotulo: "Assumidas",        cor: "#7c3aed" },
    { id: "desloc",      rotulo: "Em deslocamento",  cor: "#0891b2" },
    { id: "exec",        rotulo: "Em execução",      cor: "#d97706" },
    { id: "finalizada",  rotulo: "Finalizadas hoje", cor: "#059669" }
];

/** OS com pedido de prioridade no texto, por status atual (ver PRIORIDADE_PAINEL_GRUPOS). */
function calcularPrioridadesPainel(linhas, hoje, amanha, norm) {
    const grupos = Object.fromEntries(PRIORIDADE_PAINEL_GRUPOS.map(g => [g.id, []]));
    if (typeof PrioridadeEngine === "undefined") return { grupos, total: 0, insistentes: 0 };

    // Mesmo recorte da aba Em aberto (só OS de campo); deixa pronto pra ela também.
    let backlog = null;
    if (typeof montarBacklog === "function") {
        backlog = montarBacklog(linhas);
        if (typeof agendaBacklogCache !== "undefined") agendaBacklogCache = backlog;
    }
    for (const o of backlog?.itens ?? []) {
        const pedidos = PrioridadeEngine.pedidosDaOS(backlog.eventosPorOs[String(o.id)]);
        if (!pedidos.length) continue;
        const st = norm(o.status);
        const item = { id: o.id, cliente: o.cliente, cidade: o.cidade, bairro: o.bairroOriginal || o.bairro, assunto: o.assunto, statusUlt: o.status, agendamento: o.agendamento, pedidos };
        if (st === "deslocamento") grupos.desloc.push(item);
        else if (st.includes("execu")) grupos.exec.push(item);
        else if (o.assumida) grupos.assumida.push(item);
        else if (o.agendada) grupos.agendada.push(item);
        else grupos.semAgenda.push(item);
    }

    // Finalizadas hoje que tinham pedido (relatório de ordens: OS já fechada sai da os_pendentes).
    for (const ordem of APP?.dados?.ordens?.values?.() ?? []) {
        const df = ordem.dataFechamento;
        if (!df || df.getTime() < hoje.getTime() || df.getTime() >= amanha || norm(ordem.statusAtual) !== "finalizada") continue;
        const pedidos = PrioridadeEngine.pedidosDaOS(ordem.movimentacoes);
        if (pedidos.length) grupos.finalizada.push({ id: ordem.id, cliente: ordem.cliente, cidade: ordem.cidade, bairro: ordem.bairro, assunto: ordem.assunto, hora: df, pedidos, fechada: true });
    }

    const ultimo = i => i.pedidos[i.pedidos.length - 1].data?.getTime?.() ?? 0;
    for (const lista of Object.values(grupos)) lista.sort((a, b) => b.pedidos.length - a.pedidos.length || ultimo(b) - ultimo(a));
    const todos = Object.values(grupos).flat();
    return { grupos, total: todos.length, insistentes: todos.filter(i => i.pedidos.length >= 2).length };
}

// Ícone (SVG) + cor por cartão — visual moderno (ver mock do usuário).
const IC = {
    cal: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>',
    redo: '<path d="M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.2L3 16M3 21v-5h5"/>',
    ok: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5-6"/>',
    clip: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12h6M9 16h4"/>',
    inbox: '<path d="M3 13l3-8h12l3 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M3 13h5l1 3h6l1-3h5"/>'
};
const PAINEL_OP_CARTOES = [
    { id: "agendadas",   rotulo: "Agendadas hoje",     fonte: "painel", cor: "#2563eb", icone: IC.cal,   lista: m => m.grupos.agendadas,   titulo: "OS de campo marcadas pra hoje" },
    { id: "reagendadas", rotulo: "Reagendadas hoje",   fonte: "painel", cor: "#d97706", icone: IC.redo,  lista: m => m.grupos.reagendadas, titulo: "OS que foram reagendadas hoje" },
    { id: "fechamentos", rotulo: "Fechamentos hoje",   fonte: "fech",   cor: "#059669", icone: IC.ok,    lista: m => m.fechamentos,        titulo: "OS finalizadas hoje" },
    { id: "assumidas",   rotulo: "Assumidas em aberto", fonte: "painel", cor: "#7c3aed", icone: IC.clip,  lista: m => m.grupos.assumidas,  titulo: "OS que um colaborador assumiu e ainda não finalizou" },
    { id: "cop",         rotulo: "COP em aberto",      fonte: "painel", cor: "#0891b2", icone: IC.inbox, lista: m => m.grupos.cop,          titulo: "OS do Controle de Operações ainda em aberto" }
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
    const fmt = n => n.toLocaleString("pt-BR");
    const svgT = p => `<svg viewBox="0 0 24 24" class="op-svg">${p}</svg>`;
    const icTruck = '<path d="M2 6h11v10H2zM13 10h4l4 3v3h-8"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>';

    // 1) Operação hoje — anel: fechamentos sobre a agenda de hoje + barras dos 5 números do dia.
    const n = id => PAINEL_OP_CARTOES.find(c => c.id === id).lista(m).length;
    const nAg = n("agendadas"), nFe = n("fechamentos");
    const maiorOp = Math.max(1, ...PAINEL_OP_CARTOES.map(c => c.lista(m).length));
    const linhasOp = PAINEL_OP_CARTOES.map(c => piLinha(`data-painel-cartao="${c.id}"`, c.rotulo, c.lista(m).length, maiorOp, c.cor,
        c.id === "reagendadas" && nAg ? piPct(c.lista(m).length / nAg * 100) : "", c.titulo)).join("");
    const feitas = Math.min(nFe, nAg);
    const colOp = piColuna("#2563eb", IC.clip, "Operação hoje", "Agenda do dia e o que está em aberto", `
        <div class="pi-destaque">
            ${piRosca([{ n: feitas, cor: "#059669" }, { n: Math.max(nAg - feitas, 0), cor: "var(--cor-borda)" }], fmt(nFe), nAg ? `de ${fmt(nAg)}` : "fechadas")}
            <div class="pi-leitura"><strong>${nAg ? piPct(nFe / nAg * 100) : "—"}</strong><span>fechamentos sobre a agenda de hoje</span></div>
        </div>
        <div class="pi-linhas">${linhasOp}</div>
        <p class="pi-nota">${nAg > feitas ? `<b>${fmt(nAg - feitas)} OS</b> da agenda de hoje ainda sem fechamento.` : "Agenda de hoje toda fechada."}</p>`);

    // 2) Deslocamento das equipes — rosca: deslocamento × execução × sem movimento.
    const io = m.inicioOperacao || { desloc: [], exec: [], semMov: [] };
    const somaOs = lista => lista.reduce((s, e) => s + e.oss.length, 0);
    const nD = io.desloc.length, nE = io.exec.length, nS = io.semMov.length, nT = nD + nE + nS;
    const COR_D = "#2563eb", COR_E = "#059669", COR_S = "#d97706";
    const colEq = piColuna("#0891b2", icTruck, "Deslocamento das equipes", "Onde cada equipe da escala está agora", `
        <div class="pi-destaque">
            ${piRosca([{ n: nD, cor: COR_D }, { n: nE, cor: COR_E }, { n: nS, cor: COR_S }], fmt(nT), "equipes")}
            <div class="pi-leitura"><strong>${nT ? piPct((nD + nE) / nT * 100) : "—"}</strong><span>das equipes já estão em campo</span></div>
        </div>
        <div class="pi-linhas">
            ${piLinha('data-io="io-desloc"', "Em deslocamento", nD, nT, COR_D, `${fmt(somaOs(io.desloc))} OS`, "Técnicos com OS em deslocamento neste momento")}
            ${piLinha('data-io="io-exec"', "Em execução", nE, nT, COR_E, `${fmt(somaOs(io.exec))} OS`, "Técnicos com OS em execução neste momento")}
            ${piLinha('data-io="io-semmov"', "Sem movimento", nS, nT, COR_S, "ainda não saíram", "Técnicos da escala que ainda não saíram")}
        </div>
        <p class="pi-nota">${nS ? `<b>${fmt(nS)} equipe(s)</b> da escala sem nenhuma OS em deslocamento ou execução.` : "Todas as equipes da escala já saíram."}</p>`);

    // 3) Pedidos de prioridade — preenchido depois (cálculo pesado, ver calcularPrioridadesPainel).
    const icAlerta = '<path d="M12 3 2 21h20L12 3z"/><path d="M12 10v5M12 18h.01"/>';
    const colPr = piColuna("#dc2626", icAlerta, "Pedidos de prioridade", "OS de campo em aberto com pedido de urgência",
        `<div id="painelPrioridades"><p class="pi-nota pi-nota-solta">Lendo as mensagens das OS em aberto…</p></div>`, "pi-col-prio");

    alvo.innerHTML = `<div class="pi-colunas">${colOp}${colEq}${colPr}</div>`;

    // Depois de pintar o resto (não segura as outras colunas).
    setTimeout(() => {
        const caixa = document.getElementById("painelPrioridades");
        if (!caixa || painelOpCache !== m) return;
        try { m.prioridade = m.calcularPrioridade(); }
        catch (e) { console.warn("Pedidos de prioridade:", e); caixa.innerHTML = '<p class="pi-nota pi-nota-solta">Não deu pra ler os pedidos agora.</p>'; return; }
        caixa.innerHTML = blocoPrioridadesPainel(m.prioridade);
        caixa.querySelectorAll("[data-prio-grupo]").forEach(botao =>
            botao.addEventListener("click", () => {
                const g = PRIORIDADE_PAINEL_GRUPOS.find(x => x.id === botao.dataset.prioGrupo);
                abrirPopupPrioridade(`Pedido de prioridade · ${g.rotulo}`, m.prioridade.grupos[g.id]);
            }));
    }, 50);

    alvo.querySelectorAll("[data-painel-cartao]").forEach(botao =>
        botao.addEventListener("click", () => abrirPopupPainel(PAINEL_OP_CARTOES.find(c => c.id === botao.dataset.painelCartao))));
    alvo.querySelector('[data-io="io-desloc"]')?.addEventListener("click", () =>
        abrirPopupEquipes("Em deslocamento agora", "Técnicos com OS em deslocamento neste momento", io.desloc, true));
    alvo.querySelector('[data-io="io-exec"]')?.addEventListener("click", () =>
        abrirPopupEquipes("Em execução agora", "Técnicos com OS em execução neste momento", io.exec, true));
    alvo.querySelector('[data-io="io-semmov"]')?.addEventListener("click", () =>
        abrirPopupEquipes("Sem movimento", "Técnicos da escala que ainda não saíram", io.semMov, false));
}

// ---------- Peças do painel infográfico (3 colunas) ----------
function piPct(v) {
    return `${v.toLocaleString("pt-BR", { maximumFractionDigits: v > 0 && v < 10 ? 1 : 0 })}%`;
}

/** Coluna: cabeçalho com ícone colorido + corpo. */
function piColuna(cor, icone, titulo, sub, corpo, classe = "") {
    return `
        <section class="pi-coluna ${classe}" style="--c:${cor}">
            <div class="pi-cab">
                <span class="pi-ic"><svg viewBox="0 0 24 24" class="op-svg">${icone}</svg></span>
                <div><h3>${titulo}</h3><small>${sub}</small></div>
            </div>
            ${corpo}
        </section>`;
}

/** Linha clicável: ponto colorido, rótulo, valor (+ extra) e barra proporcional ao maior da coluna. */
function piLinha(attr, rotulo, n, total, cor, extra = "", titulo = "") {
    const largura = total ? Math.min(100, n / total * 100) : 0;
    return `
        <button type="button" class="pi-linha" ${attr} style="--c:${cor}" title="${escaparHtml(titulo || rotulo)}">
            <span class="pi-ponto"></span><span class="pi-rot">${rotulo}</span>
            <span class="pi-val">${n.toLocaleString("pt-BR")}${extra ? `<em>${extra}</em>` : ""}</span>
            <span class="pi-barra"><i style="width:${largura.toFixed(1)}%"></i></span>
        </button>`;
}

/** Rosca/anel em SVG (360° = soma das fatias), com número e legenda no centro. */
function piRosca(fatias, centro, sub) {
    const cx = 66, cy = 66, r = 50, larg = 14, circ = 2 * Math.PI * r;
    const total = fatias.reduce((s, f) => s + f.n, 0);
    const vao = fatias.filter(f => f.n > 0).length > 1 ? 3 : 0;
    let acum = 0;
    const arcos = total ? fatias.filter(f => f.n > 0).map(f => {
        const comp = f.n / total * circ;
        const arco = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${f.cor}" stroke-width="${larg}" stroke-linecap="${vao ? "butt" : "round"}"
            stroke-dasharray="${Math.max(comp - vao, 0.01).toFixed(2)} ${circ.toFixed(2)}" stroke-dashoffset="${(-acum).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`;
        acum += comp;
        return arco;
    }).join("") : "";
    return `
        <svg class="pi-rosca" viewBox="0 0 132 132" role="img" aria-label="${escaparHtml(`${centro} ${sub}`)}">
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--cor-borda)" stroke-width="${larg}"/>
            ${arcos}
            <text x="${cx}" y="${cy + 2}" text-anchor="middle" class="pi-rosca-num">${escaparHtml(String(centro))}</text>
            <text x="${cx}" y="${cy + 20}" text-anchor="middle" class="pi-rosca-sub">${escaparHtml(String(sub))}</text>
        </svg>`;
}

/** Corpo da coluna "Pedidos de prioridade": waffle (1 quadrado = 1 OS) + destaque sem agendamento + linhas por status. */
function blocoPrioridadesPainel(p) {
    if (!p) return "";
    if (!p.total) return '<p class="pi-nota pi-nota-solta">Nenhuma OS de campo em aberto com pedido de prioridade ou urgência nas mensagens.</p>';

    const TETO_WAFFLE = 100;   // acima disso, cada quadrado vale mais de 1 OS
    const escala = Math.max(1, Math.ceil(p.total / TETO_WAFFLE));
    const quadrados = PRIORIDADE_PAINEL_GRUPOS.flatMap(g =>
        Array.from({ length: Math.round(p.grupos[g.id].length / escala) }, () => `<i style="--c:${g.cor}" title="${g.rotulo}"></i>`)).join("");
    const sem = p.grupos.semAgenda.length;
    const linhas = PRIORIDADE_PAINEL_GRUPOS.map(g => piLinha(`data-prio-grupo="${g.id}"`, g.rotulo, p.grupos[g.id].length, p.total, g.cor,
        piPct(p.grupos[g.id].length / p.total * 100), `Pedido de prioridade · ${g.rotulo}`)).join("");
    return `
        <div class="pi-prio-topo">
            <div class="pi-waffle" role="img" aria-label="Cada quadrado é ${escala === 1 ? "uma OS" : `${escala} OS`} com pedido de prioridade, colorida pela situação">${quadrados}</div>
            <div class="pi-leitura pi-alerta">
                <strong>${piPct(sem / p.total * 100)}</strong>
                <span>pediram prioridade e ainda estão <b>sem agendamento</b></span>
                ${p.insistentes ? `<span class="pi-chip">${p.insistentes.toLocaleString("pt-BR")} pediram 2 vezes ou mais</span>` : ""}
            </div>
        </div>
        <div class="pi-linhas">${linhas}</div>
        <p class="pi-nota"><b>${p.total.toLocaleString("pt-BR")} OS de campo</b> em aberto pedem prioridade nas mensagens. Cada quadrado é ${escala === 1 ? "uma OS" : `${escala} OS`}.</p>`;
}

/** Lista das OS com pedido de prioridade: trecho do último pedido, quantas vezes pediu e o status. */
function abrirPopupPrioridade(titulo, itens) {
    fecharPopupPainel();
    const lista = itens.slice(0, PAINEL_OP_TETO);
    const linhas = lista.map(o => {
        const ult = o.pedidos[o.pedidos.length - 1];
        const tag = o.fechada && o.hora
            ? `<span class="escala-tag ixc-feita-hora">✔ ${o.hora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>`
            : o.agendamento
            ? `<span class="escala-tag ixc-data">📅 ${o.agendamento.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>`
            : `<span class="escala-tag">${escaparHtml(String(o.statusUlt || ""))}</span>`;
        const vezes = o.pedidos.length >= 2 ? `<span class="escala-tag ixc-data-vencida">pediu ${o.pedidos.length}x</span>` : "";
        return `
          <li class="ixc-os ixc-os-click" ${o.fechada ? `data-fech-os="${escaparHtml(String(o.id))}"` : `data-painel-os="${escaparHtml(String(o.id))}"`} title="Ver a ordem completa">
            <div class="ixc-os-linha"><span class="ixc-os-cliente">#${escaparHtml(String(o.id))} · ${escaparHtml(o.cliente || "—")}</span>${vezes}${tag}</div>
            <div class="ixc-os-sub">${escaparHtml(o.cidade || "—")}${o.bairro ? " · " + escaparHtml(o.bairro) : ""} · ${escaparHtml(ixcAssuntoCurto ? ixcAssuntoCurto(o.assunto) : (o.assunto || "—"))}</div>
            <div class="ixc-os-sub">💬 ${ult.data ? ult.data.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) + " — " : ""}${escaparHtml(ult.trecho)}</div>
          </li>`;
    }).join("");

    const fundo = document.createElement("div");
    fundo.className = "ixc-popup-fundo painel-popup-fundo";
    fundo.innerHTML = `
      <div class="ixc-popup" role="dialog" aria-modal="true" aria-label="${escaparHtml(titulo)}">
        <div class="ixc-popup-topo">
          <div><h2>${escaparHtml(titulo)} <span class="escala-pilula">${itens.length.toLocaleString("pt-BR")} OS</span></h2><p>Pedido de prioridade/urgência escrito nas mensagens da OS — quem pediu mais vezes primeiro${itens.length > PAINEL_OP_TETO ? ` (mostrando ${PAINEL_OP_TETO})` : ""}</p></div>
          <button type="button" class="ixc-popup-fechar" aria-label="Fechar">✕</button>
        </div>
        <div class="ixc-popup-corpo">${lista.length ? `<ul class="ixc-lista">${linhas}</ul>` : '<p class="alerta-vazio">Nenhuma OS aqui agora.</p>'}</div>
      </div>`;
    (document.getElementById("secao-inicio") || document.body).appendChild(fundo);
    document.body.classList.add("ixc-popup-aberto");
    fundo.addEventListener("click", e => { if (e.target === fundo) fecharPopupPainel(); });
    fundo.querySelector(".ixc-popup-fechar").addEventListener("click", fecharPopupPainel);
    fundo.querySelectorAll("[data-painel-os]").forEach(li =>
        li.addEventListener("click", () => abrirTimelineIxc(li.dataset.painelOs, painelOpCache)));
    fundo.querySelectorAll("[data-fech-os]").forEach(li =>
        li.addEventListener("click", () => { if (typeof abrirModalOS === "function") abrirModalOS(li.dataset.fechOs); }));
    fundo.querySelector(".ixc-popup-fechar").focus();
}

/** Popup de EQUIPES (técnicos), não de OS — usado pelo bloco "Início da operação". */
function abrirPopupEquipes(titulo, descricao, equipes, comOs) {
    fecharPopupPainel();
    const linhas = equipes.map(e => `
        <li class="ixc-os">
          <div class="ixc-os-linha">
            <span class="ixc-os-cliente">${escaparHtml(e.nome || "—")}</span>
            ${comOs ? `<span class="escala-pilula">${e.oss.length} OS</span>` : ""}
          </div>
          ${comOs && e.oss.length ? `<div class="ixc-os-sub">${e.oss.slice(0, 12).map(o => "#" + escaparHtml(String(o.id)) + (o.cliente ? " · " + escaparHtml(o.cliente) : "")).join(" &nbsp;|&nbsp; ")}${e.oss.length > 12 ? " …" : ""}</div>` : ""}
        </li>`).join("");
    const fundo = document.createElement("div");
    fundo.className = "ixc-popup-fundo painel-popup-fundo";
    fundo.innerHTML = `
      <div class="ixc-popup" role="dialog" aria-modal="true" aria-label="${escaparHtml(titulo)}">
        <div class="ixc-popup-topo">
          <div><h2>${escaparHtml(titulo)} <span class="escala-pilula">${equipes.length} equipe(s)</span></h2><p>${escaparHtml(descricao)}</p></div>
          <button type="button" class="ixc-popup-fechar" aria-label="Fechar">✕</button>
        </div>
        <div class="ixc-popup-corpo">${equipes.length ? `<ul class="ixc-lista">${linhas}</ul>` : '<p class="alerta-vazio">Ninguém aqui agora.</p>'}</div>
      </div>`;
    (document.getElementById("secao-inicio") || document.body).appendChild(fundo);
    document.body.classList.add("ixc-popup-aberto");
    fundo.addEventListener("click", e => { if (e.target === fundo) fecharPopupPainel(); });
    fundo.querySelector(".ixc-popup-fechar").addEventListener("click", fecharPopupPainel);
    fundo.querySelector(".ixc-popup-fechar").focus();
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
