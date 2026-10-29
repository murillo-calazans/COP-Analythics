/**
 * ==========================================================
 * Painel de TV (tv.html) — visão de parede, ao vivo
 * ==========================================================
 * Página AUTÔNOMA (fora do app) pra deixar numa TV da operação. Mostra,
 * em tela cheia e letra grande, o retrato do momento:
 *   · Clientes fora (logins ativos offline) e possíveis rompimentos
 *   · Equipes em campo (deslocamento / execução)
 *   · Reagendadas hoje e ordens comerciais em aberto
 *   · Pedidos de prioridade (urgência escrita nas mensagens)
 *   · Ordens em aberto por assunto e por cidade
 *
 * Dados do robô (os_pendentes + clientes_offline). O robô atualiza a
 * os_pendentes de hora em hora e a clientes_offline a cada 30 min, então
 * a TV só rebaixa a os_pendentes quando o `capturado_em` muda (egress
 * baixo — ver memória egress_incremental); a offline (pequena) recarrega
 * a cada ciclo.
 *
 * Reaproveita os motores do app (carregados no tv.html): Motor
 * (assuntoEhDeCampo), PrioridadeEngine (pedido de urgência) e o
 * calcularRompimentos() do rompimentos.js — por isso a TV bate com o
 * chip "Possíveis rompimentos" e com o painel de início.
 *
 * Os helpers abaixo (ixcNorm, ixcDataBR, escaparHtml, hojeMeiaNoite,
 * buscarOsPendentesCacheado…) são GLOBAIS de propósito: o rompimentos.js
 * conta com eles (no app vêm de outros arquivos que a TV não carrega).
 */

// -------- helpers (globais; o rompimentos.js usa estes nomes) --------
function ixcNorm(t) {
    return String(t ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
}

/** "dd/mm/aaaa HH:ii:ss" -> Date (com hora, se houver) ou null. */
function ixcDataBR(s) {
    const m = String(s || "").match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    return m && m[3] !== "0000"
        ? new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0))
        : null;
}

function hojeMeiaNoite() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }

function escaparHtml(texto) {
    return String(texto ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** "SEM CONEXÃO / LOS (14)" -> "Sem conexão / LOS" */
function ixcAssuntoCurto(assunto) {
    const s = String(assunto || "").replace(/\s*\(\d+\)/g, "").trim().toLowerCase();
    return (s.charAt(0).toUpperCase() + s.slice(1)).replace(/\blos\b/g, "LOS");
}

// -------- os_pendentes: leitura + cache por capturado_em --------
// Carrega por keyset (id > último) em páginas de 1000 — simples e sem
// timeout de offset fundo com a RLS.
async function buscarOsPendentes() {
    if (typeof supabaseClient === "undefined") return [];
    const linhas = [];
    let ultimo = -1;
    while (true) {
        const { data, error } = await supabaseClient
            .from("os_pendentes").select("id, dados, capturado_em")
            .gt("id", ultimo).order("id").limit(1000);
        if (error || !data || !data.length) break;
        linhas.push(...data);
        ultimo = data[data.length - 1].id;
        if (data.length < 1000) break;
    }
    return linhas;
}

var _osCache = null;             // Promise das linhas (invalidada quando capturado_em muda)
async function buscarOsPendentesCacheado() {
    if (_osCache) return _osCache;
    _osCache = buscarOsPendentes().catch(e => { _osCache = null; throw e; });
    return _osCache;
}
function invalidarCacheOsPendentes() { _osCache = null; }

// -------- app da TV --------
const TV = (() => {
    const CICLO_MS = 90 * 1000;        // recalcula a cada 90s
    const TETO_LISTA = 7;              // itens mostrados por painel
    const TETO_BARRAS = 9;             // barras por gráfico (assunto/cidade)

    let capturadoOs = null;            // último capturado_em visto (os_pendentes)
    let timer = null, relogioTimer = null;

    const $ = id => document.getElementById(id);
    const fmt = n => Number(n || 0).toLocaleString("pt-BR");
    const horaDe = d => d ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—";

    /** Técnico (equipe de campo) que iniciou o deslocamento — lido do texto do evento. */
    function tecnicoDoDeslocamento(msg) {
        const m = String(msg || "").match(/usu[aá]rio\s+(.+?)\s*,\s*iniciou o deslocamento/i);
        return m ? m[1].trim() : null;
    }
    const ehCampo = assunto => (typeof Motor !== "undefined" && Motor.assuntoEhDeCampo)
        ? Motor.assuntoEhDeCampo(assunto) : true;

    // --- 1 passada na os_pendentes -> OS agregadas por id ---
    function agregarOs(linhas) {
        const os = new Map();
        let capturado = null;
        const hoje = hojeMeiaNoite().getTime();
        const amanha = hoje + 86400000;
        const ehHoje = d => d && d.getTime() >= hoje && d.getTime() < amanha;

        for (const l of linhas) {
            const d = l.dados || {};
            const id = String(d["ID OS"] || "").trim();
            if (!id) continue;
            if (l.capturado_em && (!capturado || l.capturado_em > capturado)) capturado = l.capturado_em;

            let o = os.get(id);
            if (!o) {
                o = {
                    id, cliente: d.CLIENTE, assunto: d.ASSUNTO, cidade: d.CIDADE, bairro: d.BAIRRO,
                    statusData: null, statusUlt: null, agendamento: null, assumida: false,
                    reagHoje: false, eventos: []
                };
                os.set(id, o);
            }
            const dataEv = ixcDataBR(d.DATA);
            o.eventos.push({ data: dataEv, evento: d.EVENTO, status: d.STATUS, msg: d.MENSAGEM });
            if (dataEv && (!o.statusData || dataEv > o.statusData)) {
                o.statusData = dataEv; o.statusUlt = d.STATUS;
                o.assumida = ixcNorm(d.STATUS) === "assumida";
            }
            if (+d.EVENTO === 10 && ehHoje(dataEv)) o.reagHoje = true;
            const ag = ixcDataBR(d.AGENDAMENTO);
            if (ag && (!o.agendamento || ag > o.agendamento)) o.agendamento = ag;
        }
        return { os, capturado };
    }

    // --- equipes em campo agora (deslocamento / execução) ---
    function equipesEmCampo(os) {
        const desloc = new Map(), exec = new Map();   // técnico -> [OS]
        for (const o of os.values()) {
            const st = ixcNorm(o.statusUlt);
            const isDesloc = st === "deslocamento";
            const isExec = st.includes("execu");
            if (!isDesloc && !isExec) continue;
            let tec = null;
            for (const e of o.eventos) if (+e.evento === 2) { const t = tecnicoDoDeslocamento(e.msg); if (t) tec = t; }
            if (!tec) continue;
            const alvo = isDesloc ? desloc : exec;
            if (!alvo.has(tec)) alvo.set(tec, []);
            alvo.get(tec).push(o);
        }
        const lista = mp => [...mp.entries()]
            .map(([nome, oss]) => ({ nome, n: oss.length }))
            .sort((a, b) => b.n - a.n);
        const somaOs = mp => [...mp.values()].reduce((s, a) => s + a.length, 0);
        return { desloc: lista(desloc), exec: lista(exec), osDesloc: somaOs(desloc), osExec: somaOs(exec) };
    }

    // --- pedidos de prioridade (urgência no texto), por situação ---
    function prioridades(os) {
        const itens = [];
        if (typeof PrioridadeEngine === "undefined") return { itens, semAgenda: 0, insistentes: 0 };
        for (const o of os.values()) {
            if (ixcNorm(o.statusUlt) === "finalizada") continue;
            const pedidos = PrioridadeEngine.pedidosDaOS(o.eventos);
            if (!pedidos.length) continue;
            const st = ixcNorm(o.statusUlt);
            let sit;
            if (st === "deslocamento") sit = "Em deslocamento";
            else if (st.includes("execu")) sit = "Em execução";
            else if (o.assumida) sit = "Assumida";
            else if (o.agendamento) sit = "Agendada";
            else sit = "Sem agendamento";
            itens.push({
                id: o.id, cliente: o.cliente, cidade: o.cidade, assunto: o.assunto,
                sit, semAgenda: sit === "Sem agendamento", vezes: pedidos.length,
                trecho: pedidos[pedidos.length - 1].trecho
            });
        }
        itens.sort((a, b) => (b.semAgenda - a.semAgenda) || (b.vezes - a.vezes));
        return {
            itens,
            semAgenda: itens.filter(i => i.semAgenda).length,
            insistentes: itens.filter(i => i.vezes >= 2).length
        };
    }

    // --- contagens por chave (assunto/cidade) ---
    function contarPor(os, chaveFn) {
        const m = new Map();
        for (const o of os.values()) {
            if (ixcNorm(o.statusUlt) === "finalizada") continue;
            const k = chaveFn(o) || "—";
            m.set(k, (m.get(k) || 0) + 1);
        }
        return [...m.entries()].map(([rot, n]) => ({ rot, n })).sort((a, b) => b.n - a.n);
    }

    // ---------------- render ----------------
    const SIT_COR = {
        "Sem agendamento": "#f87171", "Agendada": "#60a5fa", "Assumida": "#c084fc",
        "Em deslocamento": "#38bdf8", "Em execução": "#fbbf24"
    };

    function tile(valor, rotulo, sub, perigo) {
        return `<div class="tv-kpi${perigo ? " perigo" : ""}">
            <div class="tv-kpi-n">${valor}</div>
            <div class="tv-kpi-rot">${escaparHtml(rotulo)}</div>
            ${sub ? `<div class="tv-kpi-sub">${sub}</div>` : ""}
        </div>`;
    }

    function painel(titulo, corpo, extra = "") {
        return `<section class="tv-painel">
            <h2>${escaparHtml(titulo)}${extra ? `<span class="tv-painel-extra">${extra}</span>` : ""}</h2>
            <div class="tv-painel-corpo">${corpo}</div>
        </section>`;
    }

    function listaVazia(txt) { return `<p class="tv-vazio">${escaparHtml(txt)}</p>`; }

    function barras(dados) {
        const top = dados.slice(0, TETO_BARRAS);
        if (!top.length) return listaVazia("Nenhuma OS em aberto.");
        const max = Math.max(1, ...top.map(d => d.n));
        return `<div class="tv-barras">${top.map(d => `
            <div class="tv-barra">
                <span class="tv-barra-rot" title="${escaparHtml(d.rot)}">${escaparHtml(d.rot)}</span>
                <span class="tv-barra-trilho"><i style="width:${(d.n / max * 100).toFixed(1)}%"></i></span>
                <span class="tv-barra-n">${fmt(d.n)}</span>
            </div>`).join("")}</div>`;
    }

    function render(m) {
        const r = m.romp;                       // { clusters, total, totalOffline, temRompimento }
        const eq = m.equipes;
        const pr = m.prio;

        // ---- faixa de KPIs ----
        $("tvKpis").innerHTML = [
            tile(fmt(r.totalOffline), "Clientes fora", "logins ativos offline", r.totalOffline > 0),
            tile(fmt(r.total), "Possíveis rompimentos", r.temRompimento ? "⚠ rompimento de fibra" : "grupos caídos juntos", r.temRompimento),
            tile(fmt(eq.desloc.length), "Em deslocamento", `${fmt(eq.osDesloc)} OS · equipes`, false),
            tile(fmt(eq.exec.length), "Em execução", `${fmt(eq.osExec)} OS · equipes`, false),
            tile(fmt(m.reagendadas.length), "Reagendadas hoje", "técnicos remarcaram", false),
            tile(fmt(m.comerciais.length), "Comerciais em aberto", "clientes PJ", m.comerciais.length > 0),
            tile(fmt(pr.semAgenda), "Prioridade s/ agenda", `${fmt(pr.itens.length)} pedidos no total`, pr.semAgenda > 0)
        ].join("");

        // ---- painel: rompimentos ----
        const ICO = { energia: "⚡", rompimento: "✂️", misto: "⚠️", reset: "↻", outro: "⚠️" };
        const romps = r.clusters.slice(0, TETO_LISTA).map(c => {
            const alvo = c.pon ? `${escaparHtml(c.olt)} · PON ${escaparHtml(c.pon)}` : escaparHtml(c.olt);
            return `<div class="tv-item">
                <span class="tv-item-ico">${ICO[c.cat] || "⚠️"}</span>
                <div class="tv-item-txt">
                    <div class="tv-item-tit">${alvo}</div>
                    <div class="tv-item-sub">${fmt(c.total)} offline${c.semOs ? ` · <b class="danger">${fmt(c.semOs)} sem OS</b>` : " · todas com OS"} · ${escaparHtml(horaDe(c.inicio))}</div>
                </div>
            </div>`;
        }).join("");
        const painelRomp = painel("Possíveis rompimentos",
            r.clusters.length ? romps : listaVazia("Nenhum grupo caído junto agora. 🎉"),
            r.clusters.length > TETO_LISTA ? `+${r.clusters.length - TETO_LISTA}` : "");

        // ---- painel: equipes em campo ----
        const linhaEq = (e) => `<div class="tv-item">
            <div class="tv-item-txt"><div class="tv-item-tit">${escaparHtml(e.nome)}</div></div>
            <span class="tv-pill">${fmt(e.n)} OS</span></div>`;
        const corpoEq = (eq.desloc.length || eq.exec.length) ? `
            ${eq.desloc.length ? `<div class="tv-sub-rot">🚚 Deslocamento</div>${eq.desloc.slice(0, 5).map(linhaEq).join("")}` : ""}
            ${eq.exec.length ? `<div class="tv-sub-rot">🔧 Execução</div>${eq.exec.slice(0, 5).map(linhaEq).join("")}` : ""}
        ` : listaVazia("Nenhuma equipe em campo agora.");
        const painelEq = painel("Equipes em campo", corpoEq);

        // ---- painel: prioridade ----
        const prioItens = pr.itens.slice(0, TETO_LISTA).map(i => `
            <div class="tv-item">
                <div class="tv-item-txt">
                    <div class="tv-item-tit">${escaparHtml(i.cliente || "—")}${i.vezes >= 2 ? ` <span class="tv-mini danger">pediu ${i.vezes}×</span>` : ""}</div>
                    <div class="tv-item-sub">${escaparHtml(i.cidade || "—")} · ${escaparHtml(ixcAssuntoCurto(i.assunto))}</div>
                </div>
                <span class="tv-pill" style="--c:${SIT_COR[i.sit] || "#94a3b8"}">${escaparHtml(i.sit)}</span>
            </div>`).join("");
        const painelPrio = painel("Pedidos de prioridade",
            pr.itens.length ? prioItens : listaVazia("Nenhum pedido de urgência nas mensagens."),
            pr.itens.length > TETO_LISTA ? `+${pr.itens.length - TETO_LISTA}` : "");

        // ---- painel: comerciais ----
        const comItens = m.comerciais.slice(0, TETO_LISTA).map(o => `
            <div class="tv-item">
                <div class="tv-item-txt">
                    <div class="tv-item-tit">#${escaparHtml(o.id)} · ${escaparHtml(o.cliente || "—")}</div>
                    <div class="tv-item-sub">${escaparHtml(o.cidade || "—")} · ${escaparHtml(ixcAssuntoCurto(o.assunto))}</div>
                </div>
                ${o.agendamento ? `<span class="tv-pill">📅 ${escaparHtml(o.agendamento.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }))}</span>` : `<span class="tv-pill" style="--c:#f87171">sem agenda</span>`}
            </div>`).join("");
        const painelCom = painel("Comerciais em aberto",
            m.comerciais.length ? comItens : listaVazia("Nenhuma OS comercial em aberto."),
            m.comerciais.length > TETO_LISTA ? `+${m.comerciais.length - TETO_LISTA}` : "");

        // ---- painéis: por assunto / por cidade ----
        const painelAssunto = painel("Em aberto por assunto", barras(m.porAssunto));
        const painelCidade = painel("Em aberto por cidade", barras(m.porCidade));

        $("tvGrid").innerHTML = painelRomp + painelEq + painelPrio + painelCom + painelAssunto + painelCidade;

        // rodapé: atualização
        $("tvAtualizado").textContent = m.capturado
            ? `dados do robô · importados ${horaDe(new Date(m.capturado))}`
            : "dados do robô";
    }

    // ---------------- ciclo ----------------
    async function checarNovidadeOs() {
        try {
            const { data } = await supabaseClient.from("os_pendentes")
                .select("capturado_em").order("capturado_em", { ascending: false }).limit(1);
            const cap = data && data[0] && data[0].capturado_em;
            if (cap && cap !== capturadoOs) { capturadoOs = cap; invalidarCacheOsPendentes(); }
        } catch (e) { /* silencioso */ }
    }

    async function recalcular() {
        await checarNovidadeOs();                               // invalida o cache se o robô rodou
        const [linhas, romp] = await Promise.all([
            buscarOsPendentesCacheado(),                        // tudo (1x por hora, via cache)
            (typeof calcularRompimentos === "function" ? calcularRompimentos() : Promise.resolve({ clusters: [], total: 0, totalOffline: 0 }))
        ]);
        const { os, capturado } = agregarOs(linhas);

        const reagendadas = [], comerciais = [];
        for (const o of os.values()) {
            if (ixcNorm(o.statusUlt) === "finalizada") continue;
            if (o.reagHoje) reagendadas.push(o);
            if (/comercial/.test(ixcNorm(o.assunto))) comerciais.push(o);
        }
        comerciais.sort((a, b) => (a.cliente || "").localeCompare(b.cliente || "", "pt-BR"));

        return {
            romp, capturado,
            equipes: equipesEmCampo(os),
            prio: prioridades(os),
            reagendadas, comerciais,
            porAssunto: contarPor(os, o => ixcAssuntoCurto(o.assunto)),
            porCidade: contarPor(os, o => (o.cidade || "—"))
        };
    }

    async function tick() {
        try {
            const m = await recalcular();
            render(m);
            $("tvErro").hidden = true;
        } catch (e) {
            console.warn("TV:", e);
            $("tvErro").hidden = false;
            $("tvErro").textContent = "Sem conexão com o banco — tentando de novo…";
        }
    }

    function relogio() {
        const d = new Date();
        $("tvRelogio").textContent = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
        $("tvData").textContent = d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
    }

    function iniciar() {
        $("tvLogin").hidden = true;
        $("tvPainel").hidden = false;
        relogio();
        relogioTimer = setInterval(relogio, 20000);
        tick();
        timer = setInterval(tick, CICLO_MS);
    }

    // ---------------- login (gate) ----------------
    async function entrar(email, senha) {
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password: senha });
        if (error) {
            const msg = error.message?.includes("Invalid login") ? "E-mail ou senha incorretos." : error.message;
            $("tvLoginErro").textContent = msg; $("tvLoginErro").hidden = false;
            return;
        }
        iniciar();
    }

    function telaLogin() {
        $("tvLogin").hidden = false;
        $("tvPainel").hidden = true;
        const form = $("tvLoginForm");
        form.addEventListener("submit", e => {
            e.preventDefault();
            entrar($("tvEmail").value.trim().toLowerCase(), $("tvSenha").value);
        });
        // Olhinho: mostra/oculta a senha (pega autofill/Caps Lock errado).
        $("tvVerSenha")?.addEventListener("click", () => {
            const inp = $("tvSenha");
            inp.type = inp.type === "password" ? "text" : "password";
            inp.focus();
        });
    }

    async function init() {
        // Botões de tela cheia / sair (discretos, no rodapé)
        $("tvFull")?.addEventListener("click", () => {
            if (document.fullscreenElement) document.exitFullscreen();
            else document.documentElement.requestFullscreen?.();
        });
        $("tvSair")?.addEventListener("click", async () => {
            await supabaseClient.auth.signOut();
            clearInterval(timer); clearInterval(relogioTimer);
            location.reload();
        });

        const { data } = await supabaseClient.auth.getSession();
        if (data?.session) iniciar();
        else telaLogin();
    }

    return { init };
})();

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", TV.init);
else TV.init();
