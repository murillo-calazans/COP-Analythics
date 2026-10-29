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
    const CICLO_MS = 90 * 1000;        // recalcula os dados a cada 90s
    const ROTACAO_MS = 15 * 1000;      // troca de tela (slide) a cada 15s
    const TETO_BARRAS = 9;             // barras por gráfico (assunto/cidade)

    let capturadoOs = null;            // último capturado_em visto (os_pendentes)
    let timer = null, relogioTimer = null, rotTimer = null;

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

    // Tipos de ordem que o COP NÃO quer ver na TV (trabalho de escritório/logística,
    // não é reparo/instalação de rua): auditoria, exclusão de acesso, pós-terceirizada,
    // retirada, recolhimento. Casado no assunto normalizado (sem acento, minúsculo).
    const TV_EXCLUIR = /auditoria|exclusao de acesso|pos.?terceiriz|retirada|recolhimento/;
    const tvOsAparece = assunto => !TV_EXCLUIR.test(ixcNorm(assunto));

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
    function equipesEmCampo(lista) {
        const desloc = new Map(), exec = new Map();   // técnico -> [OS]
        for (const o of lista) {
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
        const resumo = mp => [...mp.entries()]
            .map(([nome, oss]) => ({ nome, n: oss.length }))
            .sort((a, b) => b.n - a.n);
        const somaOs = mp => [...mp.values()].reduce((s, a) => s + a.length, 0);
        return { desloc: resumo(desloc), exec: resumo(exec), osDesloc: somaOs(desloc), osExec: somaOs(exec) };
    }

    // --- pedidos de prioridade (urgência no texto), por situação ---
    function prioridades(lista) {
        const itens = [];
        if (typeof PrioridadeEngine === "undefined") return { itens, semAgenda: 0, insistentes: 0 };
        for (const o of lista) {
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
    function contarPor(lista, chaveFn) {
        const m = new Map();
        for (const o of lista) {
            const k = chaveFn(o) || "—";
            m.set(k, (m.get(k) || 0) + 1);
        }
        return [...m.entries()].map(([rot, n]) => ({ rot, n })).sort((a, b) => b.n - a.n);
    }

    // ---------------- render ----------------
    const SIT_COR = {
        "Sem agendamento": "#dc2626", "Agendada": "#2563eb", "Assumida": "#7c3aed",
        "Em deslocamento": "#0891b2", "Em execução": "#b7791f"
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

    function barras(dados, cap = TETO_BARRAS) {
        const top = dados.slice(0, cap);
        if (!top.length) return listaVazia("Nenhuma OS em aberto.");
        const max = Math.max(1, ...top.map(d => d.n));
        return `<div class="tv-barras">${top.map(d => `
            <div class="tv-barra">
                <span class="tv-barra-rot" title="${escaparHtml(d.rot)}">${escaparHtml(d.rot)}</span>
                <span class="tv-barra-trilho"><i style="width:${(d.n / max * 100).toFixed(1)}%"></i></span>
                <span class="tv-barra-n">${fmt(d.n)}</span>
            </div>`).join("")}</div>`;
    }

    // ===== telas (slides) em tela cheia, girando sozinhas =====
    const ROMP_ICO = { energia: "⚡", rompimento: "✂️", misto: "⚠️", reset: "↻", outro: "⚠️" };

    /** Rosca/anel em SVG (igual ao infográfico do COP): fatias = [{n,cor}]. */
    function donut(fatias, centro, sub) {
        const cx = 90, cy = 90, r = 68, larg = 22, circ = 2 * Math.PI * r;
        const total = fatias.reduce((s, f) => s + f.n, 0);
        const vao = fatias.filter(f => f.n > 0).length > 1 ? 3 : 0;
        let acum = 0;
        const arcos = total ? fatias.filter(f => f.n > 0).map(f => {
            const comp = f.n / total * circ;
            const a = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${f.cor}" stroke-width="${larg}" stroke-linecap="${vao ? "butt" : "round"}" stroke-dasharray="${Math.max(comp - vao, 0.01).toFixed(2)} ${circ.toFixed(2)}" stroke-dashoffset="${(-acum).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`;
            acum += comp; return a;
        }).join("") : "";
        return `<svg class="tv-donut" viewBox="0 0 180 180" role="img" aria-label="${escaparHtml(centro + " " + sub)}">
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--bg2)" stroke-width="${larg}"/>
            ${arcos}
            <text x="${cx}" y="${cy - 2}" text-anchor="middle" class="tv-donut-n">${escaparHtml(String(centro))}</text>
            <text x="${cx}" y="${cy + 26}" text-anchor="middle" class="tv-donut-s">${escaparHtml(String(sub))}</text>
        </svg>`;
    }

    /** Linha com bolinha colorida + rótulo + valor + barra proporcional (igual ao COP). */
    function barLine(rot, n, max, cor) {
        const w = max ? Math.min(100, n / max * 100) : 0;
        return `<div class="tv-line">
            <span class="tv-line-dot" style="background:${cor}"></span>
            <span class="tv-line-rot">${escaparHtml(rot)}</span>
            <span class="tv-line-val">${fmt(n)}</span>
            <span class="tv-line-bar"><i style="width:${w.toFixed(1)}%;background:${cor}"></i></span>
        </div>`;
    }

    /** Tela 1: Panorama — infográfico estilo COP (rosca de fechamentos + barras coloridas). */
    function slidePanorama(m) {
        const r = m.romp, eq = m.equipes, pr = m.prio;
        const nFe = m.finalizadas.length, nAg = m.agendadasHoje, feitas = Math.min(nFe, nAg);
        const pct = nAg ? Math.round(nFe / nAg * 100) : null;
        const metricas = [
            { rot: "Finalizadas hoje", n: nFe, cor: "#15a06a" },
            { rot: "Agendadas hoje", n: nAg, cor: "#2563eb" },
            { rot: "Em deslocamento", n: eq.desloc.length, cor: "#0891b2" },
            { rot: "Em execução", n: eq.exec.length, cor: "#b7791f" },
            { rot: "Reagendadas hoje", n: m.reagendadas.length, cor: "#7c3aed" },
            { rot: "Comerciais em aberto", n: m.comerciais.length, cor: "#db2777" },
            { rot: "Prioridade s/ agenda", n: pr.semAgenda, cor: "#dc2626" },
            { rot: "Clientes fora", n: r.totalOffline, cor: "#ea580c" },
            { rot: "Possíveis rompimentos", n: r.total, cor: "#e11d48" }
        ];
        const max = Math.max(1, ...metricas.map(x => x.n));
        const rosca = donut(
            [{ n: feitas, cor: "#15a06a" }, { n: Math.max(nAg - feitas, 0), cor: "var(--borda)" }],
            fmt(nFe), nAg ? `de ${fmt(nAg)}` : "fechadas");
        return `<div class="tv-panorama">
            <div class="tv-pan-donut">
                ${rosca}
                <div class="tv-pan-leg"><strong>${pct != null ? pct + "%" : "—"}</strong><span>fechamentos sobre a agenda de hoje</span></div>
            </div>
            <div class="tv-pan-linhas">${metricas.map(x => barLine(x.rot, x.n, max, x.cor)).join("")}</div>
        </div>`;
    }

    /** Tela: finalizadas hoje (OS fechadas no dia). */
    function slideFinalizadas(m) {
        const fin = m.finalizadas;
        if (!fin.length) return `<div class="tv-um"><p class="tv-vazio">Nenhuma OS finalizada hoje ainda.</p></div>`;
        const itens = fin.slice(0, 12).map(o => `
            <div class="tv-item">
                <div class="tv-item-txt">
                    <div class="tv-item-tit">#${escaparHtml(o.id)} · ${escaparHtml(o.cliente || "—")}</div>
                    <div class="tv-item-sub">${escaparHtml(o.cidade || "—")} · ${escaparHtml(ixcAssuntoCurto(o.assunto))}${o.tecnico_responsavel ? " · " + escaparHtml(o.tecnico_responsavel) : ""}</div>
                </div>
                <span class="tv-pill" style="--c:#15a06a">✔ ${o.hora ? escaparHtml(o.hora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })) : ""}</span>
            </div>`).join("");
        return `<div class="tv-um">${itens}</div>`;
    }

    /** Tela 2: possíveis rompimentos — grupo + os logins caídos (cliente · login · OS). */
    function slideRompimentos(m) {
        const r = m.romp;
        if (!r.clusters.length)
            return `<div class="tv-um"><p class="tv-vazio">Nenhum grupo caído junto agora. 🎉<br><small>${fmt(r.totalOffline)} logins ativos offline no total.</small></p></div>`;
        const cards = r.clusters.slice(0, 4).map(c => {
            const alvo = c.pon ? `${escaparHtml(c.olt)} · PON ${escaparHtml(c.pon)}` : escaparHtml(c.olt);
            const membros = c.membros.slice(0, 12).map(mb => {
                const os = mb.os
                    ? (mb.os.agendada && mb.os.agendamento
                        ? `<span class="tv-os-ag">OS ${escaparHtml(mb.os.id)} · 📅 ${escaparHtml(mb.os.agendamento.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }))}</span>`
                        : `<span class="tv-os-nag">OS ${escaparHtml(mb.os.id)} · sem agenda</span>`)
                    : `<span class="tv-os-sem">sem OS</span>`;
                return `<li>
                    <span class="tv-rm-cli">${escaparHtml(mb.cliente || mb.login || "—")}</span>
                    <span class="tv-rm-log">${escaparHtml(mb.login || "")}</span>
                    ${os}</li>`;
            }).join("");
            const resto = c.total > 12 ? `<li class="tv-rm-mais">… e mais ${fmt(c.total - 12)}</li>` : "";
            return `<div class="tv-rm-card">
                <div class="tv-rm-topo">
                    <span class="tv-item-ico">${ROMP_ICO[c.cat] || "⚠️"}</span>
                    <span class="tv-rm-alvo">${alvo}</span>
                    <span class="tv-pill off">${fmt(c.total)} offline</span>
                    ${c.semOs ? `<span class="tv-pill" style="--c:#dc2626">${fmt(c.semOs)} sem OS</span>` : `<span class="tv-pill" style="--c:#15a06a">todas com OS</span>`}
                    <span class="tv-rm-hora">${escaparHtml(horaDe(c.inicio))}</span>
                </div>
                <ul class="tv-rm-lista">${membros}${resto}</ul>
            </div>`;
        }).join("");
        return `<div class="tv-rm-grade">${cards}</div>`;
    }

    /** Tela 3: equipes em campo (deslocamento / execução). */
    function slideEquipes(m) {
        const eq = m.equipes;
        if (!eq.desloc.length && !eq.exec.length)
            return `<div class="tv-um"><p class="tv-vazio">Nenhuma equipe em campo agora.</p></div>`;
        const linha = e => `<div class="tv-item">
            <div class="tv-item-txt"><div class="tv-item-tit">${escaparHtml(e.nome)}</div></div>
            <span class="tv-pill">${fmt(e.n)} OS</span></div>`;
        const col = (ico, rot, arr) => `<div class="tv-col">
            <div class="tv-sub-rot">${ico} ${rot} <b>(${fmt(arr.length)})</b></div>
            ${arr.length ? arr.slice(0, 12).map(linha).join("") : listaVazia("—")}</div>`;
        return `<div class="tv-duas">${col("🚚", "Deslocamento", eq.desloc)}${col("🔧", "Execução", eq.exec)}</div>`;
    }

    /** Tela 4: pedidos de prioridade. */
    function slidePrioridade(m) {
        const pr = m.prio;
        if (!pr.itens.length)
            return `<div class="tv-um"><p class="tv-vazio">Nenhum pedido de urgência nas mensagens das OS.</p></div>`;
        const itens = pr.itens.slice(0, 12).map(i => `
            <div class="tv-item">
                <div class="tv-item-txt">
                    <div class="tv-item-tit">${escaparHtml(i.cliente || "—")}${i.vezes >= 2 ? ` <span class="tv-mini danger">pediu ${i.vezes}×</span>` : ""}</div>
                    <div class="tv-item-sub">${escaparHtml(i.cidade || "—")} · ${escaparHtml(ixcAssuntoCurto(i.assunto))}${i.trecho ? ` — “${escaparHtml(i.trecho.slice(0, 90))}”` : ""}</div>
                </div>
                <span class="tv-pill" style="--c:${SIT_COR[i.sit] || "#94a3b8"}">${escaparHtml(i.sit)}</span>
            </div>`).join("");
        return `<div class="tv-um">${itens}</div>`;
    }

    /** Tela 5: comerciais + reagendadas hoje. */
    function slideComReag(m) {
        const comLinha = o => `<div class="tv-item">
            <div class="tv-item-txt">
                <div class="tv-item-tit">#${escaparHtml(o.id)} · ${escaparHtml(o.cliente || "—")}</div>
                <div class="tv-item-sub">${escaparHtml(o.cidade || "—")} · ${escaparHtml(ixcAssuntoCurto(o.assunto))}</div>
            </div>
            ${o.agendamento ? `<span class="tv-pill">📅 ${escaparHtml(o.agendamento.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }))}</span>` : `<span class="tv-pill" style="--c:#dc2626">sem agenda</span>`}</div>`;
        const col = (rot, arr) => `<div class="tv-col">
            <div class="tv-sub-rot">${rot} <b>(${fmt(arr.length)})</b></div>
            ${arr.length ? arr.slice(0, 12).map(comLinha).join("") : listaVazia("Nada aqui agora.")}</div>`;
        return `<div class="tv-duas">${col("🏢 Comerciais em aberto", m.comerciais)}${col("↻ Reagendadas hoje", m.reagendadas)}</div>`;
    }

    /** Tela "Painel geral": tudo numa tela só (bom pra deixar fixo numa TV). */
    function miniKpiG(n, rot, perigo) {
        return `<div class="tvg-kpi${perigo ? " perigo" : ""}"><div class="n">${n}</div><div class="r">${escaparHtml(rot)}</div></div>`;
    }
    function cardG(titulo, corpo, extra = "") {
        return `<section class="tvg-card"><h3>${titulo}${extra ? `<span class="tvg-ext">${extra}</span>` : ""}</h3><div class="tvg-corpo">${corpo}</div></section>`;
    }
    function slidePainelGeral(m) {
        const r = m.romp, eq = m.equipes, pr = m.prio;
        const kpis = `<div class="tvg-kpis">
            ${miniKpiG(fmt(m.finalizadas.length), "Finalizadas hoje")}
            ${miniKpiG(fmt(r.totalOffline), "Clientes fora", r.totalOffline > 0)}
            ${miniKpiG(fmt(r.total), "Rompimentos", r.temRompimento)}
            ${miniKpiG(fmt(eq.desloc.length), "Deslocamento")}
            ${miniKpiG(fmt(eq.exec.length), "Execução")}
            ${miniKpiG(fmt(m.reagendadas.length), "Reagendadas")}
            ${miniKpiG(fmt(m.comerciais.length), "Comerciais", m.comerciais.length > 0)}
            ${miniKpiG(fmt(pr.semAgenda), "Prioridade s/ ag.", pr.semAgenda > 0)}
        </div>`;

        const romp = r.clusters.length ? r.clusters.slice(0, 5).map(c => {
            const alvo = c.pon ? `${escaparHtml(c.olt)} · PON ${escaparHtml(c.pon)}` : escaparHtml(c.olt);
            return `<div class="tvg-li"><span>${ROMP_ICO[c.cat] || "⚠️"}</span><span class="nome">${alvo}</span><span class="tag">${fmt(c.total)} off${c.semOs ? ` · <b class="danger">${fmt(c.semOs)} s/OS</b>` : ""}</span></div>`;
        }).join("") : listaVazia("Nenhum grupo caído junto. 🎉");

        const eqRows = [];
        eq.desloc.slice(0, 4).forEach(e => eqRows.push(`<div class="tvg-li"><span>🚚</span><span class="nome">${escaparHtml(e.nome)}</span><span class="tag">${fmt(e.n)} OS</span></div>`));
        eq.exec.slice(0, 4).forEach(e => eqRows.push(`<div class="tvg-li"><span>🔧</span><span class="nome">${escaparHtml(e.nome)}</span><span class="tag">${fmt(e.n)} OS</span></div>`));
        const equipes = eqRows.length ? eqRows.join("") : listaVazia("Ninguém em campo agora.");

        const prio = pr.itens.length ? pr.itens.slice(0, 6).map(i =>
            `<div class="tvg-li"><span class="nome">${escaparHtml(i.cliente || "—")}</span><span class="tag" style="color:${SIT_COR[i.sit] || "#5a6b86"}">${escaparHtml(i.sit)}</span></div>`).join("") : listaVazia("Sem pedidos de urgência.");

        const fin = m.finalizadas.length ? m.finalizadas.slice(0, 6).map(o =>
            `<div class="tvg-li"><span class="nome">${escaparHtml(o.cliente || "#" + o.id)}</span><span class="tag" style="color:#15a06a">✔ ${o.hora ? escaparHtml(o.hora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })) : ""}</span></div>`).join("")
            : listaVazia("Nada finalizado ainda hoje.");

        const comReag = `<div class="tvg-li"><span class="nome">🏢 Comerciais em aberto</span><span class="tag">${fmt(m.comerciais.length)}</span></div>
            <div class="tvg-li"><span class="nome">↻ Reagendadas hoje</span><span class="tag">${fmt(m.reagendadas.length)}</span></div>`;

        const grade = `<div class="tvg-grade">
            ${cardG("⚠️ Possíveis rompimentos", romp, r.clusters.length > 5 ? `+${r.clusters.length - 5}` : "")}
            ${cardG("👷 Equipes em campo", equipes)}
            ${cardG("🔴 Pedidos de prioridade", prio, pr.itens.length > 6 ? `+${pr.itens.length - 6}` : "")}
            ${cardG("✅ Finalizadas hoje", fin, m.finalizadas.length > 6 ? `+${m.finalizadas.length - 6}` : "")}
            ${cardG("📋 Em aberto por assunto", barras(m.porAssunto, 6))}
            ${cardG("📍 Em aberto por cidade", barras(m.porCidade, 6))}
            ${cardG("🏢 Comerciais e reagendadas", comReag)}
        </div>`;

        return `<div class="tv-geral">${kpis}${grade}</div>`;
    }

    const SLIDES = [
        { id: "geral", titulo: "Painel geral", html: slidePainelGeral },
        { id: "panorama", titulo: "Panorama da operação", html: slidePanorama },
        { id: "rompimentos", titulo: "Possíveis rompimentos", html: slideRompimentos },
        { id: "equipes", titulo: "Equipes em campo", html: slideEquipes },
        { id: "prioridade", titulo: "Pedidos de prioridade", html: slidePrioridade },
        { id: "finalizadas", titulo: "Finalizadas hoje", html: slideFinalizadas },
        { id: "comerciais", titulo: "Comerciais e reagendadas", html: slideComReag },
        { id: "assunto", titulo: "Em aberto por assunto", html: m => `<div class="tv-um">${barras(m.porAssunto, 12)}</div>` },
        { id: "cidade", titulo: "Em aberto por cidade", html: m => `<div class="tv-um">${barras(m.porCidade, 12)}</div>` }
    ];

    let dados = null, slideIx = 0, pausado = false;

    function montarDots() {
        const box = $("tvDots");
        if (!box) return;
        box.innerHTML = SLIDES.map((s, i) => `<button type="button" class="tv-dot" data-i="${i}" title="${escaparHtml(s.titulo)}"></button>`).join("");
        box.querySelectorAll(".tv-dot").forEach(b => b.addEventListener("click", () => irPara(+b.dataset.i)));
    }

    function pintar() {
        const palco = $("tvPalco");
        if (!palco) return;
        if (!dados) { palco.innerHTML = `<div class="tv-um"><p class="tv-vazio">Carregando…</p></div>`; return; }
        const s = SLIDES[slideIx];
        $("tvSlideTitulo").textContent = s.titulo;
        palco.innerHTML = s.html(dados);
        $("tvDots")?.querySelectorAll(".tv-dot").forEach((d, i) => d.classList.toggle("ativo", i === slideIx));
        $("tvAtualizado").textContent = dados.capturado
            ? `atualizado ${horaDe(new Date(dados.capturado))} · gira sozinho`
            : "dados do robô";
    }

    function irPara(i) {
        slideIx = (i % SLIDES.length + SLIDES.length) % SLIDES.length;
        pintar();
        reiniciarRotacao();
    }
    function reiniciarRotacao() {
        clearInterval(rotTimer);
        rotTimer = setInterval(() => { if (!pausado) irPara(slideIx + 1); }, ROTACAO_MS);
    }

    /** Liga/desliga o giro automático das telas (botão do rodapé e barra de espaço). */
    function alternarGiro() {
        pausado = !pausado;
        atualizarBotaoGiro();
        if (!pausado) reiniciarRotacao();   // retomou: reinicia o relógio do giro
    }
    function atualizarBotaoGiro() {
        const b = $("tvGira");
        if (b) {
            b.textContent = pausado ? "▶ Girar telas" : "⏸ Parar nesta tela";
            b.classList.toggle("parado", pausado);
        }
        const p = $("tvPausa");
        if (p) p.hidden = !pausado;
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

    // Finalizadas HOJE — saem da os_pendentes quando fecham, então vêm da tabela
    // `ordens` (já reconstruída). Filtro no servidor por data_fechamento >= meia-noite
    // de hoje (barato: só os fechamentos do dia, não a tabela toda).
    async function buscarFinalizadasHoje() {
        try {
            const hoje = hojeMeiaNoite().toISOString();
            const { data, error } = await supabaseClient.from("ordens")
                .select("id, cliente, cidade, assunto, data_fechamento, tecnico_responsavel, status_atual")
                .gte("data_fechamento", hoje).limit(3000);
            if (error || !data) return [];
            return data
                .filter(o => ixcNorm(o.status_atual) === "finalizada" && tvOsAparece(o.assunto))
                .map(o => ({ ...o, hora: o.data_fechamento ? new Date(o.data_fechamento) : null }))
                .sort((a, b) => (b.hora || 0) - (a.hora || 0));
        } catch (e) { return []; }
    }

    async function recalcular() {
        await checarNovidadeOs();                               // invalida o cache se o robô rodou
        const [linhas, romp, finalizadas] = await Promise.all([
            buscarOsPendentesCacheado(),                        // tudo (1x por hora, via cache)
            (typeof calcularRompimentos === "function" ? calcularRompimentos() : Promise.resolve({ clusters: [], total: 0, totalOffline: 0 })),
            buscarFinalizadasHoje()
        ]);
        const { os, capturado } = agregarOs(linhas);

        // OS em aberto que a TV mostra: tira finalizadas e os tipos de escritório
        // (auditoria, exclusão de acesso, pós-terceirizada, retirada, recolhimento).
        const visiveis = [...os.values()].filter(o =>
            ixcNorm(o.statusUlt) !== "finalizada" && tvOsAparece(o.assunto));

        const hoje = hojeMeiaNoite().getTime(), amanha = hoje + 86400000;
        const ehHoje = d => d && d.getTime() >= hoje && d.getTime() < amanha;
        let agendadasHoje = 0;
        const reagendadas = [], comerciais = [];
        for (const o of visiveis) {
            if (ehHoje(o.agendamento)) agendadasHoje++;
            if (o.reagHoje) reagendadas.push(o);
            if (/comercial/.test(ixcNorm(o.assunto))) comerciais.push(o);
        }
        reagendadas.sort((a, b) => (b.statusData || 0) - (a.statusData || 0));
        comerciais.sort((a, b) => (a.cliente || "").localeCompare(b.cliente || "", "pt-BR"));

        return {
            romp, capturado, finalizadas, agendadasHoje,
            equipes: equipesEmCampo(visiveis),
            prio: prioridades(visiveis),
            reagendadas, comerciais,
            porAssunto: contarPor(visiveis, o => ixcAssuntoCurto(o.assunto)),
            porCidade: contarPor(visiveis, o => (o.cidade || "—"))
        };
    }

    async function tick() {
        try {
            dados = await recalcular();
            pintar();                              // repinta a tela atual com os dados novos
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
        // Link pode fixar uma TV numa tela: tv.html?tela=geral (ou rompimentos,
        // equipes, prioridade, finalizadas, comerciais, assunto, cidade, panorama),
        // ou tv.html?tela=3. Começa parada nessa tela (a outra TV fica girando).
        const fixo = new URLSearchParams(location.search).get("tela");
        if (fixo) {
            const i = /^\d+$/.test(fixo) ? (+fixo - 1) : SLIDES.findIndex(s => s.id === fixo.toLowerCase());
            if (i >= 0) { slideIx = i; pausado = true; }
        }

        montarDots();
        atualizarBotaoGiro();
        pintar();                 // mostra "Carregando…" até o 1º tick
        reiniciarRotacao();       // começa a girar as telas (respeita `pausado`)
        tick();
        timer = setInterval(tick, CICLO_MS);

        $("tvGira")?.addEventListener("click", alternarGiro);

        // Controles de teclado: ← → troca de tela; espaço gira/para.
        document.addEventListener("keydown", e => {
            if (e.key === "ArrowRight") irPara(slideIx + 1);
            else if (e.key === "ArrowLeft") irPara(slideIx - 1);
            else if (e.key === " ") { e.preventDefault(); alternarGiro(); }
        });
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
