let rompCache = null;

const ROMP_LIMIAR = 4;

const ROMP_JANELA_MIN = 30;

const ROMP_RECENCIA_H = 24;
const ROMP_TETO_MEMBROS = 200;

const rompEhAtivo = s => { const v = String(s || "").trim(); return v === "A" || /^ativo/i.test(v); };

const ROMP_CSS = `
#btnRompimentos{
    display: none; align-items: center; gap: 7px;
    height: 36px; padding: 0 12px; border-radius: 999px;
    border: 1px solid transparent; cursor: pointer;
    font-size: 13px; font-weight: 700; line-height: 1;
    background: #fef3c7; color: #92400e; border-color: #fbbf24;
}
#btnRompimentos.tem-rompimento{ background: #fee2e2; color: #991b1b; border-color: #f87171; }
#btnRompimentos.visivel{ display: inline-flex; }
#btnRompimentos:hover{ filter: brightness(.97); }
#btnRompimentos .romp-chip-ico{ font-size: 15px; line-height: 1; }
#btnRompimentos .romp-chip-n{ background: rgba(0,0,0,.12); padding: 1px 7px; border-radius: 999px; font-size: 12px; }
html[data-tema="dark"] #btnRompimentos{ background: #4a3a12; color: #fde68a; border-color: #a16207; }
html[data-tema="dark"] #btnRompimentos.tem-rompimento{ background: #4c1d1d; color: #fecaca; border-color: #b91c1c; }

.romp-card{ border: 1px solid var(--cor-borda); border-radius: 12px; padding: 12px 14px; margin: 0 0 10px; }
.romp-card-topo{ display: flex; align-items: flex-start; gap: 10px; }
.romp-card-tag{ flex: none; font-size: 20px; line-height: 1.1; }
.romp-card-tit{ font-size: 14.5px; font-weight: 700; min-width: 0; }
.romp-card-sub{ font-size: 12.5px; color: var(--cor-texto-suave); margin-top: 2px; }
.romp-card-nums{ margin-left: auto; text-align: right; flex: none; }
.romp-pill{ display: inline-block; font-size: 12px; font-weight: 700; padding: 2px 9px; border-radius: 999px; }
.romp-pill.off{ background: rgba(0,0,0,.07); color: var(--cor-texto); }
.romp-pill.semos{ background: #fee2e2; color: #991b1b; margin-left: 4px; }
.romp-pill.comos{ background: #dcfce7; color: #166534; margin-left: 4px; }
html[data-tema="dark"] .romp-pill.off{ background: rgba(255,255,255,.1); }
html[data-tema="dark"] .romp-pill.semos{ background:#4c1d1d; color:#fecaca; }
html[data-tema="dark"] .romp-pill.comos{ background:#14321f; color:#bbf7d0; }
.romp-ver{ margin-top: 10px; font-size: 12.5px; color: var(--cor-primaria,#2563eb); background: none; border: none; padding: 0; cursor: pointer; }
.romp-ver:hover{ text-decoration: underline; }
.romp-membros{ list-style: none; margin: 8px 0 0; padding: 0; border-top: 1px dashed var(--cor-borda); }
.romp-membros li{ display: flex; align-items: baseline; gap: 8px; padding: 5px 0; font-size: 13px; border-bottom: 1px solid var(--cor-borda); }
.romp-membros .romp-m-nome{ font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.romp-membros .romp-m-os{ flex: none; display: inline-flex; align-items: baseline; gap: 5px; font-size: 11.5px; white-space: nowrap; }
.romp-membros .romp-m-tag{ margin-left: auto; flex: none; font-size: 11px; color: var(--cor-texto-suave); }
.romp-membros .romp-m-semos{ color: #b91c1c; font-weight: 700; }
.romp-os-id{ font-weight: 700; color: var(--cor-texto); }
.romp-os-ag{ color: #166534; font-weight: 700; }
.romp-os-nag{ color: #b45309; font-weight: 600; }
.romp-os-sem{ color: #b91c1c; font-weight: 700; }
html[data-tema="dark"] .romp-os-ag{ color: #bbf7d0; }
html[data-tema="dark"] .romp-os-nag{ color: #fcd34d; }
html[data-tema="dark"] .romp-os-sem{ color: #fecaca; }
.romp-resumo{ font-size: 13px; color: var(--cor-texto-suave); margin: 0 0 12px; }
`;

function rompCategoriaCausa(causa) {
    const c = ixcNorm(causa);
    if (!c || c === "-") return "outro";
    if (/dying.?gasp|lost.?carrier|power/.test(c)) return "energia";
    if (/(^|[^a-z])(los|lob|lof|loa|lopc|sf)/.test(c)) return "rompimento";
    if (/reset/.test(c)) return "reset";
    return "outro";
}
const ROMP_ROTULO_CAT = {
    energia: { ico: "⚡", nome: "Falta de energia", dica: "ONUs avisaram queda de energia (dying-gasp)" },
    rompimento: { ico: "✂️", nome: "Rompimento de fibra", dica: "perda de sinal óptico (LOS) — fibra/conector" },
    misto: { ico: "⚠️", nome: "Queda em massa", dica: "mix de falta de energia e perda de sinal" },
    reset: { ico: "↻", nome: "Reset em massa", dica: "ONUs reiniciaram juntas" },
    outro: { ico: "⚠️", nome: "Queda em massa", dica: "logins caídos juntos (causa não informada)" }
};

async function buscarClientesOffline() {
    if (typeof supabaseClient === "undefined") return [];
    const linhas = [];
    for (let de = 0; ; de += 1000) {
        const { data, error } = await supabaseClient
            .from("clientes_offline")
            .select("login, cliente, olt, cto, interface_pon, causa, status_acesso, ultima_conexao")
            .order("login").range(de, de + 999);
        if (error || !data || !data.length) break;
        linhas.push(...data);
        if (data.length < 1000) break;
    }
    return linhas;
}

function rompOsEhDeCampo(assunto) {
    if (typeof Motor !== "undefined" && typeof Motor.assuntoEhDeCampo === "function") return Motor.assuntoEhDeCampo(assunto);
    if (typeof assuntoEhDoCop === "function") return !assuntoEhDoCop(assunto);
    return true;
}

async function rompOsPorLogin() {
    const mapa = new Map();
    try {
        const linhas = typeof buscarOsPendentesCacheado === "function" ? await buscarOsPendentesCacheado() : [];
        const porOs = new Map();
        for (const l of linhas) {
            const d = l.dados || {};
            const id = String(d["ID OS"] || "").trim();
            if (!id) continue;
            if (!rompOsEhDeCampo(d.ASSUNTO)) continue;
            const login = ixcNorm(d.LOGIN || "");
            let o = porOs.get(id);
            if (!o) { o = { id, login, agDate: null, assumida: false, ultimaData: null }; porOs.set(id, o); }
            if (login && !o.login) o.login = login;
            const ag = ixcDataBR(d.AGENDAMENTO); if (ag) o.agDate = ag;
            const dt = ixcDataBR(d.DATA);
            if (dt && (!o.ultimaData || dt >= o.ultimaData)) { o.ultimaData = dt; o.assumida = ixcNorm(d.STATUS) === "assumida"; }
        }
        for (const o of porOs.values()) {
            if (!o.login) continue;
            const agendada = !o.assumida && !!o.agDate;
            const info = { id: o.id, agendada, agendamento: o.assumida ? null : o.agDate, quando: o.ultimaData };
            const atual = mapa.get(o.login);

            if (!atual || (info.agendada && !atual.agendada) ||
                (info.agendada === atual.agendada && info.quando && (!atual.quando || info.quando > atual.quando))) {
                mapa.set(o.login, info);
            }
        }
    } catch (e) {  }
    return mapa;
}

async function rompNomesPorLogin(logins) {
    const mapa = new Map();
    if (typeof supabaseClient === "undefined" || !logins.length) return mapa;
    const unicos = [...new Set(logins)];
    for (let i = 0; i < unicos.length; i += 150) {
        const fatia = unicos.slice(i, i + 150);
        try {
            const { data } = await supabaseClient.from("clientes_cto").select("login, cliente").in("login", fatia);
            (data || []).forEach(r => { if (r.login && r.cliente) mapa.set(r.login, r.cliente); });
        } catch (e) {  }
    }
    return mapa;
}

async function calcularRompimentos() {
    const linhas = await buscarClientesOffline();
    if (!linhas.length) return { clusters: [], total: 0, totalOffline: 0 };

    const osPorLogin = await rompOsPorLogin();
    const janelaMs = ROMP_JANELA_MIN * 60000;
    const limiteRecente = Date.now() - ROMP_RECENCIA_H * 3600000;

    const grupos = new Map();
    let ativos = 0;
    for (const r of linhas) {
        if (!rompEhAtivo(r.status_acesso)) continue;
        ativos++;
        const olt = (r.olt || "").trim();
        if (!olt) continue;
        const t = ixcDataBR(r.ultima_conexao);
        if (!t) continue;
        if (t.getTime() < limiteRecente) continue;
        const pon = (r.interface_pon || "").trim();
        const bucket = Math.floor(t.getTime() / janelaMs);
        const chave = `${olt}¦${pon}¦${bucket}`;
        let g = grupos.get(chave);
        if (!g) { g = { olt, pon, membros: [] }; grupos.set(chave, g); }
        const os = osPorLogin.get(ixcNorm(r.login)) || null;
        g.membros.push({
            login: r.login, cliente: r.cliente, cto: r.cto,
            causa: r.causa, cat: rompCategoriaCausa(r.causa),
            quando: t, os, temOs: !!os
        });
    }

    const clusters = [];
    for (const g of grupos.values()) {
        if (g.membros.length < ROMP_LIMIAR) continue;
        const cats = {};
        let semOs = 0, agendadas = 0, minT = Infinity, maxT = -Infinity;
        for (const m of g.membros) {
            cats[m.cat] = (cats[m.cat] || 0) + 1;
            if (!m.temOs) semOs++;
            else if (m.os && m.os.agendada) agendadas++;
            minT = Math.min(minT, m.quando.getTime());
            maxT = Math.max(maxT, m.quando.getTime());
        }
        const rel = (cats.energia || 0) + (cats.rompimento || 0);
        const spreadMin = (maxT - minT) / 60000;

        const simultaneo = spreadMin <= 8 && g.membros.length >= ROMP_LIMIAR;
        if (rel < 2 && !simultaneo) continue;
        let cat;
        if (!rel) cat = "outro";
        else if ((cats.rompimento || 0) && (cats.energia || 0) && Math.min(cats.rompimento, cats.energia) >= rel * 0.25) cat = "misto";
        else cat = (cats.rompimento || 0) >= (cats.energia || 0) ? "rompimento" : "energia";

        const rank = m => !m.temOs ? 0 : (m.os && m.os.agendada ? 2 : 1);
        g.membros.sort((a, b) => (rank(a) - rank(b)) || (a.quando - b.quando));
        clusters.push({
            olt: g.olt, pon: g.pon, cat,
            total: g.membros.length, semOs, agendadas, comOs: g.membros.length - semOs,
            inicio: new Date(minT), fim: new Date(maxT), membros: g.membros
        });
    }

    const peso = { rompimento: 3, misto: 2, energia: 1, reset: 0, outro: 0 };
    clusters.sort((a, b) => (peso[b.cat] - peso[a.cat]) || (b.semOs - a.semOs) || (b.total - a.total));

    const nomes = await rompNomesPorLogin(clusters.flatMap(c => c.membros.map(m => m.login)));
    clusters.forEach(c => c.membros.forEach(m => { if (!m.cliente) m.cliente = nomes.get(m.login) || null; }));

    const temRompimento = clusters.some(c => c.cat === "rompimento" || c.cat === "misto");
    return { clusters, total: clusters.length, totalOffline: ativos, temRompimento };
}

async function renderizarRompimentos() {
    const chip = document.getElementById("btnRompimentos");
    if (!chip) return;
    try { rompCache = await calcularRompimentos(); }
    catch (e) { console.warn("Rompimentos:", e); return; }

    const n = rompCache.total;
    if (!n) { chip.classList.remove("visivel"); return; }
    chip.classList.add("visivel");
    chip.classList.toggle("tem-rompimento", !!rompCache.temRompimento);
    chip.innerHTML =
        `<span class="romp-chip-ico">${rompCache.temRompimento ? "✂️" : "⚡"}</span>` +
        `<span>Possíveis rompimentos</span>` +
        `<span class="romp-chip-n">${n}</span>`;
    chip.title = `${n} grupo(s) de clientes caídos juntos — clique para ver`;

    const fundo = document.querySelector(".romp-popup-fundo");
    if (fundo) preencherPopupRompimentos(fundo);
}

function rompHora(d) {
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function rompJanelaTexto(c) {
    const ini = rompHora(c.inicio), fim = rompHora(c.fim);
    const dia = c.inicio.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    return ini === fim ? `${dia} ${ini}` : `${dia} ${ini}–${fim}`;
}

function rompOsBadge(m) {
    if (!m.os) return '<span class="romp-os-sem">sem OS</span>';
    const dt = m.os.agendamento;
    const sel = m.os.agendada && dt
        ? `<span class="romp-os-ag">📅 ${dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>`
        : '<span class="romp-os-nag">sem agenda</span>';
    return `<span class="romp-os-id">OS ${escaparHtml(m.os.id)}</span> ${sel}`;
}

function rompCardHtml(c, i) {
    const rot = ROMP_ROTULO_CAT[c.cat] || ROMP_ROTULO_CAT.outro;
    const alvo = c.pon ? `${escaparHtml(c.olt)} · PON ${escaparHtml(c.pon)}` : escaparHtml(c.olt);
    const membros = c.membros.slice(0, ROMP_TETO_MEMBROS).map(m => `
        <li>
          <span class="romp-m-nome">${escaparHtml(m.cliente || m.login || "—")}</span>
          <span class="romp-m-os">${rompOsBadge(m)}</span>
          <span class="romp-m-tag">${escaparHtml(m.login || "")}${m.cto ? " · " + escaparHtml(m.cto) : ""} · ${rompHora(m.quando)}</span>
        </li>`).join("");
    const resumoVer = [c.semOs ? `${c.semOs} sem OS` : "", c.agendadas ? `${c.agendadas} agendada(s)` : ""].filter(Boolean).join(" · ");
    return `
      <div class="romp-card">
        <div class="romp-card-topo">
          <span class="romp-card-tag">${rot.ico}</span>
          <div style="min-width:0">
            <div class="romp-card-tit">${rot.nome} — ${alvo}</div>
            <div class="romp-card-sub">${escaparHtml(rot.dica)} · caíram ${escaparHtml(rompJanelaTexto(c))}</div>
          </div>
          <div class="romp-card-nums">
            <span class="romp-pill off">${c.total} offline</span>
            ${c.semOs ? `<span class="romp-pill semos">${c.semOs} sem OS</span>` : `<span class="romp-pill comos">todas com OS</span>`}
          </div>
        </div>
        <button type="button" class="romp-ver" data-romp-ver="${i}">ver os ${c.total} clientes ${resumoVer ? `(${resumoVer})` : ""} ▾</button>
        <ul class="romp-membros" id="rompMembros${i}" hidden>${membros}${c.total > ROMP_TETO_MEMBROS ? `<li><span class="romp-m-tag">… e mais ${c.total - ROMP_TETO_MEMBROS}</span></li>` : ""}</ul>
      </div>`;
}

function preencherPopupRompimentos(fundo) {
    const corpo = fundo.querySelector(".ixc-popup-corpo");
    if (!corpo || !rompCache) return;
    const cs = rompCache.clusters;
    if (!cs.length) { corpo.innerHTML = '<p class="alerta-vazio">Nenhum grupo caído junto agora. 🎉</p>'; return; }
    const semOsTotal = cs.reduce((s, c) => s + c.semOs, 0);
    corpo.innerHTML =
        `<p class="romp-resumo">${cs.length} grupo(s) com clientes que caíram juntos · ${rompCache.totalOffline.toLocaleString("pt-BR")} logins ativos offline no total${semOsTotal ? ` · <strong>${semOsTotal} ainda sem OS</strong>` : ""}</p>` +
        cs.map(rompCardHtml).join("");
    corpo.querySelectorAll("[data-romp-ver]").forEach(b => b.addEventListener("click", () => {
        const ul = corpo.querySelector("#rompMembros" + b.dataset.rompVer);
        if (ul) { ul.hidden = !ul.hidden; b.textContent = b.textContent.replace(ul.hidden ? "▴" : "▾", ul.hidden ? "▾" : "▴"); }
    }));
}

function abrirPopupRompimentos() {
    document.querySelector(".romp-popup-fundo")?.remove();
    const fundo = document.createElement("div");
    fundo.className = "ixc-popup-fundo romp-popup-fundo";
    fundo.innerHTML = `
      <div class="ixc-popup" role="dialog" aria-modal="true" aria-label="Possíveis rompimentos">
        <div class="ixc-popup-topo">
          <div><h2>⚠️ Possíveis rompimentos</h2><p>Clientes que caíram juntos (mesma OLT/PON, mesma hora) — provável rompimento ou falta de energia</p></div>
          <button type="button" class="ixc-popup-fechar" aria-label="Fechar">✕</button>
        </div>
        <div class="ixc-popup-corpo"></div>
      </div>`;
    document.body.appendChild(fundo);
    document.body.classList.add("ixc-popup-aberto");
    preencherPopupRompimentos(fundo);
    const fechar = () => { fundo.remove(); if (!document.querySelector(".ixc-popup-fundo")) document.body.classList.remove("ixc-popup-aberto"); };
    fundo.addEventListener("click", e => { if (e.target === fundo) fechar(); });
    fundo.querySelector(".ixc-popup-fechar").addEventListener("click", fechar);
    document.addEventListener("keydown", function esc(e) { if (e.key === "Escape") { fechar(); document.removeEventListener("keydown", esc); } });
    fundo.querySelector(".ixc-popup-fechar").focus();
}

let rompUltimoSync = null;
async function rompChecarNovidade() {
    if (typeof supabaseClient === "undefined") return;
    try {
        const { data } = await supabaseClient.from("clientes_offline").select("sincronizado_em").order("sincronizado_em", { ascending: false }).limit(1);
        const s = data && data[0] && data[0].sincronizado_em;
        if (s && s !== rompUltimoSync) { rompUltimoSync = s; await renderizarRompimentos(); }
    } catch (e) {  }
}

function registrarRompimentos() {
    if (document.getElementById("rompCssTag")) return;
    const estilo = document.createElement("style");
    estilo.id = "rompCssTag";
    estilo.textContent = ROMP_CSS;
    document.head.appendChild(estilo);

    const chip = document.getElementById("btnRompimentos");
    if (chip) chip.addEventListener("click", e => { e.stopPropagation(); abrirPopupRompimentos(); });

    setInterval(rompChecarNovidade, 5 * 60 * 1000);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", registrarRompimentos);
else registrarRompimentos();
