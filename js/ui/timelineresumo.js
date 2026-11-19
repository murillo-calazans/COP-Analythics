// "Resumo do dia" — primeira tela do giro da timeline na TV (timeline.html e a
// versão local). Tudo sai do tlDados já montado pela timeline: cada OS conta
// pela situação da sua visita mais recente.

const TLR_CSS = `
#tltvResumo{ --r-fin:#15803d; --r-and:#2563eb; --r-interr:#db2777; --r-over:#b45309; --r-prev:#94a3b8; --r-trilho:#e8edf5; }
html[data-tema="dark"] #tltvResumo{ --r-fin:#0ea371; --r-and:#3b82f6; --r-interr:#ec4899; --r-over:#d97706; --r-prev:#64748b; --r-trilho:#1a2740; }
#tltvResumo{ flex:1; min-height:0; display:flex; flex-direction:column; gap:14px; }
.tlr-kpis{ display:grid; grid-template-columns:repeat(6,1fr); gap:12px; }
.tlr-kpi{ background:var(--cor-superficie); border:1px solid var(--cor-borda); border-radius:14px; padding:14px 18px; position:relative; overflow:hidden; }
.tlr-kpi::before{ content:""; position:absolute; left:0; top:0; bottom:0; width:5px; background:var(--k,var(--cor-borda)); }
.tlr-kpi .n{ font-size:46px; font-weight:800; line-height:1; font-variant-numeric:tabular-nums; }
.tlr-kpi .r{ font-size:15px; font-weight:700; margin-top:8px; }
.tlr-kpi .s{ font-size:13px; color:var(--cor-texto-suave); margin-top:3px; min-height:1.2em; }
.tlr-card{ background:var(--cor-superficie); border:1px solid var(--cor-borda); border-radius:14px; padding:14px 18px; min-width:0; min-height:0; display:flex; flex-direction:column; }
.tlr-card h3{ margin:0 0 10px; font-size:15px; font-weight:800; display:flex; align-items:baseline; gap:8px; }
.tlr-card h3 small{ font-size:12.5px; font-weight:600; color:var(--cor-texto-suave); }
.tlr-legenda{ display:flex; flex-wrap:wrap; gap:6px 16px; font-size:13px; color:var(--cor-texto-suave); margin-bottom:10px; }
.tlr-legenda span{ display:inline-flex; align-items:center; gap:6px; }
.tlr-sw{ width:12px; height:12px; border-radius:3px; background:var(--c); flex:none; }
.tlr-sw.prev, .tlr-seg.prev{ background:repeating-linear-gradient(45deg,var(--r-prev) 0 2px,transparent 2px 6px); box-shadow:inset 0 0 0 1px var(--r-prev); }
.tlr-pilha{ display:flex; gap:2px; height:44px; border-radius:6px; overflow:hidden; background:var(--r-trilho); }
.tlr-seg{ background:var(--c); min-width:3px; display:flex; align-items:center; justify-content:center; color:#fff; font-weight:800; font-size:16px; white-space:nowrap; overflow:hidden; }
html[data-tema="dark"] .tlr-seg{ color:#0b1424; }
.tlr-seg.prev{ color:var(--cor-texto); }
.tlr-seg.prev span{ background:var(--cor-superficie); padding:2px 9px; border-radius:6px; }
.tlr-grade{ flex:1; min-height:0; display:grid; grid-template-columns:0.8fr 1.2fr 1.2fr 1.2fr; gap:14px; }
.tlr-hero{ font-size:64px; font-weight:800; line-height:1; font-variant-numeric:tabular-nums; }
.tlr-hero-sub{ font-size:14px; color:var(--cor-texto-suave); margin:6px 0 16px; }
.tlr-par{ display:flex; gap:2px; height:22px; border-radius:6px; overflow:hidden; background:var(--r-trilho); margin-bottom:10px; }
.tlr-linha{ display:flex; justify-content:space-between; font-size:15px; padding:5px 0; border-bottom:1px solid var(--cor-borda); }
.tlr-linha:last-child{ border-bottom:none; }
.tlr-linha b{ font-variant-numeric:tabular-nums; }
.tlr-colunas{ flex:1; min-height:120px; display:flex; align-items:flex-end; gap:6px; padding-top:22px; border-bottom:1px solid var(--cor-borda); }
.tlr-col{ flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%; position:relative; }
.tlr-col i{ display:block; width:100%; max-width:34px; background:var(--r-fin); border-radius:4px 4px 0 0; min-height:2px; }
.tlr-col .v{ font-size:12.5px; font-weight:700; margin-bottom:4px; font-variant-numeric:tabular-nums; }
.tlr-eixo{ display:flex; gap:6px; margin-top:5px; }
.tlr-eixo span{ flex:1; text-align:center; font-size:12px; color:var(--cor-texto-suave); }
.tlr-eixo span.agora{ color:var(--cor-texto); font-weight:800; }
.tlr-barras{ display:flex; flex-direction:column; gap:9px; overflow:hidden; }
.tlr-barra{ display:grid; grid-template-columns:minmax(0,38%) 1fr auto; align-items:center; gap:10px; }
.tlr-barra .nome{ font-size:14.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.tlr-barra .trilho{ display:flex; gap:2px; height:16px; }
.tlr-barra .trilho > i{ display:block; height:100%; background:var(--c); border-radius:0; }
.tlr-barra .trilho > i:last-child{ border-radius:0 4px 4px 0; }
.tlr-barra .trilho > i.prev{ background:repeating-linear-gradient(45deg,var(--r-prev) 0 2px,transparent 2px 6px); box-shadow:inset 0 0 0 1px var(--r-prev); }
.tlr-barra .q{ font-size:15px; font-weight:800; font-variant-numeric:tabular-nums; min-width:2.5ch; text-align:right; }
.tlr-vazio{ color:var(--cor-texto-suave); font-size:15px; padding:20px 0; text-align:center; }
`;

function tlResumoRegistrarCss() {
    if (document.getElementById("tlrCssTag")) return;
    const s = document.createElement("style");
    s.id = "tlrCssTag"; s.textContent = TLR_CSS;
    document.head.appendChild(s);
}

// situação de cada OS no dia: a visita mais recente manda
// nomeCidade: junta cidades no gráfico por cidade (ex.: Magé conta em Guapimirim)
function tlResumoCalcular(dados, nomeCidade = c => c) {
    const porOs = new Map();
    for (const lt of dados?.linhasTec || []) {
        for (const b of lt.blocos) {
            if (!b.id) continue;
            const atual = porOs.get(b.id);
            if (!atual || b.ini > atual.b.ini) porOs.set(b.id, { b, cidade: lt.cidade });
        }
    }
    const agora = new Date();
    const r = { total: 0, fin: 0, noTempo: 0, passou: 0, exec: 0, desloc: 0, interr: 0, prev: 0, prevAtrasada: 0,
        tecnicos: 0, porHora: {}, porCidade: new Map(), porAssunto: new Map() };
    const grupo = (mapa, chave) => mapa.get(chave) || mapa.set(chave, { fin: 0, and: 0, interr: 0, prev: 0, total: 0 }).get(chave);

    for (const { b, cidade } of porOs.values()) {
        r.total++;
        const sit = b.tipo === "prev" ? "prev"
            : (b.estado === "fin" || b.estado === "fin-over") ? "fin"
            : b.estado === "interr" ? "interr" : "and";
        if (sit === "fin") {
            r.fin++;
            if (b.estado === "fin") r.noTempo++; else r.passou++;
            const h = b.fim ? b.fim.getHours() : null;
            if (h != null) r.porHora[h] = (r.porHora[h] || 0) + 1;
        } else if (sit === "interr") r.interr++;
        else if (sit === "prev") { r.prev++; if (b.fila || b.ini < agora) r.prevAtrasada++; }
        else if (b.estado === "desloc") r.desloc++;
        else r.exec++;
        for (const g of [grupo(r.porCidade, nomeCidade(cidade || "Sem cidade")), grupo(r.porAssunto, tlCurto(b.a) || "Sem assunto")]) { g[sit]++; g.total++; }
    }
    r.tecnicos = (dados?.linhasTec || []).filter(lt => !lt.fora && lt.blocos.some(b => b.tipo === "os")).length;
    return r;
}

function tlResumoDiaHtml(dados, nomeCidade) {
    const r = tlResumoCalcular(dados, nomeCidade);
    const fmt = n => Number(n || 0).toLocaleString("pt-BR");
    const pct = (n, t) => t ? Math.round(n / t * 100) : 0;
    const and = r.exec + r.desloc;
    const SIT = [
        { id: "fin", nome: "Finalizadas", c: "var(--r-fin)" },
        { id: "and", nome: "Em andamento", c: "var(--r-and)" },
        { id: "interr", nome: "Não concluídas", c: "var(--r-interr)" },
        { id: "prev", nome: "A iniciar", c: "var(--r-prev)" }
    ];
    const legenda = `<div class="tlr-legenda">${SIT.map(s => `<span><i class="tlr-sw${s.id === "prev" ? " prev" : ""}" style="--c:${s.c}"></i>${s.nome}</span>`).join("")}</div>`;

    const kpi = (n, rot, sub, cor) => `<div class="tlr-kpi" style="--k:${cor}"><div class="n">${fmt(n)}</div><div class="r">${rot}</div><div class="s">${sub}</div></div>`;
    const kpis = `<div class="tlr-kpis">
        ${kpi(r.total, "OS do dia", `${fmt(r.tecnicos)} técnico(s) em campo`, "var(--cor-texto-suave)")}
        ${kpi(r.fin, "✔ Finalizadas", `${pct(r.fin, r.total)}% das OS do dia`, "var(--r-fin)")}
        ${kpi(r.exec, "▶ Em execução agora", "", "var(--r-and)")}
        ${kpi(r.desloc, "🚚 Em deslocamento agora", "", "var(--r-and)")}
        ${kpi(r.prev, "◷ A iniciar", r.prevAtrasada ? `${fmt(r.prevAtrasada)} já passaram do horário` : "agendadas para hoje", "var(--r-prev)")}
        ${kpi(r.interr, "↺ Não concluídas", "reagendadas ou encaminhadas", "var(--r-interr)")}
    </div>`;

    const valores = { fin: r.fin, and, interr: r.interr, prev: r.prev };
    const pilha = r.total
        ? `<div class="tlr-pilha">${SIT.filter(s => valores[s.id]).map(s => {
            const p = pct(valores[s.id], r.total);
            return `<div class="tlr-seg${s.id === "prev" ? " prev" : ""}" style="--c:${s.c};flex:${valores[s.id]}" title="${s.nome}: ${fmt(valores[s.id])} (${p}%)">${p >= 6 ? `<span>${fmt(valores[s.id])} · ${p}%</span>` : ""}</div>`;
        }).join("")}</div>`
        : `<div class="tlr-vazio">Nenhuma OS no dia ainda.</div>`;
    const andamento = `<div class="tlr-card"><h3>Andamento do dia <small>${fmt(r.total)} OS · cada OS pela situação da visita mais recente</small></h3>${legenda}${pilha}</div>`;

    const totFin = r.noTempo + r.passou;
    const desempenho = `<div class="tlr-card"><h3>Desempenho <small>finalizadas</small></h3>
        <div class="tlr-hero">${totFin ? pct(r.noTempo, totFin) + "%" : "—"}</div>
        <div class="tlr-hero-sub">feitas dentro do tempo esperado</div>
        ${totFin ? `<div class="tlr-par">
            ${r.noTempo ? `<div class="tlr-seg" style="--c:var(--r-fin);flex:${r.noTempo}" title="No tempo: ${fmt(r.noTempo)}"></div>` : ""}
            ${r.passou ? `<div class="tlr-seg" style="--c:var(--r-over);flex:${r.passou}" title="Passaram do tempo: ${fmt(r.passou)}"></div>` : ""}
        </div>` : ""}
        <div class="tlr-linha"><span>✔ No tempo</span><b>${fmt(r.noTempo)}</b></div>
        <div class="tlr-linha"><span>▲ Passaram do tempo</span><b>${fmt(r.passou)}</b></div>
    </div>`;

    const horaAgora = new Date().getHours();
    const horas = [];
    for (let h = 7; h <= 19; h++) horas.push(h);
    const maxHora = Math.max(1, ...horas.map(h => r.porHora[h] || 0));
    const porHora = `<div class="tlr-card"><h3>Finalizadas por hora</h3>
        <div class="tlr-colunas">${horas.map(h => {
            const v = r.porHora[h] || 0;
            return `<div class="tlr-col" title="${h}h: ${fmt(v)} finalizada(s)">${v ? `<span class="v">${fmt(v)}</span>` : ""}<i style="height:${v ? Math.max(2, v / maxHora * 100) : 0}%"></i></div>`;
        }).join("")}</div>
        <div class="tlr-eixo">${horas.map(h => `<span${h === horaAgora ? ' class="agora" title="hora atual"' : ""}>${h}h</span>`).join("")}</div>
    </div>`;

    const barras = (mapa, max) => {
        const itens = [...mapa.entries()].sort((a, b) => b[1].total - a[1].total);
        if (!itens.length) return `<div class="tlr-vazio">Sem OS.</div>`;
        const topo = itens.slice(0, max);
        if (itens.length > max) {
            const outros = { fin: 0, and: 0, interr: 0, prev: 0, total: 0 };
            itens.slice(max).forEach(([, g]) => { for (const k in outros) outros[k] += g[k]; });
            topo.push([`Outros (${itens.length - max})`, outros]);
        }
        const maior = Math.max(...topo.map(([, g]) => g.total));
        return `<div class="tlr-barras">${topo.map(([nome, g]) => `
            <div class="tlr-barra" title="${escaparHtml(nome)}: ${SIT.map(s => `${s.nome.toLowerCase()} ${g[s.id]}`).join(", ")}">
                <span class="nome">${escaparHtml(nome)}</span>
                <span class="trilho" style="width:${g.total / maior * 100}%">${SIT.filter(s => g[s.id]).map(s => `<i class="${s.id === "prev" ? "prev" : ""}" style="--c:${s.c};flex:${g[s.id]}"></i>`).join("")}</span>
                <span class="q">${fmt(g.total)}</span>
            </div>`).join("")}</div>`;
    };
    const porCidade = `<div class="tlr-card"><h3>Por cidade <small>OS do dia</small></h3>${legenda}${barras(r.porCidade, 9)}</div>`;
    const porAssunto = `<div class="tlr-card"><h3>Por assunto <small>OS do dia</small></h3>${legenda}${barras(r.porAssunto, 9)}</div>`;

    return `${kpis}${andamento}<div class="tlr-grade">${desempenho}${porHora}${porCidade}${porAssunto}</div>`;
}
