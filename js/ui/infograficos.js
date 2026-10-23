/**
 * ==========================================================
 * Infográficos das abas (cartões no topo de cada seção)
 * ==========================================================
 * Mesmo esquema da tela inicial (js/ui/paineloperacao.js): grade de
 * cartões (3 → 2 → 1 coluna) com anel/rosca, barras, colunas, barra
 * empilhada, quadradinhos (waffle), mini-indicadores e tabela. O conteúdo
 * que já existia em cada aba continua embaixo, intacto.
 *
 * Cada área registra o seu painel em INFOGRAFICOS (arquivos
 * js/ui/info-*.js): registrarInfografico("dashboard", async () => [cartoes]).
 * mostrarSecao (js/ui/navegacao.js) chama renderizarInfografico(nome) depois
 * de desenhar a aba; o container #ig-<secao> é criado logo abaixo do
 * cabeçalho da seção.
 *
 * Cartão: { titulo, sub, cor, icone, selo, span (2|3), blocos: [...] }.
 * Blocos (campo `t`): destaque · linhas · kpis · colunas · empilhada ·
 * waffle · tabela · nota. Item de linha/coluna pode ter `acao: () => …`
 * (clique abre a lista/filtra) — vira um botão.
 */

const IG_CORES = {
    azul: "#2563eb", verde: "#059669", laranja: "#d97706", roxo: "#7c3aed",
    ciano: "#0891b2", vermelho: "#dc2626", cinza: "#94a3b8", rosa: "#db2777",
    trilha: "var(--cor-borda)"
};
const IG_PALETA = ["azul", "verde", "laranja", "roxo", "ciano", "vermelho", "rosa", "cinza"];

const IG_ICONES = {
    lista: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    grafico: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
    pessoa: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
    mapa: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    alerta: '<path d="M12 3 2 21h20L12 3z"/><path d="M12 10v5M12 18h.01"/>',
    ok: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5-6"/>',
    caixa: '<path d="M3 13l3-8h12l3 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M3 13h5l1 3h6l1-3h5"/>',
    calendario: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>',
    caminhao: '<path d="M2 6h11v10H2zM13 10h4l4 3v3h-8"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
    dinheiro: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.01M18 12h.01"/>',
    escudo: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    cadeado: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    robo: '<rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4M8 16h.01M16 16h.01"/>',
    equipe: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    lupa: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>',
    prancheta: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12h6M9 16h4"/>'
};

const IG = {
    cor(c) { return IG_CORES[c] ?? c ?? IG_CORES.azul; },
    fmt(n) { return typeof n === "number" ? n.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : String(n ?? ""); },
    pct(v) { return `${(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: v > 0 && v < 10 ? 1 : 0 })}%`; },
    pctDe(n, total) { return IG.pct(total ? n / total * 100 : 0); },
    real(v) { return `R$ ${(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`; },
    esc(s) { return typeof escaparHtml === "function" ? escaparHtml(String(s ?? "")) : String(s ?? ""); },
    /** Top N de uma contagem: Map/objeto -> [{ rotulo, n }] em ordem decrescente. */
    contar(lista, chave, topo = 8) {
        const m = new Map();
        for (const item of lista) { const k = typeof chave === "function" ? chave(item) : item[chave]; if (k === null || k === undefined || k === "") continue; m.set(k, (m.get(k) ?? 0) + 1); }
        return [...m].map(([rotulo, n]) => ({ rotulo, n })).sort((a, b) => b.n - a.n).slice(0, topo);
    },
    mediana(valores) {
        const v = valores.filter(x => x !== null && x !== undefined && !Number.isNaN(x)).sort((a, b) => a - b);
        if (!v.length) return null;
        const m = Math.floor(v.length / 2);
        return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
    },
    /** "SEM CONEXÃO / LOS (14)" -> "Sem conexão / los" (tira códigos e normaliza caixa). */
    assuntoCurto(a) {
        const s = String(a ?? "—").replace(/\s*\(\d+\)/g, "").trim();
        return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    }
};

// ---------- desenho ----------
let _igAcoes = [];   // funções dos itens clicáveis da última renderização (por container)

function igAcao(fn) {
    if (typeof fn !== "function") return "";
    _igAcoes.push(fn);
    return ` data-ig-acao="${_igAcoes.length - 1}"`;
}

function igRosca(fatias, centro, sub) {
    const cx = 66, cy = 66, r = 50, larg = 14, circ = 2 * Math.PI * r;
    const visiveis = fatias.filter(f => f.n > 0);
    const total = visiveis.reduce((s, f) => s + f.n, 0);
    const vao = visiveis.length > 1 ? 3 : 0;
    let acum = 0;
    const arcos = total ? visiveis.map(f => {
        const comp = f.n / total * circ;
        const a = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${IG.cor(f.cor)}" stroke-width="${larg}" stroke-linecap="${vao ? "butt" : "round"}"
            stroke-dasharray="${Math.max(comp - vao, .01).toFixed(2)} ${circ.toFixed(2)}" stroke-dashoffset="${(-acum).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"><title>${IG.esc(f.rotulo ?? "")}: ${IG.fmt(f.n)}</title></circle>`;
        acum += comp;
        return a;
    }).join("") : "";
    const tam = String(centro).length > 7 ? 16 : String(centro).length > 5 ? 20 : 24;
    return `<svg class="ig-rosca" viewBox="0 0 132 132" role="img" aria-label="${IG.esc(`${centro} ${sub}`)}">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--cor-borda)" stroke-width="${larg}"/>${arcos}
        <text x="${cx}" y="${cy + 2}" text-anchor="middle" class="ig-rosca-num" font-size="${tam}">${IG.esc(centro)}</text>
        <text x="${cx}" y="${cy + 20}" text-anchor="middle" class="ig-rosca-sub">${IG.esc(sub)}</text></svg>`;
}

function igColunas(itens, corPadrao, formato = IG.fmt) {
    if (!itens.length) return '<p class="ig-vazio">Sem dados no recorte.</p>';
    const W = 640, H = 230, mL = 44, mR = 8, mT = 18, mB = 40, pw = W - mL - mR, ph = H - mT - mB;
    const max = Math.max(1, ...itens.map(i => i.n));
    const passo = pw / itens.length, larg = Math.max(6, Math.min(38, passo - 8)), y = v => mT + ph - v / max * ph;
    const grade = Array.from({ length: 5 }, (_, k) => {
        const v = max * k / 4, gy = y(v);
        return `<line x1="${mL}" y1="${gy.toFixed(1)}" x2="${W - mR}" y2="${gy.toFixed(1)}" class="ig-g-grade"/><text x="${mL - 6}" y="${(gy + 3.5).toFixed(1)}" text-anchor="end" class="ig-g-tick">${IG.esc(formato(Math.round(v)))}</text>`;
    }).join("");
    const pulo = Math.ceil(itens.length / 16);
    const cols = itens.map((it, i) => {
        const cx = mL + passo * i + passo / 2, topo = y(it.n);
        return `<g${igAcao(it.acao)} class="${it.acao ? "ig-clicavel" : ""}"><rect x="${(cx - larg / 2).toFixed(1)}" y="${topo.toFixed(1)}" width="${larg.toFixed(1)}" height="${(mT + ph - topo).toFixed(1)}" rx="4" fill="${IG.cor(it.cor ?? corPadrao)}"><title>${IG.esc(it.rotulo)}: ${IG.esc(formato(it.n))}</title></rect>
            ${itens.length <= 16 ? `<text x="${cx.toFixed(1)}" y="${(topo - 5).toFixed(1)}" text-anchor="middle" class="ig-g-val">${IG.esc(formato(it.n))}</text>` : ""}
            ${i % pulo === 0 ? `<text x="${cx.toFixed(1)}" y="${H - mB + 16}" text-anchor="middle" class="ig-g-x">${IG.esc(String(it.rotulo).length > 12 ? String(it.rotulo).slice(0, 11) + "…" : it.rotulo)}</text>` : ""}</g>`;
    }).join("");
    return `<div class="ig-colunas"><svg viewBox="0 0 ${W} ${H}" role="img">${grade}${cols}</svg></div>`;
}

const IG_BLOCOS = {
    destaque: b => `<div class="ig-destaque">${igRosca(b.fatias, b.centro, b.sub)}
        <div class="ig-leitura" style="${b.corValor ? `--cv:${IG.cor(b.corValor)}` : ""}"><strong>${IG.esc(b.valor)}</strong><span>${b.texto ?? ""}</span></div></div>`,
    linhas: b => {
        if (!b.itens.length) return '<p class="ig-vazio">Sem dados no recorte.</p>';
        const max = b.total ?? Math.max(1, ...b.itens.map(i => i.n));
        return `<div class="ig-linhas">${b.itens.map(i => `
            <button type="button" class="ig-linha${i.acao ? "" : " ig-estatica"}"${igAcao(i.acao)} style="--c:${IG.cor(i.cor ?? b.cor)}" title="${IG.esc(i.titulo ?? i.rotulo)}">
                <span class="ig-ponto"></span><span class="ig-rot">${IG.esc(i.rotulo)}</span>
                <span class="ig-val">${b.formato === "real" ? IG.real(i.n) : IG.fmt(i.n)}${i.extra ? `<em>${IG.esc(i.extra)}</em>` : ""}</span>
                <span class="ig-barra"><i style="width:${Math.min(100, max ? i.n / max * 100 : 0).toFixed(1)}%"></i></span>
            </button>`).join("")}</div>`;
    },
    kpis: b => `<div class="ig-kpis">${b.itens.map(k => `
        <${k.acao ? "button type=\"button\"" : "div"} class="ig-kpi${k.acao ? " ig-clicavel" : ""}"${igAcao(k.acao)} style="${k.cor ? `--cv:${IG.cor(k.cor)}` : ""}">
            <small>${IG.esc(k.rotulo)}</small><strong>${IG.esc(k.valor)}</strong>${k.sub ? `<span>${IG.esc(k.sub)}</span>` : ""}
        </${k.acao ? "button" : "div"}>`).join("")}</div>`,
    colunas: b => igColunas(b.itens, b.cor, b.formato === "pct" ? (v => `${v}%`) : b.formato === "min" ? (v => `${v} min`) : IG.fmt),
    empilhada: b => {
        const t = b.grupos.reduce((s, g) => s + g.n, 0) || 1;
        return `<div class="ig-empilhada" role="img">${b.grupos.map(g => `<i style="flex:${g.n || .001};background:${IG.cor(g.cor)}" title="${IG.esc(g.rotulo)}: ${IG.fmt(g.n)}"></i>`).join("")}</div>
            <div class="ig-legenda">${b.grupos.map(g => `<span><i style="background:${IG.cor(g.cor)}"></i>${IG.esc(g.rotulo)} · <b>${IG.pct(g.n / t * 100)}</b></span>`).join("")}</div>`;
    },
    waffle: b => {
        const escala = b.escala || Math.max(1, Math.ceil(b.grupos.reduce((s, g) => s + g.n, 0) / 100));
        return `<div class="ig-waffle" role="img" aria-label="Cada quadrado = ${escala}">${b.grupos.flatMap(g =>
            Array.from({ length: Math.round(g.n / escala) }, () => `<i style="background:${IG.cor(g.cor)}" title="${IG.esc(g.rotulo)}"></i>`)).join("")}</div>`;
    },
    tabela: b => b.linhas.length ? `<div class="ig-tabela"><table><thead><tr>${b.cab.map((h, i) => `<th class="${(b.num ?? []).includes(i) ? "num" : ""}">${IG.esc(h)}</th>`).join("")}</tr></thead>
        <tbody>${b.linhas.map(l => `<tr${igAcao(l.acao)} class="${l.acao ? "ig-clicavel" : ""}">${(l.celulas ?? l).map((v, i) => `<td class="${(b.num ?? []).includes(i) ? "num" : ""}">${v && typeof v === "object" ? `<span class="ig-pill" style="--c:${IG.cor(v.cor)}">${IG.esc(v.txt)}</span>` : IG.esc(IG.fmt(v))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
        : '<p class="ig-vazio">Nada a mostrar no recorte.</p>',
    nota: b => `<p class="ig-nota">${b.html}</p>`
};

function igCartao(c) {
    return `<section class="ig-cartao${c.span ? ` ig-span-${c.span}` : ""}" style="--c:${IG.cor(c.cor)}">
        <div class="ig-cab"><span class="ig-ic"><svg viewBox="0 0 24 24" class="op-svg">${IG_ICONES[c.icone] ?? IG_ICONES.grafico}</svg></span>
            <div><h3>${IG.esc(c.titulo)}</h3>${c.sub ? `<small>${IG.esc(c.sub)}</small>` : ""}</div>${c.selo ? `<span class="ig-selo">${IG.esc(c.selo)}</span>` : ""}</div>
        ${c.blocos.filter(Boolean).map(b => IG_BLOCOS[b.t](b)).join("")}
    </section>`;
}

// ---------- registro e encaixe nas abas ----------
const INFOGRAFICOS = {};
let _igToken = 0;

function registrarInfografico(secoes, fn) {
    for (const s of [].concat(secoes)) INFOGRAFICOS[s] = fn;
}

/** Container #ig-<secao>, criado logo abaixo do cabeçalho da seção (ou no topo dela). */
function containerInfografico(nome) {
    let alvo = document.getElementById(`ig-${nome}`);
    if (alvo) return alvo;
    const secao = document.getElementById(`secao-${nome}`);
    if (!secao) return null;
    alvo = document.createElement("div");
    alvo.id = `ig-${nome}`;
    alvo.className = "ig-painel";
    const cab = secao.querySelector(":scope > .dashboard-cabecalho, :scope > .placeholder-card > .dashboard-cabecalho, :scope > div > .dashboard-cabecalho");
    if (cab) cab.insertAdjacentElement("afterend", alvo);
    else secao.prepend(alvo);
    return alvo;
}

async function renderizarInfografico(nome) {
    const fn = INFOGRAFICOS[nome];
    if (!fn) return;
    const alvo = containerInfografico(nome);
    if (!alvo) return;
    const token = ++_igToken;
    if (!alvo.innerHTML) alvo.innerHTML = '<p class="ig-carregando">Montando os indicadores…</p>';
    let cartoes;
    try {
        cartoes = await fn();
    } catch (erro) {
        console.warn(`Infográfico ${nome}:`, erro);
        if (token === _igToken) alvo.innerHTML = "";
        return;
    }
    if (token !== _igToken) return;   // trocou de aba enquanto calculava
    if (!cartoes || !cartoes.length) { alvo.innerHTML = ""; return; }
    _igAcoes = [];
    alvo.innerHTML = `<div class="ig-grade">${cartoes.map(igCartao).join("")}</div>`;
    const acoes = _igAcoes;
    alvo.querySelectorAll("[data-ig-acao]").forEach(el => el.addEventListener("click", () => acoes[+el.dataset.igAcao]?.()));
}

/** Atalho pros painéis que leem as OS do recorte (Filtro Global): null se não há base carregada. */
function igLinhasDoRecorte() {
    if (!APP?.status?.baseCarregada || !APP.dados?.ordens?.size) return null;
    const ordens = FiltroEngine.ordensFiltradas();
    if (!ordens.size) return null;
    return montarLinhasDetalheOS(ordens);
}
