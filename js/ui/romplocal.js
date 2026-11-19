// "Possíveis rompimentos" sem banco (Rompimentos.html, aberta do disco): o robô
// grava rompimentos-dados.js na mesma pasta a cada ~10 min (logins offline da 551
// + OS em aberto desses logins). O agrupamento e os cartões são os do site
// (js/ui/rompimentos.js); aqui só entram as funções que ele usa e um
// supabaseClient de mentira que lê o arquivo. Temporário, enquanto o Supabase está fora.

const ROMPL_PARADO_MIN = 30;

function ixcNorm(t) { return String(t ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase(); }
function ixcDataBR(s) {
    const m = String(s || "").match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    return m && m[3] !== "0000" ? new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) : null;
}
function escaparHtml(t) {
    return String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

async function buscarOsPendentesCacheado() {
    return (window.ROMP_DADOS?.osLinhas || []).map(d => ({ dados: d }));
}

// nome do cliente: a 551 não traz; usa o das OS em aberto do login, quando houver
function romplNomes() {
    const mapa = new Map();
    for (const d of window.ROMP_DADOS?.osLinhas || []) if (d.LOGIN && d.CLIENTE) mapa.set(d.LOGIN, d.CLIENTE);
    return mapa;
}

const supabaseClient = {
    from(tabela) {
        const st = { tabela, sel: "", de: 0, logins: null };
        const b = {
            select(c) { st.sel = c; return b; }, order() { return b; }, limit() { return b; },
            range(de) { st.de = de; return b; },
            in(_c, v) { st.logins = v; return b; },
            then(ok, erro) {
                const d = window.ROMP_DADOS || { offline: [] };
                let data = [];
                if (st.tabela === "clientes_offline" && st.sel === "sincronizado_em") data = [{ sincronizado_em: d.geradoEm }];
                else if (st.tabela === "clientes_offline") data = st.de > 0 ? [] : d.offline;
                else if (st.tabela === "clientes_cto") { const n = romplNomes(); data = (st.logins || []).filter(l => n.has(l)).map(l => ({ login: l, cliente: n.get(l) })); }
                return Promise.resolve({ data, error: null }).then(ok, erro);
            }
        };
        return b;
    }
};

let romplVersao = null;

function romplRecarregarDados() {
    return new Promise(resolve => {
        const antigo = document.getElementById("rompDados");
        const s = document.createElement("script");
        s.src = "rompimentos-dados.js?t=" + Date.now();
        s.onload = s.onerror = () => { if (antigo) antigo.remove(); s.id = "rompDados"; resolve(); };
        document.head.appendChild(s);
    });
}

async function romplAtualizar(primeira = false) {
    if (!primeira) await romplRecarregarDados();
    const d = window.ROMP_DADOS;
    const aviso = document.getElementById("romplAviso");
    if (!d) { aviso.hidden = false; aviso.textContent = "Ainda não há dados do robô nesta pasta (rompimentos-dados.js)."; return; }
    if (d.versaoPagina && romplVersao && d.versaoPagina !== romplVersao) { location.reload(); return; }
    if (d.versaoPagina) romplVersao = d.versaoPagina;

    rompCache = await calcularRompimentos();
    const cs = rompCache.clusters;
    const conta = cat => cs.filter(c => c.cat === cat).length;
    const semOs = cs.reduce((s, c) => s + c.semOs, 0);
    const clientes = cs.reduce((s, c) => s + c.total, 0);
    document.getElementById("romplKpis").innerHTML = [
        ["✂️", conta("rompimento") + conta("misto"), "Possíveis rompimentos", "k-romp"],
        ["⚡", conta("energia"), "Falta de energia", "k-energia"],
        ["⚠️", conta("outro") + conta("reset"), "Outras quedas em massa", "k-outro"],
        ["👥", clientes, "Clientes nesses grupos", "k-cli"],
        ["🚫", semOs, "Ainda sem OS", "k-semos"],
        ["📶", rompCache.totalOffline, "Logins ativos offline (total)", "k-total"]
    ].map(([ico, n, r, k]) => `<div class="kpi ${k}"><span class="n">${ico} ${Number(n).toLocaleString("pt-BR")}</span><span class="r">${r}</span></div>`).join("");

    preencherPopupRompimentos(document.getElementById("romplCaixa"));

    const gerado = new Date(d.geradoEm);
    const hora = x => x.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    aviso.hidden = (Date.now() - gerado.getTime()) / 60000 <= ROMPL_PARADO_MIN;
    if (!aviso.hidden) aviso.textContent = `O robô não atualiza os dados desde ${hora(gerado)} — mostrando o último retrato.`;
    document.getElementById("romplAtualizado").textContent =
        `logins offline de ${hora(gerado)}${d.fotoEm ? ` · OS em aberto da foto das ${hora(new Date(d.fotoEm))}` : ""}`;
}

function romplTema(t) {
    document.documentElement.dataset.tema = t;
    document.getElementById("romplBtnTema").textContent = t === "dark" ? "☀ Claro" : "🌙 Escuro";
    try { localStorage.setItem("rompl.tema", t); } catch {}
}

document.addEventListener("DOMContentLoaded", () => {
    let t = "dark"; try { t = localStorage.getItem("rompl.tema") || t; } catch {}
    romplTema(t);
    document.getElementById("romplBtnTema").addEventListener("click", () => romplTema(document.documentElement.dataset.tema === "dark" ? "light" : "dark"));
    romplAtualizar(true);
    setInterval(romplAtualizar, 2 * 60 * 1000);
});
