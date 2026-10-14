/**
 * ==========================================================
 * Gestão do COP — OS do COP em aberto (por assunto)
 * ==========================================================
 * O COP (setor 52 no IXC) é o setor principal. As OS dele já vêm no
 * pré-agendamento (os_pendentes), mas o IXC não exporta o setor, só o
 * assunto — e como no IXC cada assunto pertence a um único setor, a OS do
 * COP é identificada pela lista de assuntos (ver carregarAssuntosCop /
 * assuntoEhDoCop). Aqui montamos o retrato das OS do COP em aberto,
 * agrupadas por assunto, reaproveitando a timeline da Agenda IXC.
 */

let copAbertasCache = null;
let copAbertasCarregando = false;

/** Normaliza assunto p/ casar com a lista do COP: sem acento, sem "(14)", minúsculo. */
function copNormAssunto(a) {
    return String(a || "")
        .normalize("NFD").replace(/\p{Diacritic}/gu, "")
        .toLowerCase().replace(/\(\s*\d+\s*\)/g, " ").replace(/\s+/g, " ").trim();
}

/** A OS é do COP? (assunto na lista configurável, ver js/services/setorescop.js) */
function assuntoEhDoCop(assunto) {
    const lista = typeof carregarAssuntosCop === "function" ? carregarAssuntosCop() : [];
    const alvo = new Set(lista.map(copNormAssunto));
    return alvo.has(copNormAssunto(assunto));
}

/** "há 3 dias" / "hoje" a partir de uma data de abertura. */
function copHaDias(data) {
    if (!data) return "—";
    const dias = Math.floor((Date.now() - data.getTime()) / 86400000);
    if (dias <= 0) return "aberta hoje";
    if (dias === 1) return "há 1 dia";
    return `há ${dias} dias`;
}

/** os_pendentes (linhas por evento) -> OS do COP únicas, agrupadas por assunto. */
function montarCopAbertas(linhas) {
    const rows = linhas.map(l => l.dados);
    // a rodada mais recente do robô: o max de capturado_em (NÃO a 1ª linha — as
    // auditorias do COP quase nunca mudam e ficam com um carimbo velho).
    const capturadoEm = linhas.reduce((max, l) => (l.capturado_em && (!max || l.capturado_em > max) ? l.capturado_em : max), null);
    const parseData = typeof ixcDataBR === "function" ? ixcDataBR : (() => null);

    const osMap = new Map();      // id -> OS representativa
    const eventosPorOs = {};      // id -> [{data, evento, status, msg}] (timeline)
    const osInfo = {};            // id -> {cliente, assunto, bairro, cidade}

    for (const r of rows) {
        const id = String(r["ID OS"] || "");
        if (!id || !assuntoEhDoCop(r.ASSUNTO)) continue;

        (eventosPorOs[id] = eventosPorOs[id] || []).push({ data: parseData(r.DATA), evento: r.EVENTO, status: r.STATUS, msg: r.MENSAGEM });
        if (!osInfo[id]) osInfo[id] = { cliente: r.CLIENTE, assunto: r.ASSUNTO, bairro: r.BAIRRO, cidade: r.CIDADE };

        const abertura = parseData(r["DATA/HORA ABERTURA"]);
        if (!osMap.has(id)) osMap.set(id, { id, cliente: r.CLIENTE, assunto: r.ASSUNTO, cidade: r.CIDADE, bairro: r.BAIRRO, abertura, statusUlt: null, statusData: null });
        const o = osMap.get(id);
        if (abertura && (!o.abertura || abertura < o.abertura)) o.abertura = abertura;
        const d = parseData(r.DATA);
        if (d && (!o.statusData || d > o.statusData)) { o.statusData = d; o.statusUlt = r.STATUS; }
    }

    const porAssunto = new Map();
    for (const o of osMap.values()) {
        const chave = o.assunto || "—";
        if (!porAssunto.has(chave)) porAssunto.set(chave, { assunto: chave, oss: [] });
        porAssunto.get(chave).oss.push(o);
    }
    const grupos = [...porAssunto.values()].map(g => ({
        assunto: g.assunto,
        total: g.oss.length,
        maisAntiga: g.oss.reduce((min, o) => (o.abertura && (!min || o.abertura < min)) ? o.abertura : min, null),
        oss: g.oss.sort((a, b) => (a.abertura || 0) - (b.abertura || 0))
    })).sort((a, b) => b.total - a.total);

    return { grupos, total: osMap.size, capturadoEm, eventosPorOs, osInfo };
}

const COP_OS_NO_POPUP = 300;   // teto de OS listadas por assunto (auditorias podem ter milhares)

function copAssuntoCurto(assunto) {
    const s = String(assunto || "").replace(/\s*\(\d+\)/g, "").trim();
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function desenharCopAbertas(model) {
    const alvo = document.getElementById("copAbertasConteudo");
    if (!alvo) return;

    if (!model || !model.total) {
        alvo.innerHTML = `<div class="ixc-vazio"><p>Nenhuma OS do COP em aberto${model && model.capturadoEm ? "" : ", ou a tabela ainda não foi populada pelo robô"}.</p></div>`;
        return;
    }

    const banner = typeof bannerAtualizacaoIxc === "function" ? bannerAtualizacaoIxc(model.capturadoEm) : "";
    const cards = model.grupos.map((g, i) => `
        <button type="button" class="cop-assunto-card" data-cop-assunto="${i}">
            <span class="cop-assunto-nome">${escaparHtml(copAssuntoCurto(g.assunto))}</span>
            <span class="cop-assunto-num">${g.total.toLocaleString("pt-BR")}</span>
            <span class="cop-assunto-sub">mais antiga ${escaparHtml(copHaDias(g.maisAntiga))}</span>
        </button>`).join("");

    alvo.innerHTML = `
        ${banner}
        <div class="cop-resumo">
            <strong>${model.total.toLocaleString("pt-BR")}</strong> OS do COP em aberto ·
            ${model.grupos.length} ${model.grupos.length === 1 ? "assunto" : "assuntos"}
        </div>
        <div class="cop-assuntos">${cards}</div>`;

    alvo.querySelectorAll("[data-cop-assunto]").forEach(botao =>
        botao.addEventListener("click", () => abrirPopupCop(model.grupos[+botao.dataset.copAssunto])));
}

function abrirPopupCop(grupo) {
    fecharPopupCop();
    const lista = grupo.oss.slice(0, COP_OS_NO_POPUP);
    const linhas = lista.map(o => `
        <li class="ixc-os ixc-os-click" data-ixc-os="${escaparHtml(String(o.id))}" data-ixc-fonte="cop" title="Ver a ordem completa">
          <div class="ixc-os-linha">
            <span class="ixc-os-cliente">#${escaparHtml(String(o.id))} · ${escaparHtml(o.cliente || "—")}</span>
            <span class="escala-tag">${escaparHtml(copHaDias(o.abertura))}</span>
          </div>
          <div class="ixc-os-sub">${escaparHtml(o.cidade || "—")}${o.bairro ? " · " + escaparHtml(o.bairro) : ""}${o.statusUlt ? " · " + escaparHtml(o.statusUlt) : ""}</div>
        </li>`).join("");

    const fundo = document.createElement("div");
    fundo.className = "ixc-popup-fundo cop-popup-fundo";
    fundo.innerHTML = `
      <div class="ixc-popup" role="dialog" aria-modal="true" aria-label="${escaparHtml(copAssuntoCurto(grupo.assunto))}">
        <div class="ixc-popup-topo">
          <div>
            <h2>${escaparHtml(copAssuntoCurto(grupo.assunto))} <span class="escala-pilula">${grupo.total.toLocaleString("pt-BR")} OS</span></h2>
            <p>OS do COP em aberto nesse assunto${grupo.total > COP_OS_NO_POPUP ? ` — mostrando as ${COP_OS_NO_POPUP} mais antigas` : ""}</p>
          </div>
          <button type="button" class="ixc-popup-fechar" aria-label="Fechar">✕</button>
        </div>
        <div class="ixc-popup-corpo"><ul class="ixc-lista">${linhas}</ul></div>
      </div>`;
    (document.getElementById("secao-cop-abertas") || document.body).appendChild(fundo);
    document.body.classList.add("ixc-popup-aberto");
    fundo.addEventListener("click", e => { if (e.target === fundo) fecharPopupCop(); });
    fundo.querySelector(".ixc-popup-fechar").addEventListener("click", fecharPopupCop);
    // o clique numa OS (data-ixc-os + data-ixc-fonte="cop") é tratado pelo
    // handler delegado da Agenda IXC, que abre a timeline com o cache do COP.
    fundo.querySelector(".ixc-popup-fechar").focus();
}

function fecharPopupCop() {
    document.querySelector(".cop-popup-fundo")?.remove();
    if (!document.querySelector(".ixc-popup-fundo")) document.body.classList.remove("ixc-popup-aberto");
}

async function renderizarCopAbertas(forcar = false) {
    const alvo = document.getElementById("copAbertasConteudo");
    if (!alvo || copAbertasCarregando) return;
    if (copAbertasCache && !forcar) { desenharCopAbertas(copAbertasCache); return; }

    copAbertasCarregando = true;
    alvo.innerHTML = `<div class="ixc-vazio"><p>Carregando as OS do COP em aberto…</p></div>`;
    try {
        const linhas = typeof buscarOsPendentesCacheado === "function" ? await buscarOsPendentesCacheado() : [];
        copAbertasCache = montarCopAbertas(linhas);
        desenharCopAbertas(copAbertasCache);
    } catch (erro) {
        console.error("COP em aberto:", erro);
        alvo.innerHTML = `<div class="ixc-vazio"><p>Não consegui carregar as OS do COP. ${escaparHtml(erro.message || "")}</p></div>`;
    } finally {
        copAbertasCarregando = false;
    }
}
