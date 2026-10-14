/**
 * ==========================================================
 * Notificações (sino do cabeçalho)
 * ==========================================================
 * Mostra, SEM precisar clicar (badge com o total), as pendências que o
 * COP precisa agir: OS que os técnicos reagendaram hoje e OS de clientes
 * comerciais (PJ) em aberto. Clicar abre o painel com as listas; clicar
 * numa OS abre a ordem cronológica (reusa a timeline da Agenda IXC).
 *
 * Fonte: a mesma os_pendentes (via buscarOsPendentesCacheado). Comercial
 * é identificado pelo assunto ("… COMERCIAL"); o plano (PJ) não vem no
 * pré-agendamento ainda. Só admin/editor vê o sino (dado operacional).
 */

let notifCache = null;

const NOTIF_CSS = `
.notif-painel{
    position: fixed; z-index: 9990; top: 64px; right: 16px;
    width: 360px; max-width: 92vw; max-height: 72vh; overflow-y: auto;
    background: var(--cor-superficie, #fff); color: var(--cor-texto);
    border: 1px solid var(--cor-borda); border-radius: 14px;
    box-shadow: 0 16px 48px rgba(2,6,23,.25);
    opacity: 0; transform: translateY(-6px); pointer-events: none; transition: opacity .15s, transform .15s;
}
.notif-painel.aberto{ opacity: 1; transform: none; pointer-events: auto; }
.notif-topo{ display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid var(--cor-borda); }
.notif-topo h3{ margin: 0; font-size: 15px; }
.notif-ativar{ border: 1px solid var(--cor-primaria, #2563eb); background: transparent; color: var(--cor-primaria, #2563eb); font-size: 12px; font-weight: 600; padding: 5px 10px; border-radius: 999px; cursor: pointer; }
.notif-ativar:hover{ background: rgba(37,99,235,.08); }
.notif-ativar:disabled{ border-color: var(--cor-borda); color: var(--cor-texto-suave); cursor: default; }
.notif-grupo-titulo{ display: flex; align-items: center; gap: 8px; padding: 12px 16px 6px; font-size: 13px; font-weight: 700; color: var(--cor-texto); }
.notif-grupo-titulo .escala-pilula{ margin-left: auto; }
.notif-vazio{ padding: 22px 16px; text-align: center; color: var(--cor-texto-suave); font-size: 13.5px; }
.notif-lista{ list-style: none; margin: 0; padding: 0 8px; }
.notif-os{ padding: 9px 8px; border-radius: 8px; cursor: pointer; }
.notif-os:hover{ background: var(--cor-fundo-suave, rgba(0,0,0,.04)); }
.notif-os-topo{ display: flex; align-items: center; gap: 8px; }
.notif-os-cliente{ font-size: 13.5px; font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.notif-os-sub{ font-size: 12px; color: var(--cor-texto-suave); margin-top: 1px; }
.notif-vertodas{ width: calc(100% - 16px); margin: 4px 8px 10px; padding: 7px; border: 1px dashed var(--cor-borda); border-radius: 8px; background: transparent; color: var(--cor-primaria, #2563eb); font-size: 12.5px; cursor: pointer; }
.notif-vertodas:hover{ background: var(--cor-fundo-suave, rgba(0,0,0,.04)); }
.notif-rodape{ padding: 10px 16px; border-top: 1px solid var(--cor-borda); font-size: 11.5px; color: var(--cor-texto-suave); }
html[data-tema="dark"] .notif-painel{ background: var(--cor-superficie, #0f172a); }
`;

const NOTIF_GRUPOS = [
    { id: "reagendadas", rotulo: "Reagendadas hoje", icone: "↻", dica: "OS que os técnicos reagendaram hoje" },
    { id: "comerciais",  rotulo: "Comerciais em aberto", icone: "🏢", dica: "OS de clientes comerciais (PJ) ainda em aberto" }
];
const NOTIF_PREVIA = 6;     // OS mostradas por grupo no painel; resto via "ver todas"
const NOTIF_TETO = 300;

async function calcularNotificacoes() {
    const linhas = typeof buscarOsPendentesCacheado === "function" ? await buscarOsPendentesCacheado() : [];
    const parse = typeof ixcDataBR === "function" ? ixcDataBR : () => null;
    const norm = typeof ixcNorm === "function" ? ixcNorm : (t => String(t || "").toLowerCase());

    const hoje = hojeMeiaNoite();
    const amanha = hoje.getTime() + 86400000;
    const ehHoje = d => d && d.getTime() >= hoje.getTime() && d.getTime() < amanha;

    const os = new Map();
    const eventosPorOs = {}, osInfo = {};
    for (const l of linhas) {
        const d = l.dados || {};
        const id = String(d["ID OS"] || "");
        if (!id) continue;
        (eventosPorOs[id] = eventosPorOs[id] || []).push({ data: parse(d.DATA), evento: d.EVENTO, status: d.STATUS, msg: d.MENSAGEM });
        if (!osInfo[id]) osInfo[id] = { cliente: d.CLIENTE, assunto: d.ASSUNTO, bairro: d.BAIRRO, cidade: d.CIDADE };
        if (!os.has(id)) os.set(id, { id, cliente: d.CLIENTE, assunto: d.ASSUNTO, cidade: d.CIDADE, bairro: d.BAIRRO, statusData: null, statusUlt: null, reagHoje: false, abertura: parse(d["DATA/HORA ABERTURA"]) });
        const o = os.get(id);
        const dataEv = parse(d.DATA);
        if (dataEv && (!o.statusData || dataEv > o.statusData)) { o.statusData = dataEv; o.statusUlt = d.STATUS; }
        if (+d.EVENTO === 10 && ehHoje(dataEv)) o.reagHoje = true;
    }

    const reagendadas = [], comerciais = [];
    for (const o of os.values()) {
        if (norm(o.statusUlt) === "finalizada") continue;
        if (o.reagHoje) reagendadas.push(o);
        if (/comercial/.test(norm(o.assunto))) comerciais.push(o);
    }
    reagendadas.sort((a, b) => (b.statusData || 0) - (a.statusData || 0));
    comerciais.sort((a, b) => (a.abertura || 0) - (b.abertura || 0));

    return { reagendadas, comerciais, total: reagendadas.length + comerciais.length, eventosPorOs, osInfo };
}

function notifLinhaOs(o) {
    const assunto = typeof ixcAssuntoCurto === "function" ? ixcAssuntoCurto(o.assunto) : (o.assunto || "—");
    return `
      <li class="notif-os" data-notif-os="${escaparHtml(String(o.id))}" title="Ver a ordem completa">
        <div class="notif-os-topo"><span class="notif-os-cliente">#${escaparHtml(String(o.id))} · ${escaparHtml(o.cliente || "—")}</span></div>
        <div class="notif-os-sub">${escaparHtml(o.cidade || "—")} · ${escaparHtml(assunto)}</div>
      </li>`;
}

function conteudoGrupoNotif(grupo, oss) {
    if (!oss.length) return "";
    const previa = oss.slice(0, NOTIF_PREVIA);
    const resto = oss.length - previa.length;
    return `
      <div class="notif-grupo-titulo">${grupo.icone} ${grupo.rotulo} <span class="escala-pilula">${oss.length.toLocaleString("pt-BR")}</span></div>
      <ul class="notif-lista">${previa.map(notifLinhaOs).join("")}</ul>
      ${resto > 0 ? `<button type="button" class="notif-vertodas" data-notif-vertodas="${grupo.id}">ver todas as ${oss.length.toLocaleString("pt-BR")}</button>` : ""}`;
}

async function renderizarNotificacoes() {
    const botao = document.getElementById("btnNotificacoes");
    if (!botao) return;
    if (typeof podeEditarOperacao === "function" && !podeEditarOperacao()) { botao.hidden = true; return; }
    botao.hidden = false;

    try {
        notifCache = await calcularNotificacoes();
    } catch (e) {
        console.warn("Notificações:", e);
        return;
    }
    const badge = document.getElementById("badgeNotificacoes");
    if (badge) { badge.textContent = notifCache.total > 99 ? "99+" : notifCache.total; badge.hidden = !notifCache.total; }

    avisarNovos(notifCache);   // dispara pop-up do navegador pros itens NOVOS

    const painel = document.getElementById("notifPainel");
    if (painel && painel.classList.contains("aberto")) preencherPainelNotif();
}

// --- Avisos do navegador (Web Notifications) -----------------------------
// Só dispara com o site aberto numa aba. Guardamos o que já foi avisado
// (localStorage) pra não repetir; na 1ª carga tudo entra como "já visto"
// (baseline) pra não soltar uma enxurrada de avisos do que já existia.
const NOTIF_VISTOS_CHAVE = "cop_notif_vistos";

function carregarVistos() { try { return JSON.parse(localStorage.getItem(NOTIF_VISTOS_CHAVE)) || {}; } catch { return {}; } }
function salvarVistos(v) { try { localStorage.setItem(NOTIF_VISTOS_CHAVE, JSON.stringify(v)); } catch {} }

function dispararAviso(titulo, corpo, tag) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    try {
        const n = new Notification(titulo, { body: corpo, tag, icon: "img/logo.png", renotify: true });
        n.onclick = () => { window.focus(); abrirPainelNotif(); n.close(); };
    } catch (e) { /* alguns navegadores exigem service worker; ignora */ }
}

function avisarNovos(cache) {
    const hoje = new Date();
    const diaIso = `${hoje.getFullYear()}-${hoje.getMonth() + 1}-${hoje.getDate()}`;
    const v = carregarVistos();
    if (v.dia !== diaIso) { v.dia = diaIso; v.reag = {}; }   // reagendadas são do dia; zera na virada
    v.reag = v.reag || {}; v.com = v.com || {};

    const novasReag = cache.reagendadas.filter(o => !v.reag[o.id]);
    const novasCom = cache.comerciais.filter(o => !v.com[o.id]);

    const primeiraVez = !v.baselineFeito;
    cache.reagendadas.forEach(o => v.reag[o.id] = 1);
    cache.comerciais.forEach(o => v.com[o.id] = 1);
    v.baselineFeito = true;
    salvarVistos(v);

    if (primeiraVez) return;   // 1ª carga: só marca o baseline, não dispara
    if (!("Notification" in window) || Notification.permission !== "granted") return;

    if (novasReag.length === 1) { const o = novasReag[0]; dispararAviso("OS reagendada", `#${o.id} · ${o.cliente || ""} — confira`, `reag-${o.id}`); }
    else if (novasReag.length > 1) dispararAviso(`${novasReag.length} OS reagendadas`, "Técnicos reagendaram OS — confira no COP", "reag-multi");

    if (novasCom.length === 1) { const o = novasCom[0]; dispararAviso("Ordem comercial em aberto", `#${o.id} · ${o.cliente || ""}`, `com-${o.id}`); }
    else if (novasCom.length > 1) dispararAviso(`${novasCom.length} ordens comerciais em aberto`, "Novas OS comerciais — confira no COP", "com-multi");
}

/** Checagem leve de novidade: só 1 linha (capturado_em mais recente). Se o robô
 *  rodou de novo, invalida o cache e recalcula (aí avisarNovos dispara o pop-up). */
let notifUltimoCap = null;
async function notifChecarNovidade() {
    if (typeof supabaseClient === "undefined") return;
    if (typeof podeEditarOperacao === "function" && !podeEditarOperacao()) return;
    try {
        const { data } = await supabaseClient.from("os_pendentes").select("capturado_em").order("capturado_em", { ascending: false }).limit(1);
        const cap = data && data[0] && data[0].capturado_em;
        if (cap && cap !== notifUltimoCap) {
            notifUltimoCap = cap;
            if (typeof invalidarCacheOsPendentes === "function") invalidarCacheOsPendentes();
            await renderizarNotificacoes();
        }
    } catch (e) { /* silencioso */ }
}

function atualizarBotaoAtivarNotif() {
    const b = document.getElementById("notifAtivar");
    if (!b) return;
    const estado = ("Notification" in window) ? Notification.permission : "unsupported";
    b.hidden = estado === "granted" || estado === "unsupported";
    b.textContent = estado === "denied" ? "Avisos bloqueados no navegador" : "Ativar avisos no navegador";
    b.disabled = estado === "denied";
}

function preencherPainelNotif() {
    const painel = document.getElementById("notifPainel");
    if (!painel || !notifCache) return;
    const corpo = painel.querySelector(".notif-corpo");
    const reag = conteudoGrupoNotif(NOTIF_GRUPOS[0], notifCache.reagendadas);
    const com = conteudoGrupoNotif(NOTIF_GRUPOS[1], notifCache.comerciais);
    corpo.innerHTML = (reag + com) || `<p class="notif-vazio">Nada pendente por aqui. 🎉</p>`;

    corpo.querySelectorAll("[data-notif-os]").forEach(li =>
        li.addEventListener("click", () => { abrirTimelineIxc(li.dataset.notifOs, notifCache); fecharPainelNotif(); }));
    corpo.querySelectorAll("[data-notif-vertodas]").forEach(b =>
        b.addEventListener("click", () => abrirPopupNotif(b.dataset.notifVertodas)));
}

function posicionarPainelNotif() {
    const botao = document.getElementById("btnNotificacoes");
    const painel = document.getElementById("notifPainel");
    if (!botao || !painel) return;
    const r = botao.getBoundingClientRect();
    painel.style.top = `${Math.round(r.bottom + 8)}px`;
    painel.style.right = `${Math.round(window.innerWidth - r.right)}px`;
}

function abrirPainelNotif() {
    let painel = document.getElementById("notifPainel");
    if (!painel) {
        painel = document.createElement("div");
        painel.id = "notifPainel";
        painel.className = "notif-painel";
        painel.innerHTML = `
            <div class="notif-topo"><h3>Notificações</h3><button type="button" class="notif-ativar" id="notifAtivar" hidden>Ativar avisos no navegador</button></div>
            <div class="notif-corpo"></div>
            <div class="notif-rodape">Avisos do navegador com o site aberto · dados do robô (de hora em hora)</div>`;
        document.body.appendChild(painel);
        painel.querySelector("#notifAtivar").addEventListener("click", () => {
            if (!("Notification" in window)) return;
            Notification.requestPermission().then(p => {
                atualizarBotaoAtivarNotif();
                if (p === "granted") dispararAviso("Avisos ativados ✅", "Você será avisado quando houver OS reagendada ou ordem comercial.", "teste");
            });
        });
    }
    atualizarBotaoAtivarNotif();
    preencherPainelNotif();
    posicionarPainelNotif();
    requestAnimationFrame(() => painel.classList.add("aberto"));
    document.getElementById("btnNotificacoes")?.setAttribute("aria-expanded", "true");
}

function fecharPainelNotif() {
    const painel = document.getElementById("notifPainel");
    if (painel) painel.classList.remove("aberto");
    document.getElementById("btnNotificacoes")?.setAttribute("aria-expanded", "false");
}

function alternarPainelNotif() {
    const painel = document.getElementById("notifPainel");
    if (painel && painel.classList.contains("aberto")) fecharPainelNotif();
    else abrirPainelNotif();
}

/** "Ver todas" de um grupo: popup com a lista completa (reusa o estilo do pop-up da Agenda IXC). */
function abrirPopupNotif(grupoId) {
    document.querySelector(".notif-popup-fundo")?.remove();
    const grupo = NOTIF_GRUPOS.find(g => g.id === grupoId);
    const oss = (grupoId === "reagendadas" ? notifCache.reagendadas : notifCache.comerciais).slice(0, NOTIF_TETO);
    const total = (grupoId === "reagendadas" ? notifCache.reagendadas : notifCache.comerciais).length;
    const linhas = oss.map(o => {
        const assunto = typeof ixcAssuntoCurto === "function" ? ixcAssuntoCurto(o.assunto) : (o.assunto || "—");
        return `
          <li class="ixc-os ixc-os-click" data-notif-os="${escaparHtml(String(o.id))}" title="Ver a ordem completa">
            <div class="ixc-os-linha"><span class="ixc-os-cliente">#${escaparHtml(String(o.id))} · ${escaparHtml(o.cliente || "—")}</span></div>
            <div class="ixc-os-sub">${escaparHtml(o.cidade || "—")} · ${escaparHtml(assunto)}</div>
          </li>`;
    }).join("");

    const fundo = document.createElement("div");
    fundo.className = "ixc-popup-fundo notif-popup-fundo";
    fundo.innerHTML = `
      <div class="ixc-popup" role="dialog" aria-modal="true" aria-label="${escaparHtml(grupo.rotulo)}">
        <div class="ixc-popup-topo">
          <div><h2>${grupo.icone} ${escaparHtml(grupo.rotulo)} <span class="escala-pilula">${total.toLocaleString("pt-BR")} OS</span></h2><p>${escaparHtml(grupo.dica)}${total > NOTIF_TETO ? ` — mostrando as ${NOTIF_TETO} primeiras` : ""}</p></div>
          <button type="button" class="ixc-popup-fechar" aria-label="Fechar">✕</button>
        </div>
        <div class="ixc-popup-corpo">${oss.length ? `<ul class="ixc-lista">${linhas}</ul>` : '<p class="alerta-vazio">Nenhuma OS aqui agora.</p>'}</div>
      </div>`;
    document.body.appendChild(fundo);
    document.body.classList.add("ixc-popup-aberto");
    const fechar = () => { fundo.remove(); if (!document.querySelector(".ixc-popup-fundo")) document.body.classList.remove("ixc-popup-aberto"); };
    fundo.addEventListener("click", e => { if (e.target === fundo) fechar(); });
    fundo.querySelector(".ixc-popup-fechar").addEventListener("click", fechar);
    fundo.querySelectorAll("[data-notif-os]").forEach(li =>
        li.addEventListener("click", () => abrirTimelineIxc(li.dataset.notifOs, notifCache)));
    fundo.querySelector(".ixc-popup-fechar").focus();
}

function registrarNotificacoes() {
    if (document.getElementById("notifCssTag")) return;
    const estilo = document.createElement("style");
    estilo.id = "notifCssTag";
    estilo.textContent = NOTIF_CSS;
    document.head.appendChild(estilo);

    const botao = document.getElementById("btnNotificacoes");
    if (botao) {
        botao.setAttribute("aria-haspopup", "true");
        botao.setAttribute("aria-expanded", "false");
        botao.addEventListener("click", e => { e.stopPropagation(); alternarPainelNotif(); });
    }
    // fecha ao clicar fora / Esc / rolar / redimensionar
    document.addEventListener("click", e => {
        const painel = document.getElementById("notifPainel");
        if (painel && painel.classList.contains("aberto") && !painel.contains(e.target) && e.target.closest("#btnNotificacoes") === null) fecharPainelNotif();
    });
    document.addEventListener("keydown", e => { if (e.key === "Escape") fecharPainelNotif(); });
    window.addEventListener("resize", posicionarPainelNotif);

    // Poll leve: de 5 em 5 min vê se o robô trouxe dado novo e, se sim, recalcula
    // (disparando os avisos do navegador pros itens novos).
    setInterval(notifChecarNovidade, 5 * 60 * 1000);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", registrarNotificacoes);
else registrarNotificacoes();
