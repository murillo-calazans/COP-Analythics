/**
 * ==========================================================
 * Agendador IA — aba "Em aberto" (backlog de OS de campo)
 * ==========================================================
 * Retrato do que está EM ABERTO no pré-agendamento (os_pendentes), só OS
 * de campo (via Motor.campo — fora COP/infra/faturamento): total em aberto,
 * quantas já estão agendadas, quantas estão há mais de 3 dias em aberto, e a
 * quebra por assunto. Cada número abre a lista; cada OS abre a timeline.
 * "Bairros em aberto": o bairro EXATAMENTE como está na OS, conferido com o
 * histórico de OS da cidade e o mapa de regiões (desenharBairrosBacklog) —
 * aponta bairro em branco, que nunca apareceu, raro na cidade, que é de outra
 * cidade ou escrito diferente do jeito de sempre.
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
                bairroOriginal: osInfo[id]?.bairro ?? o.bairro ?? "",
                agendada: !assumida && !!agDate[id], agendamento: assumida ? null : (agDate[id] || null), abertura,
                antiga: abertura ? abertura.getTime() < limiteAntiga : false,
                reagendamentos: assumida ? 0 : (o.reagendamentos || 0), assumida
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
        const k = assuntoUnificado(i.assunto);
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
        reagendadas: itens.filter(i => i.reagendamentos > 0).length,
        assumidas: itens.filter(i => i.assumida).length
    };
}

function backlogHaDias(data) {
    if (!data) return "—";
    const dias = Math.floor((Date.now() - data.getTime()) / 86400000);
    if (dias <= 0) return "hoje";
    return `há ${dias} ${dias === 1 ? "dia" : "dias"}`;
}

// Junta o assunto "- Terceirizado/a" com o interno: "INSTALAÇÃO NOVO CLIENTE" e
// "INSTALAÇÃO NOVO CLIENTE - TERCEIRIZADO" viram um card só. O sufixo de
// terceira é quem executa (ver [[equipe-pelo-nome-do-tecnico]]), não um tipo de
// OS diferente — pra agenda, interessa o ASSUNTO, não quem faz. Também tira os
// códigos "(70)" pra o mesmo assunto não quebrar por código diferente.
function assuntoUnificado(a) {
    return String(a || "—")
        .replace(/\s*\(\d+\)/g, "")                    // tira os códigos "(70)" etc.
        .replace(/\s*[-–]\s*terceiriza\w*\b/gi, "")    // "- TERCEIRIZADO/A" no fim/meio
        .replace(/\s+terceiriza\w*\b/gi, "")           // "TERCEIRIZADA" solta no texto
        .replace(/\s{2,}/g, " ")
        .trim()
        .toUpperCase() || "—";
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
    { id: "assumidas", rotulo: "Assumidas", filtro: i => i.assumida, cor: "#7c3aed" },
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

    const rec = recorteBacklog(model);   // banner "atualizado em" agora é global (acima das seções)
    const sufixo = backlogCidade ? ` · ${escaparHtml(backlogCidade)}` : "";

    const opcoes = `<option value="">Todas as cidades (${model.total.toLocaleString("pt-BR")})</option>` +
        model.cidades.map(c => `<option value="${escaparHtml(c.cidade)}"${c.cidade === backlogCidade ? " selected" : ""}>${escaparHtml(c.cidade)} (${c.n.toLocaleString("pt-BR")})</option>`).join("");
    const filtroCidade = `
        <div class="backlog-filtro">
            <label for="backlogCidadeSel">Cidade:</label>
            <select id="backlogCidadeSel" class="backlog-cidade-sel">${opcoes}</select>
            ${backlogCidade ? `<button type="button" class="backlog-limpar" id="backlogLimpar" title="Limpar filtro">✕</button>` : ""}
        </div>`;

    const valor = { total: rec.total, agendadas: rec.agendadas, reagendadas: rec.reagendadas, assumidas: rec.assumidas, antigas: rec.antigas };
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
        ${filtroCidade}
        <div class="kpi-row">${kpis}</div>
        <div class="indicadores-secao-titulo">Em aberto por assunto${sufixo}</div>
        <div class="cop-assuntos">${cards}</div>
        <div class="indicadores-secao-titulo">Bairros em aberto${sufixo}</div>
        <div id="backlogBairros"><p class="resumo-filtro">Conferindo os bairros com o mapa de regiões…</p></div>
        ${graficoCidades(model.cidades)}`;

    desenharBairrosBacklog(rec.itens, sufixo);

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

// ---------- Bairros em aberto (nome como está na OS × histórico da cidade) ----------
let backlogMapaIdx = null;          // índice do mapa de regiões (Motor.indiceMapa), carregado 1x
let backlogSoBairrosEstranhos = false;
let backlogHistorico = null;        // { tamanho, porCidade } — cache do histórico de bairros

// Bairro com pelo menos isso de OS no histórico da cidade é "comum".
const BACKLOG_BAIRRO_COMUM = 5;

/** Mesmo mapa de regiões do Mapa de calor (site do mapa logístico; sem ele, a cópia do Agendador). */
async function mapaBairrosBacklog() {
    if (backlogMapaIdx) return backlogMapaIdx;
    if (typeof carregarRegioesMapaCalor === "function") backlogMapaIdx = (await carregarRegioesMapaCalor()).idx;
    return backlogMapaIdx;
}

// Chave pra juntar grafias do mesmo bairro ("Jardim Ouro Preto" = "OURO PRETO", "COSTAZUL" =
// "Costa Azul"): sem acento, sem prefixos que variam, sem pontuação e sem espaço.
function chaveGrafiaBairro(nome) {
    return Motor.norm(nome).replace(/\(.*?\)/g, " ")
        .replace(/(^|\s)(jardim|jd|parque|pq|vila|vl|loteamento|lot|condominio|cond|bairro|residencial)\.?(?=\s|$)/g, " ")
        .replace(/(^|\s)(de|da|do|das|dos)(?=\s|$)/g, " ")
        .replace(/[^a-z0-9]/g, "");
}

/**
 * Histórico de bairros por cidade, das OS já carregadas no COP Analytics
 * (APP.dados.ordens, bairro EXATAMENTE como veio do IXC): cidade -> chave do
 * bairro -> { total, grafias: grafia normalizada -> { nome, n } }.
 */
function historicoBairrosBacklog() {
    const ordens = APP?.dados?.ordens;
    if (!ordens || !ordens.size) return null;
    if (backlogHistorico && backlogHistorico.tamanho === ordens.size) return backlogHistorico.porCidade;
    const porCidade = new Map();
    for (const o of ordens.values()) {
        const nome = String(o.bairroOriginal ?? o.bairro ?? "").trim();
        const chave = chaveGrafiaBairro(nome);
        if (!chave) continue;
        const cidade = Motor.norm(o.cidade);
        if (!porCidade.has(cidade)) porCidade.set(cidade, new Map());
        const bairros = porCidade.get(cidade);
        if (!bairros.has(chave)) bairros.set(chave, { total: 0, grafias: new Map() });
        const b = bairros.get(chave);
        b.total++;
        const g = Motor.norm(nome);
        if (!b.grafias.has(g)) b.grafias.set(g, { nome, n: 0 });
        b.grafias.get(g).n++;
    }
    backlogHistorico = { tamanho: ordens.size, porCidade };
    return porCidade;
}

/**
 * Situação de um bairro (cidade + nome como veio na OS). O que manda é o
 * HISTÓRICO da cidade (o mapa de regiões não tem todos os bairros):
 * comum (≥ BACKLOG_BAIRRO_COMUM OS na cidade, ou achado no mapa da cidade) ·
 * variacao (o bairro é comum, mas escrito diferente) · raro (poucas OS na
 * cidade) · outra-cidade (nunca apareceu na cidade, mas é comum em outra) ·
 * novo (nunca apareceu em lugar nenhum) · branco.
 */
function situacaoBairroBacklog(hist, idx, cidade, bairro) {
    const nome = String(bairro || "").trim();
    if (!nome) return { tipo: "branco" };
    const chave = chaveGrafiaBairro(nome);
    const daCidade = hist?.get(Motor.norm(cidade))?.get(chave);
    const qtd = daCidade?.total ?? 0;
    const loc = idx ? Motor.localizarNoMapa(idx, cidade, nome, null, null) : null;
    const regiao = loc && loc.lat != null && Motor.norm(loc.regiao.cidade) === Motor.norm(cidade) ? loc.regiao.nome : null;

    if (qtd >= BACKLOG_BAIRRO_COMUM || regiao) {
        const maisUsada = daCidade ? [...daCidade.grafias.values()].sort((a, b) => b.n - a.n)[0] : null;
        const minha = daCidade?.grafias.get(Motor.norm(nome))?.n ?? 0;
        if (maisUsada && Motor.norm(maisUsada.nome) !== Motor.norm(nome) && maisUsada.n >= BACKLOG_BAIRRO_COMUM && minha < maisUsada.n / 5) {
            return { tipo: "variacao", qtd, regiao, comoCostuma: maisUsada.nome };
        }
        return { tipo: "comum", qtd, regiao };
    }
    if (qtd > 0) return { tipo: "raro", qtd, regiao };

    let outra = null;
    for (const [c, bairros] of hist ?? []) {
        if (c === Motor.norm(cidade)) continue;
        const b = bairros.get(chave);
        if (b && b.total >= BACKLOG_BAIRRO_COMUM && (!outra || b.total > outra.qtd)) {
            outra = { cidade: c, qtd: b.total };
        }
    }
    if (outra) return { tipo: "outra-cidade", qtd: 0, cidadeOutra: nomeCidadeHistorico(outra.cidade), qtdOutra: outra.qtd };
    return { tipo: "novo", qtd: 0 };
}

/** Grafia "bonita" de uma cidade normalizada, a partir das OS carregadas. */
function nomeCidadeHistorico(cidadeNorm) {
    for (const o of APP?.dados?.ordens?.values?.() ?? []) if (Motor.norm(o.cidade) === cidadeNorm) return o.cidade;
    return cidadeNorm;
}

const SITUACAO_BAIRRO_BACKLOG = {
    branco: { rotulo: "Bairro em branco", estranho: true, ordem: 0 },
    "outra-cidade": { rotulo: "Bairro de outra cidade", estranho: true, ordem: 1 },
    novo: { rotulo: "Nunca apareceu", estranho: true, ordem: 2 },
    raro: { rotulo: "Raro na cidade", estranho: true, ordem: 3 },
    variacao: { rotulo: "Escrito diferente", estranho: true, ordem: 4 },
    comum: { rotulo: "Comum", estranho: false, ordem: 9 }
};

async function desenharBairrosBacklog(itens, sufixo) {
    const alvo = document.getElementById("backlogBairros");
    if (!alvo) return;
    let idx = null;
    try { idx = await mapaBairrosBacklog(); } catch (e) { console.warn("Mapa de regiões:", e); }
    if (!document.body.contains(alvo)) return;   // redesenhou enquanto carregava
    const hist = historicoBairrosBacklog();

    // agrupa por cidade + bairro EXATAMENTE como está na OS
    const grupos = new Map();
    for (const o of itens) {
        const cidade = o.cidade || "—";
        const nome = String(o.bairroOriginal ?? "").trim();
        const chave = `${cidade}|${nome}`;
        if (!grupos.has(chave)) grupos.set(chave, { cidade, nome, oss: [] });
        grupos.get(chave).oss.push(o);
    }
    const lista = [...grupos.values()];
    for (const g of lista) g.situacao = situacaoBairroBacklog(hist, idx, g.cidade, g.nome);

    const estranhos = lista.filter(g => SITUACAO_BAIRRO_BACKLOG[g.situacao.tipo].estranho);
    const visiveis = (backlogSoBairrosEstranhos ? estranhos : lista)
        .sort((a, b) => SITUACAO_BAIRRO_BACKLOG[a.situacao.tipo].ordem - SITUACAO_BAIRRO_BACKLOG[b.situacao.tipo].ordem
            || b.oss.length - a.oss.length || a.cidade.localeCompare(b.cidade, "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR"));
    const osEstranhas = estranhos.reduce((s, g) => s + g.oss.length, 0);

    const detalhe = g => {
        const s = g.situacao;
        const partes = [];
        if (s.tipo === "outra-cidade") partes.push(`comum em <strong>${escaparHtml(s.cidadeOutra)}</strong> (${s.qtdOutra} OS)`);
        else if (s.tipo === "variacao") partes.push(`costuma vir como <strong>${escaparHtml(s.comoCostuma)}</strong>`);
        else if (s.tipo !== "branco" && s.tipo !== "novo") partes.push(`${s.qtd.toLocaleString("pt-BR")} OS no histórico`);
        if (s.regiao) partes.push(`região ${escaparHtml(s.regiao)}`);
        return partes.length ? partes.join(" · ") : '<span class="clientes-cto-vazio">—</span>';
    };
    const linhas = visiveis.map((g, i) => {
        const sit = SITUACAO_BAIRRO_BACKLOG[g.situacao.tipo];
        return `
            <tr class="ixc-os-click" data-bk-bairro="${i}" title="Ver as OS deste bairro">
                <td>${escaparHtml(g.cidade)}</td>
                <td><strong>${g.nome ? escaparHtml(g.nome) : '<span class="clientes-cto-vazio">(em branco)</span>'}</strong></td>
                <td>${g.oss.length.toLocaleString("pt-BR")}</td>
                <td>${detalhe(g)}</td>
                <td>${sit.estranho ? `<span class="ctos-status pendente">⚠ ${sit.rotulo}</span>` : `<span class="ctos-status">${sit.rotulo}</span>`}</td>
            </tr>`;
    }).join("");

    alvo.innerHTML = `
        <div class="backlog-filtro">
            <span class="resumo-filtro">${lista.length.toLocaleString("pt-BR")} bairros com OS em aberto · <strong>${estranhos.length.toLocaleString("pt-BR")} fora do normal</strong> (${osEstranhas.toLocaleString("pt-BR")} OS)${hist ? "" : " — histórico de OS ainda não carregado, conferência só pelo mapa de regiões"}</span>
            <label class="backlog-so-estranhos"><input type="checkbox" id="backlogSoEstranhos"${backlogSoBairrosEstranhos ? " checked" : ""}> Só os fora do normal</label>
        </div>
        ${visiveis.length ? `
        <div class="tabela-scroll">
            <table class="tabela-alertas">
                <thead><tr><th>Cidade</th><th>Bairro (como está na OS)</th><th>OS em aberto</th><th>Histórico / mapa</th><th>Situação</th></tr></thead>
                <tbody>${linhas}</tbody>
            </table>
        </div>` : '<p class="alerta-vazio">Nenhum bairro fora do normal.</p>'}`;

    alvo.querySelector("#backlogSoEstranhos")?.addEventListener("change", e => {
        backlogSoBairrosEstranhos = e.target.checked;
        desenharBairrosBacklog(itens, sufixo);
    });
    alvo.querySelectorAll("[data-bk-bairro]").forEach(tr =>
        tr.addEventListener("click", () => {
            const g = visiveis[+tr.dataset.bkBairro];
            abrirPopupBacklog(`${g.nome || "(bairro em branco)"} · ${g.cidade}`, g.oss);
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
            <div class="ixc-os-sub">${escaparHtml(o.cidade || "—")}${(o.bairroOriginal || o.bairro) ? " · " + escaparHtml(o.bairroOriginal || o.bairro) : ""} · ${escaparHtml(ixcAssuntoCurto ? ixcAssuntoCurto(o.assunto) : (o.assunto || "—"))} ${tagAntiga}</div>
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
