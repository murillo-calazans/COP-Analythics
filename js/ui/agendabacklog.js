/**
 * ==========================================================
 * Agendador IA — aba "Em aberto" (backlog de OS de campo)
 * ==========================================================
 * Retrato do que está EM ABERTO no pré-agendamento (os_pendentes), só OS
 * de campo (via Motor.campo — fora COP/infra/faturamento): total em aberto,
 * quantas já estão agendadas, quantas estão há mais de 3 dias em aberto, e a
 * quebra por assunto. Cada número abre a lista; cada OS abre a timeline.
 */

let agendaBacklogCache = null;
let agendaBacklogCarregando = false;
let backlogCidade = "";   // filtro de cidade atual ("" = todas)

const BACKLOG_DIAS_ANTIGA = 3;
const BACKLOG_TETO = 300;   // teto de OS listadas por popup

function montarBacklog(linhas) {
    const rows = linhas.map(l => l.dados);
    const capturadoEm = linhas.reduce((max, l) => (l.capturado_em && (!max || l.capturado_em > max) ? l.capturado_em : max), null);
    if (!rows.length || typeof Motor === "undefined") return { total: 0, agendadas: 0, antigas: 0, itens: [], grupos: [], capturadoEm, eventosPorOs: {}, osInfo: {} };

    const hoje = ixcMeiaNoite();
    const limiteAntiga = Date.now() - BACKLOG_DIAS_ANTIGA * 86400000;

    const agDate = {}, aberturaDate = {}, eventosPorOs = {}, osInfo = {};
    for (const r of rows) {
        const id = String(r["ID OS"] || "");
        if (!id) continue;
        const ag = ixcDataBR(r.AGENDAMENTO); if (ag) agDate[id] = ag;
        const ab = ixcDataBR(r["DATA/HORA ABERTURA"]); if (ab && (!aberturaDate[id] || ab < aberturaDate[id])) aberturaDate[id] = ab;
        (eventosPorOs[id] = eventosPorOs[id] || []).push({ data: ixcDataBR(r.DATA), evento: r.EVENTO, status: r.STATUS, msg: r.MENSAGEM });
        if (!osInfo[id]) osInfo[id] = { cliente: r.CLIENTE, assunto: r.ASSUNTO, bairro: r.BAIRRO, cidade: r.CIDADE };
    }

    const { os } = Motor.montarOS(rows, hoje, Motor.PADRAO_PARAMS);
    const itens = os
        .filter(o => o.campo && ixcNorm(o.status) !== "finalizada")   // campo + em aberto
        .map(o => {
            const id = String(o.id);
            const abertura = aberturaDate[id] || null;
            // o ÚLTIMO status manda: se a OS foi assumida, o agendamento/reagendamento
            // anteriores não valem mais (não é mais "agendada" nem "reagendada").
            const assumida = ixcNorm(o.status) === "assumida";
            return {
                id: o.id, cliente: o.cliente, cidade: o.cidade, bairro: o.bairro, assunto: o.assunto, status: o.status,
                agendada: !assumida && !!agDate[id], agendamento: assumida ? null : (agDate[id] || null), abertura,
                antiga: abertura ? abertura.getTime() < limiteAntiga : false,
                reagendamentos: assumida ? 0 : (o.reagendamentos || 0)
            };
        });

    // cidades (todas as OS em aberto) pro filtro, ordenadas por quantidade
    const contaCidade = new Map();
    for (const i of itens) { const c = i.cidade || "—"; contaCidade.set(c, (contaCidade.get(c) || 0) + 1); }
    const cidades = [...contaCidade.entries()]
        .map(([cidade, n]) => ({ cidade, n }))
        .sort((a, b) => b.n - a.n || a.cidade.localeCompare(b.cidade, "pt-BR"));

    return {
        total: itens.length,
        agendadas: itens.filter(i => i.agendada).length,
        antigas: itens.filter(i => i.antiga).length,
        itens, cidades, capturadoEm, eventosPorOs, osInfo
    };
}

/** Recorta o backlog pela cidade escolhida (vazio = todas) e refaz KPIs + assuntos. */
function recorteBacklog(model) {
    const itens = backlogCidade ? model.itens.filter(i => (i.cidade || "—") === backlogCidade) : model.itens;
    const porAssunto = new Map();
    for (const i of itens) {
        const k = i.assunto || "—";
        if (!porAssunto.has(k)) porAssunto.set(k, { assunto: k, oss: [] });
        porAssunto.get(k).oss.push(i);
    }
    const grupos = [...porAssunto.values()].map(g => ({
        assunto: g.assunto,
        total: g.oss.length,
        maisAntiga: g.oss.reduce((m, o) => (o.abertura && (!m || o.abertura < m)) ? o.abertura : m, null),
        oss: g.oss.sort((a, b) => (a.abertura || 0) - (b.abertura || 0))
    })).sort((a, b) => b.total - a.total);
    return {
        itens, grupos,
        total: itens.length,
        agendadas: itens.filter(i => i.agendada).length,
        antigas: itens.filter(i => i.antiga).length,
        reagendadas: itens.filter(i => i.reagendamentos > 0).length
    };
}

function backlogHaDias(data) {
    if (!data) return "—";
    const dias = Math.floor((Date.now() - data.getTime()) / 86400000);
    if (dias <= 0) return "hoje";
    return `há ${dias} ${dias === 1 ? "dia" : "dias"}`;
}

function backlogAssuntoCurto(a) {
    const s = String(a || "").replace(/\s*\(\d+\)/g, "").trim();
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function backlogCidadeCurta(c) {
    const s = String(c || "—").trim();
    return s.length > 16 ? s.slice(0, 15) + "…" : s;
}

/** Gráfico de colunas (série única) das cidades com mais OS em aberto. */
function graficoCidades(cidades) {
    const dados = (cidades || []).slice(0, 15);
    if (!dados.length) return "";

    const W = 820, H = 300, mL = 46, mR = 12, mT = 20, mB = 96;
    const pw = W - mL - mR, ph = H - mT - mB;
    const max = Math.max(...dados.map(d => d.n)) || 1;
    const passo = pw / dados.length;                     // slot de cada coluna
    const larg = Math.max(10, Math.min(46, passo - 10)); // largura da barra, com respiro
    const base = mT + ph;
    const y = v => mT + ph - (v / max) * ph;

    const ticks = 4;
    const grid = Array.from({ length: ticks + 1 }, (_, k) => {
        const v = Math.round(max * k / ticks);
        const gy = y(v);
        return `<line x1="${mL}" y1="${gy.toFixed(1)}" x2="${W - mR}" y2="${gy.toFixed(1)}" class="graf-grid"/>` +
            `<text x="${mL - 7}" y="${(gy + 3.5).toFixed(1)}" class="graf-ytick" text-anchor="end">${v}</text>`;
    }).join("");

    const colunas = dados.map((d, i) => {
        const cx = mL + passo * i + passo / 2;
        const topo = y(d.n);
        const alt = Math.max(0, base - topo);
        return `
          <g class="graf-col">
            <rect x="${(cx - larg / 2).toFixed(1)}" y="${topo.toFixed(1)}" width="${larg.toFixed(1)}" height="${alt.toFixed(1)}" rx="4" class="graf-barra"><title>${escaparHtml(d.cidade)}: ${d.n} em aberto</title></rect>
            <text x="${cx.toFixed(1)}" y="${(topo - 5).toFixed(1)}" class="graf-valor" text-anchor="middle">${d.n}</text>
            <text x="${cx.toFixed(1)}" y="${H - mB + 16}" class="graf-xtick" text-anchor="end" transform="rotate(-35 ${cx.toFixed(1)} ${H - mB + 16})">${escaparHtml(backlogCidadeCurta(d.cidade))}</text>
          </g>`;
    }).join("");

    return `
        <div class="indicadores-secao-titulo">Cidades com OS em aberto</div>
        <div class="graf-wrap">
          <svg viewBox="0 0 ${W} ${H}" class="graf-svg" role="img" aria-label="OS de campo em aberto por cidade (top ${dados.length})">
            ${grid}
            ${colunas}
          </svg>
        </div>`;
}

const BACKLOG_CARTOES = [
    { id: "total", rotulo: "Total em aberto", filtro: () => true, cor: "#2563eb" },
    { id: "agendadas", rotulo: "Agendadas", filtro: i => i.agendada, cor: "#16a34a" },
    { id: "reagendadas", rotulo: "Reagendadas", filtro: i => i.reagendamentos > 0, cor: "#d97706" },
    { id: "antigas", rotulo: `+${BACKLOG_DIAS_ANTIGA} dias em aberto`, filtro: i => i.antiga, cor: "#dc2626" }
];

function desenharBacklog(model) {
    const alvo = document.getElementById("agendaAbertoConteudo");
    if (!alvo) return;

    if (!model || !model.total) {
        alvo.innerHTML = `<div class="ixc-vazio"><p>Nenhuma OS de campo em aberto${model && model.capturadoEm ? "" : ", ou a tabela ainda não foi populada pelo robô"}.</p></div>`;
        return;
    }

    // cidade escolhida sumiu numa recarga? volta pra "todas"
    if (backlogCidade && !model.cidades.some(c => c.cidade === backlogCidade)) backlogCidade = "";

    const banner = typeof bannerAtualizacaoIxc === "function" ? bannerAtualizacaoIxc(model.capturadoEm) : "";
    const rec = recorteBacklog(model);
    const sufixo = backlogCidade ? ` · ${escaparHtml(backlogCidade)}` : "";

    const opcoes = `<option value="">Todas as cidades (${model.total.toLocaleString("pt-BR")})</option>` +
        model.cidades.map(c => `<option value="${escaparHtml(c.cidade)}"${c.cidade === backlogCidade ? " selected" : ""}>${escaparHtml(c.cidade)} (${c.n.toLocaleString("pt-BR")})</option>`).join("");
    const filtroCidade = `
        <div class="backlog-filtro">
            <label for="backlogCidadeSel">Cidade:</label>
            <select id="backlogCidadeSel" class="backlog-cidade-sel">${opcoes}</select>
            ${backlogCidade ? `<button type="button" class="backlog-limpar" id="backlogLimpar" title="Limpar filtro">✕</button>` : ""}
        </div>`;

    const valor = { total: rec.total, agendadas: rec.agendadas, reagendadas: rec.reagendadas, antigas: rec.antigas };
    const kpis = BACKLOG_CARTOES.map(c => `
        <button type="button" class="stat-tile stat-tile-link backlog-tile" data-backlog-cartao="${c.id}" style="border-left:3px solid ${c.cor}">
            <div class="stat-label">${c.rotulo}</div>
            <div class="stat-valor">${valor[c.id].toLocaleString("pt-BR")}</div>
        </button>`).join("");

    const cards = rec.grupos.map((g, i) => `
        <button type="button" class="cop-assunto-card" data-backlog-assunto="${i}">
            <span class="cop-assunto-nome">${escaparHtml(backlogAssuntoCurto(g.assunto))}</span>
            <span class="cop-assunto-num">${g.total.toLocaleString("pt-BR")}</span>
            <span class="cop-assunto-sub">mais antiga ${escaparHtml(backlogHaDias(g.maisAntiga))}</span>
        </button>`).join("");

    alvo.innerHTML = `
        ${banner}
        ${filtroCidade}
        <div class="kpi-row">${kpis}</div>
        <div class="indicadores-secao-titulo">Em aberto por assunto${sufixo}</div>
        <div class="cop-assuntos">${cards}</div>
        ${graficoCidades(model.cidades)}`;

    const sel = alvo.querySelector("#backlogCidadeSel");
    if (sel) sel.addEventListener("change", () => { backlogCidade = sel.value; desenharBacklog(model); });
    alvo.querySelector("#backlogLimpar")?.addEventListener("click", () => { backlogCidade = ""; desenharBacklog(model); });

    alvo.querySelectorAll("[data-backlog-cartao]").forEach(botao =>
        botao.addEventListener("click", () => {
            const c = BACKLOG_CARTOES.find(x => x.id === botao.dataset.backlogCartao);
            abrirPopupBacklog(c.rotulo + sufixo, rec.itens.filter(c.filtro));
        }));
    alvo.querySelectorAll("[data-backlog-assunto]").forEach(botao =>
        botao.addEventListener("click", () => {
            const g = rec.grupos[+botao.dataset.backlogAssunto];
            abrirPopupBacklog(backlogAssuntoCurto(g.assunto) + sufixo, g.oss);
        }));
}

function abrirPopupBacklog(titulo, oss) {
    fecharPopupBacklog();
    const lista = oss.slice(0, BACKLOG_TETO);
    const linhas = lista.map(o => {
        const tagAg = o.agendada && o.agendamento
            ? `<span class="escala-tag ixc-data">📅 ${o.agendamento.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>`
            : `<span class="escala-tag">sem agendamento</span>`;
        const tagAntiga = o.antiga ? `<span class="escala-tag ixc-data-vencida">${escaparHtml(backlogHaDias(o.abertura))}</span>` : "";
        return `
          <li class="ixc-os ixc-os-click" data-bk-os="${escaparHtml(String(o.id))}" title="Ver a ordem completa">
            <div class="ixc-os-linha"><span class="ixc-os-cliente">#${escaparHtml(String(o.id))} · ${escaparHtml(o.cliente || "—")}</span>${tagAg}</div>
            <div class="ixc-os-sub">${escaparHtml(o.cidade || "—")}${o.bairro ? " · " + escaparHtml(o.bairro) : ""} · ${escaparHtml(ixcAssuntoCurto ? ixcAssuntoCurto(o.assunto) : (o.assunto || "—"))} ${tagAntiga}</div>
          </li>`;
    }).join("");

    const fundo = document.createElement("div");
    fundo.className = "ixc-popup-fundo backlog-popup-fundo";
    fundo.innerHTML = `
      <div class="ixc-popup" role="dialog" aria-modal="true" aria-label="${escaparHtml(titulo)}">
        <div class="ixc-popup-topo">
          <div><h2>${escaparHtml(titulo)} <span class="escala-pilula">${oss.length.toLocaleString("pt-BR")} OS</span></h2><p>OS de campo em aberto${oss.length > BACKLOG_TETO ? ` — mostrando as ${BACKLOG_TETO} mais antigas` : ""}</p></div>
          <button type="button" class="ixc-popup-fechar" aria-label="Fechar">✕</button>
        </div>
        <div class="ixc-popup-corpo">${lista.length ? `<ul class="ixc-lista">${linhas}</ul>` : '<p class="alerta-vazio">Nenhuma OS aqui.</p>'}</div>
      </div>`;
    (document.getElementById("secao-agenda-hoje") || document.body).appendChild(fundo);
    document.body.classList.add("ixc-popup-aberto");
    fundo.addEventListener("click", e => { if (e.target === fundo) fecharPopupBacklog(); });
    fundo.querySelector(".ixc-popup-fechar").addEventListener("click", fecharPopupBacklog);
    fundo.querySelectorAll("[data-bk-os]").forEach(li =>
        li.addEventListener("click", () => abrirTimelineIxc(li.dataset.bkOs, agendaBacklogCache)));
    fundo.querySelector(".ixc-popup-fechar").focus();
}

function fecharPopupBacklog() {
    document.querySelector(".backlog-popup-fundo")?.remove();
    if (!document.querySelector(".ixc-popup-fundo")) document.body.classList.remove("ixc-popup-aberto");
}

async function renderizarAgendaBacklog(forcar = false) {
    const alvo = document.getElementById("agendaAbertoConteudo");
    if (!alvo || agendaBacklogCarregando) return;
    if (agendaBacklogCache && !forcar) { desenharBacklog(agendaBacklogCache); return; }

    agendaBacklogCarregando = true;
    alvo.innerHTML = `<div class="ixc-vazio"><p>Carregando o que está em aberto…</p></div>`;
    try {
        const linhas = typeof buscarOsPendentesCacheado === "function" ? await buscarOsPendentesCacheado() : [];
        agendaBacklogCache = montarBacklog(linhas);
        desenharBacklog(agendaBacklogCache);
    } catch (erro) {
        console.error("Backlog em aberto:", erro);
        alvo.innerHTML = `<div class="ixc-vazio"><p>Não consegui carregar. ${escaparHtml(erro.message || "")}</p></div>`;
    } finally {
        agendaBacklogCarregando = false;
    }
}
