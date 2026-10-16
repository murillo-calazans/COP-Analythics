/**
 * ==========================================================
 * Mapa de calor das OS (Gestão de Relatórios)
 * ==========================================================
 * Onde estão as ordens de serviço do recorte do Filtro Global (período,
 * assunto, cidade, setor…). Cada OS vai pro mapa por, nesta ordem:
 *   0. a coordenada da própria OS no IXC (ordens.lat/lng, patch-30), se
 *      fizer sentido (não zerada e a menos de 60 km da cidade dela);
 *   1. a CTO do login no IXC (clientes_cto + posição da caixa em ctos,
 *      patch-29) — o ponto mais preciso;
 *   2. o bairro, pelo mapa de regiões do Agendador (mesma busca tolerante
 *      a grafia do Motor.localizarNoMapa);
 *   3. o centro da cidade (média dos bairros dela no mapa).
 * Ao lado, o ranking de regiões e bairros com mais OS; clicar centraliza.
 *
 * Leaflet + leaflet.heat vêm do cdnjs só quando a aba abre. A 1ª pintura
 * usa bairro/cidade (instantâneo) e depois refina com as CTOs.
 */

const MAPA_CALOR_LIBS = {
    css: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css",
    js: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js",
    heat: "https://cdnjs.cloudflare.com/ajax/libs/leaflet.heat/0.2.0/leaflet-heat.js"
};
const URL_MAPA_REGIOES_CALOR = "https://murillo-calazans.github.io/mapa-logistico-cop/mapa-regioes.html";

// Cidades atendidas que não estão no mapa de regiões (sem bairros): centro
// aproximado da cidade, último recurso pra OS não ficar fora do mapa.
const CENTRO_CIDADES_EXTRA = {
    "petropolis": [-22.5050, -43.1787], "teresopolis": [-22.4165, -42.9752],
    "guaratingueta": [-22.8164, -45.1925], "queluz": [-22.5372, -44.7744],
    "lavrinhas": [-22.5700, -44.9025], "cachoeira paulista": [-22.6650, -45.0153],
    "lorena": [-22.7311, -45.1247], "casimiro de abreu": [-22.4806, -42.2042],
    "rio de janeiro": [-22.9068, -43.1729], "niteroi": [-22.8832, -43.1034],
    "sao goncalo": [-22.8268, -43.0634], "itaborai": [-22.7444, -42.8597],
    "marica": [-22.9194, -42.8186], "macae": [-22.3708, -41.7869],
    "araruama": [-22.8729, -42.3431], "sao pedro da aldeia": [-22.8390, -42.1026],
    "armacao dos buzios": [-22.7469, -41.8817], "tangua": [-22.7423, -42.7202]
};

let mapaCalor = null;            // L.Map
let camadaCalor = null;          // L.heatLayer
let mapaCalorRegioes = null;     // { idx, centroRegiao: Map, centroCidade: Map }
let mapaCalorToken = 0;
let mapaCalorPrimeiroEnquadre = true;

function carregarScriptCalor(src) {
    return new Promise((ok, erro) => {
        if (document.querySelector(`script[src="${src}"]`)) return ok();
        const s = document.createElement("script");
        s.src = src; s.onload = ok; s.onerror = () => erro(new Error(`não carregou ${src}`));
        document.head.appendChild(s);
    });
}

async function garantirLibsMapaCalor() {
    if (!document.querySelector(`link[href="${MAPA_CALOR_LIBS.css}"]`)) {
        const l = document.createElement("link");
        l.rel = "stylesheet"; l.href = MAPA_CALOR_LIBS.css;
        document.head.appendChild(l);
    }
    if (typeof L === "undefined") await carregarScriptCalor(MAPA_CALOR_LIBS.js);
    if (typeof L.heatLayer === "undefined") await carregarScriptCalor(MAPA_CALOR_LIBS.heat);
}

/** Mapa de regiões (bairros com coordenada): o do site, senão a cópia do Agendador. */
async function carregarRegioesMapaCalor() {
    if (mapaCalorRegioes) return mapaCalorRegioes;
    let dados = null;
    try {
        const r = await fetch(URL_MAPA_REGIOES_CALOR, { cache: "no-store" });
        if (r.ok) dados = Motor.lerMapaRegioes(await r.text());
    } catch { /* sem o site: usa a cópia */ }
    if (!dados) {
        await carregarScriptCalor("js/agendador/mapa-regioes-dados.js");
        dados = window.MAPA_REGIOES_PADRAO ?? null;
    }
    const idx = Motor.indiceMapa(dados);
    // centro de cada região e de cada cidade = média dos bairros dela
    const soma = new Map();
    const acumular = (chave, it) => {
        const s = soma.get(chave) ?? { lat: 0, lng: 0, n: 0 };
        s.lat += it.lat; s.lng += it.lng; s.n++;
        soma.set(chave, s);
    };
    for (const it of idx?.itens ?? []) {
        acumular(`r:${it.regiao.id}`, it);
        acumular(`c:${Motor.norm(it.regiao.cidade)}`, it);
    }
    const centro = new Map([...soma].map(([k, s]) => [k, { lat: s.lat / s.n, lng: s.lng / s.n }]));
    for (const [cidade, [lat, lng]] of Object.entries(CENTRO_CIDADES_EXTRA)) {
        if (!centro.has(`c:${Motor.norm(cidade)}`)) centro.set(`c:${Motor.norm(cidade)}`, { lat, lng });
    }
    return (mapaCalorRegioes = { idx, centro });
}

/** Coordenada da OS no IXC, se plausível: perto (60 km) da cidade/bairro dela. */
function coordenadaPropriaOs(ordem, loc, centro) {
    const lat = Number(ordem.lat), lng = Number(ordem.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !lat || !lng) return null;
    const ref = (loc?.lat != null ? { lat: loc.lat, lng: loc.lng } : null) ?? centro.get(`c:${Motor.norm(ordem.cidade ?? "")}`);
    if (ref && Motor.distKm(ref, { lat, lng }) > 60) return null;
    return { lat, lng };
}

/** Ponto de cada OS + de onde veio. `posicaoPorLogin` (opcional) = login -> {lat,lng} da CTO. */
function localizarOrdensMapaCalor(ordens, posicaoPorLogin) {
    const { idx, centro } = mapaCalorRegioes;
    const pontos = [];
    const fonte = { os: 0, cto: 0, bairro: 0, cidade: 0, sem: 0 };
    const porRegiao = new Map(), porBairro = new Map();
    const memo = new Map(); // cidade|bairro -> resultado de localizarNoMapa (muitas OS repetem)

    for (const ordem of ordens.values()) {
        const chave = `${ordem.cidade ?? ""}|${ordem.bairro ?? ""}`;
        if (!memo.has(chave)) memo.set(chave, Motor.localizarNoMapa(idx, ordem.cidade, ordem.bairro, null, null));
        const loc = memo.get(chave);

        let p = coordenadaPropriaOs(ordem, loc, centro);
        if (p) fonte.os++;
        else if ((p = posicaoPorLogin?.get(String(ordem.login ?? "").toLowerCase()) ?? null)) fonte.cto++;
        else if (loc?.lat != null) { p = { lat: loc.lat, lng: loc.lng }; fonte.bairro++; }
        else if (loc?.regiao && centro.has(`r:${loc.regiao.id}`)) { p = centro.get(`r:${loc.regiao.id}`); fonte.bairro++; }
        else if (centro.has(`c:${Motor.norm(ordem.cidade ?? "")}`)) { p = centro.get(`c:${Motor.norm(ordem.cidade ?? "")}`); fonte.cidade++; }
        else { fonte.sem++; continue; }
        pontos.push([p.lat, p.lng]);

        if (loc?.regiao) {
            const r = porRegiao.get(loc.regiao.id) ?? { nome: loc.regiao.nome, cidade: loc.regiao.cidade, total: 0, centro: centro.get(`r:${loc.regiao.id}`) };
            r.total++; porRegiao.set(loc.regiao.id, r);
        }
        const nomeBairro = String(ordem.bairro ?? "").trim();
        if (nomeBairro) {
            const kb = `${Motor.norm(ordem.cidade ?? "")}|${Motor.norm(nomeBairro)}`;
            const b = porBairro.get(kb) ?? { nome: nomeBairro, cidade: ordem.cidade ?? "", total: 0, lat: 0, lng: 0 };
            b.total++; b.lat += p.lat; b.lng += p.lng; porBairro.set(kb, b);
        }
    }
    const ranking = m => [...m.values()].sort((a, b) => b.total - a.total);
    return {
        pontos, fonte,
        regioes: ranking(porRegiao),
        bairros: ranking(porBairro).map(b => ({ ...b, centro: { lat: b.lat / b.total, lng: b.lng / b.total } }))
    };
}

async function renderizarMapaCalor() {
    const area = document.getElementById("mapaCalorArea");
    const lado = document.getElementById("mapaCalorRanking");
    const resumo = document.getElementById("mapaCalorResumo");
    if (!area || !lado) return;
    const token = ++mapaCalorToken;

    if (!APP.status.baseCarregada || APP.dados.ordens.size === 0) {
        resumo.textContent = "Importe dados pra ver o mapa.";
        return;
    }

    resumo.textContent = "Carregando o mapa...";
    try {
        await garantirLibsMapaCalor();
        await carregarRegioesMapaCalor();
    } catch (erro) {
        resumo.textContent = `Não deu pra abrir o mapa: ${erro.message}`;
        return;
    }
    if (token !== mapaCalorToken) return;

    if (!mapaCalor) {
        mapaCalor = L.map(area, { zoomControl: true }).setView([-22.5, -42.5], 9);
        L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
            { maxZoom: 16, attribution: "Esri, HERE, Garmin, © OpenStreetMap" }).addTo(mapaCalor);
        L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
            { maxZoom: 16 }).addTo(mapaCalor);
    }
    setTimeout(() => mapaCalor.invalidateSize(), 0); // a seção estava escondida

    const ordens = FiltroEngine.ordensFiltradas();
    desenharMapaCalor(localizarOrdensMapaCalor(ordens, null), ordens.size, false);

    // refino: posição da CTO de cada login (se o cadastro de CTOs existir)
    try {
        const posicao = await posicoesCtoDosLogins([...ordens.values()].map(o => o.login));
        if (token !== mapaCalorToken) return;
        if (!posicao) { document.querySelector(".mapa-calor-refinando")?.remove(); return; }
        desenharMapaCalor(localizarOrdensMapaCalor(ordens, posicao), ordens.size, true);
    } catch (erro) {
        console.warn("Mapa de calor — CTOs:", erro);
        document.querySelector(".mapa-calor-refinando")?.remove();
    }
}

/** login (minúsculo) -> {lat,lng} da CTO dele no IXC; null se o cadastro de CTOs não existe/está vazio. */
async function posicoesCtoDosLogins(logins) {
    if (typeof carregarPosicoesCtos !== "function") return null;
    const posicoes = await carregarPosicoesCtos();
    if (!posicoes?.total) return null;
    await carregarCtoIxcDosLogins(logins);
    const porCto = new Map();
    for (const lista of posicoes.grade.values()) for (const c of lista) porCto.set(String(c.descricao).trim().toUpperCase(), c);
    const resultado = new Map();
    for (const [login, cto] of _ctosIxcPorLogin) {
        const c = cto ? porCto.get(String(cto).trim().toUpperCase()) : null;
        if (c) resultado.set(login, { lat: c.lat, lng: c.lng });
    }
    return resultado;
}

function desenharMapaCalor(r, totalOrdens, refinado) {
    const fmt = n => n.toLocaleString("pt-BR");
    const pct = n => totalOrdens ? `${Math.round(n / totalOrdens * 100)}%` : "0%";

    if (camadaCalor) mapaCalor.removeLayer(camadaCalor);
    // escala relativa ao volume: o vermelho fica pras áreas mais densas do recorte
    // (com max fixo em 1, qualquer bairro com 2 OS já saturava)
    const max = Math.max(1, r.pontos.length / 150);
    camadaCalor = L.heatLayer(r.pontos.map(([a, b]) => [a, b, 1]),
        { radius: 24, blur: 18, maxZoom: 13, max, minOpacity: 0.35,
          gradient: { 0.2: "#2563EB", 0.45: "#22C55E", 0.65: "#FACC15", 0.85: "#F97316", 1: "#DC2626" } }).addTo(mapaCalor);

    if (mapaCalorPrimeiroEnquadre && r.pontos.length) {
        mapaCalor.fitBounds(L.latLngBounds(r.pontos), { padding: [20, 20] });
        mapaCalorPrimeiroEnquadre = false;
    }

    document.getElementById("mapaCalorResumo").innerHTML = `
        <span><b>${fmt(totalOrdens)}</b> OS no filtro</span>
        <span>pela coordenada da OS: <b>${fmt(r.fonte.os)}</b> (${pct(r.fonte.os)})</span>
        <span>pela CTO: <b>${fmt(r.fonte.cto)}</b> (${pct(r.fonte.cto)})</span>
        <span>pelo bairro: <b>${fmt(r.fonte.bairro)}</b> (${pct(r.fonte.bairro)})</span>
        <span>só pela cidade: <b>${fmt(r.fonte.cidade)}</b></span>
        <span>sem local: <b>${fmt(r.fonte.sem)}</b></span>
        ${refinado ? "" : '<span class="mapa-calor-refinando">refinando pela CTO de cada cliente…</span>'}`;

    const item = (x, i) => `
        <li><button type="button" data-lat="${x.centro?.lat ?? ""}" data-lng="${x.centro?.lng ?? ""}">
            <span class="mapa-calor-pos">${i + 1}</span>
            <span class="mapa-calor-nome">${escaparHtml(x.nome)}<small>${escaparHtml(x.cidade ?? "")}</small></span>
            <b>${fmt(x.total)}</b>
        </button></li>`;
    const lado = document.getElementById("mapaCalorRanking");
    lado.innerHTML = `
        <h3>Regiões com mais OS</h3>
        <ol class="mapa-calor-lista">${r.regioes.slice(0, 10).map(item).join("") || '<li class="alerta-vazio">—</li>'}</ol>
        <h3>Bairros com mais OS</h3>
        <ol class="mapa-calor-lista">${r.bairros.slice(0, 15).map(item).join("") || '<li class="alerta-vazio">—</li>'}</ol>`;
    lado.querySelectorAll("button[data-lat]").forEach(b => b.addEventListener("click", () => {
        if (b.dataset.lat) mapaCalor.setView([+b.dataset.lat, +b.dataset.lng], 14);
    }));
}
