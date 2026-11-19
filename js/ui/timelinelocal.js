// Timeline local (Timeline do dia.html, aberta direto do disco): o robô grava
// timeline-dados.js na mesma pasta a cada poucos minutos. Este arquivo faz o
// papel do supabaseClient para a timeline/TV, respondendo às mesmas consultas
// com os dados desse arquivo — sem banco. Temporário, enquanto o Supabase está fora.

const TL_LOCAL_PARADO_MIN = 30;
let tlLocalVersao = null;

function tlLocalRecarregarDados() {
    return new Promise(resolve => {
        const antigo = document.getElementById("tlLocalDados");
        const s = document.createElement("script");
        s.id = "tlLocalDados";
        s.src = "timeline-dados.js?t=" + Date.now();
        s.onload = s.onerror = () => { if (antigo) antigo.remove(); resolve(); };
        document.head.appendChild(s);
    });
}

function tlLocalConsulta(tabela) {
    const st = { tabela, sel: "", inIds: null, pagina: 0, depoisDe: null, limite: null };
    const b = {
        select(c) { st.sel = c; return b; },
        order() { return b; }, limit(n) { st.limite = n; return b; }, gte() { return b; },
        gt(col, v) { if (col === "id") st.depoisDe = v; return b; }, like() { return b; }, eq() { return b; },
        range(de) { st.pagina = de; return b; },
        in(_col, ids) { st.inIds = new Set(ids.map(String)); return b; },
        maybeSingle() { return b; },
        then(ok, erro) { return tlLocalResponder(st).then(ok, erro); }
    };
    return b;
}

async function tlLocalResponder(st) {
    const d = window.TL_DADOS || { movs: [], ordens: [], osHoje: [], escala: [] };
    const resp = data => ({ data, error: null });

    if (st.tabela === "ordens" && st.sel === "atualizado_em") {
        // a TV pergunta "mudou algo?" a cada 2 min: é a hora de reler o arquivo
        await tlLocalRecarregarDados();
        // o robô copiou uma versão nova da página: recarrega pra usar o código novo
        const v = window.TL_DADOS?.versaoPagina;
        if (v && tlLocalVersao && v !== tlLocalVersao) { location.reload(); return new Promise(() => {}); }
        if (v) tlLocalVersao = v;
        const g = window.TL_DADOS?.geradoEm;
        if (!g) throw Object.assign(new Error("sem dados"), { mostrar: "Ainda não há dados do robô nesta pasta (timeline-dados.js)." });
        return resp([{ atualizado_em: g }]);
    }
    if (st.tabela === "os_pendentes" && st.sel === "capturado_em") return resp([{ capturado_em: d.geradoEm }]);
    if (st.tabela === "os_pendentes") {
        const linhas = d.osHoje.map((l, i) => ({ id: i + 1, ...l })).filter(l => st.depoisDe == null || l.id > st.depoisDe);
        return resp(st.limite ? linhas.slice(0, st.limite) : linhas);
    }
    if (st.tabela === "escala_tecnicos_dados") return resp({ dados: d.escala || [] });
    if (st.tabela === "ordens" && st.sel === "id") return resp(st.pagina > 0 ? [] : d.ordens.map(o => ({ id: o.id })));
    if (st.tabela === "ordens") return resp(d.ordens.filter(o => !st.inIds || st.inIds.has(String(o.id))));
    if (st.tabela === "movimentacoes") return resp(d.movs.filter(m => !st.inIds || st.inIds.has(String(m.ordem_id))));
    return resp([]);
}

// aviso no topo da TV quando o arquivo do robô ficou velho (robô parado / sem IXC)
function tlAvisoFonte() {
    const g = window.TL_DADOS?.geradoEm;
    if (!g || (Date.now() - new Date(g).getTime()) / 60000 <= TL_LOCAL_PARADO_MIN) return null;
    const h = new Date(g).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    return `O robô não atualiza os dados desde ${h} — mostrando o último retrato.`;
}

const supabaseClient = {
    from: tlLocalConsulta,
    auth: { getSession: async () => ({ data: { session: { local: true } } }), signOut: async () => {} }
};
