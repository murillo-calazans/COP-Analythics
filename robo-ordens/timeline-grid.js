// Timeline do dia SEM Query Builder (19/11): o QB do IXC parou de responder (>180s) desde
// 18/11 18h, mas as telas comuns (grids) respondem em segundos. Monta o mesmo TL_DADOS
// (movs / ordens / osHoje) que gerarTimelineLocal montava pela 529:
//   1) grid su_oss_chamado por ultima_atualizacao = hoje  -> OS mexidas hoje (já com nomes)
//   2) grid su_oss_chamado por data_agenda = hoje         -> OS previstas p/ hoje (osHoje)
//   3) grid su_oss_chamado_mensagem por id_chamado, só das OS mexidas cuja linha mudou
//      desde a última rodada (cache em memória) -> movimentações
// A grid de mensagens não traz id_evento: o evento sai do status/histórico (ver eventoDe).
// SÓ LEITURA no IXC.

const z = n => String(n).padStart(2, "0");
const isoDia = d => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
const brDia = d => `${z(d.getDate())}/${z(d.getMonth() + 1)}/${d.getFullYear()}`;
const limpo = v => (v === undefined || v === null || v === "-" ? "" : String(v).trim());
const semAc = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const paraDataBR = s => {
    const m = String(s || "").match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
    if (!m || m[3] === "0000") return null;
    return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +m[6]);
};

// códigos de evento do IXC usados pela timeline: 2 deslocamento, 9 execução, 6 finalizou,
// 5 agendou, 10 reagendou, 4 encaminhou/alterou setor
// statusAnterior: status da mensagem anterior da mesma OS. Sem ação explícita no histórico,
// o evento só vale se o status MUDOU (ex.: "Alteração de dados" numa OS já finalizada
// repete "Finalizada" e não pode virar uma 2ª finalização).
function eventoDe(status, historico, mensagem, statusAnterior) {
    const h = semAc(historico) + " " + semAc(mensagem).slice(0, 200);
    const s = semAc(status);
    if (/iniciou o deslocamento/.test(h)) return "2";
    if (/,\s*executou/.test(h)) return "9";
    if (/,\s*finalizou/.test(h)) return "6";
    if (/,\s*reagendou/.test(h)) return "10";
    if (/,\s*encaminhou/.test(h)) return "4";
    if (/,\s*agendou/.test(h)) return "5";
    // sem histórico (algumas linhas vêm "-"): cai no status da movimentação, se mudou
    if (statusAnterior !== undefined && semAc(statusAnterior) === s) return "0";
    if (s === "deslocamento") return "2";
    if (s.startsWith("execu")) return "9";
    if (s === "finalizada") return "6";
    if (s === "reagendada") return "10";
    if (s === "encaminhada") return "4";
    if (s === "agendada") return "5";
    return "0";
}

const GRID_JS = `
    const H = { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest" };
    const grid = async (tab, qtype, query, oper, rp, page) => {
        const body = new URLSearchParams({ page: String(page), rp: String(rp), sortname: tab + ".id", sortorder: "asc", query, qtype, oper, grid_param: "false", grid_param2: "false" });
        const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 60000);
        try {
            const r = await fetch("aplicativo/" + tab + "/action/action.php?action=grid&relation=true&advanced_search=false", { method: "POST", body, credentials: "include", headers: H, signal: ctrl.signal });
            const tx = await r.text();
            if (r.status === 401 || /\\/login/.test(tx.slice(0, 500)) && !tx.startsWith("{")) throw new Error("SESSAO_CAIU");
            const j = JSON.parse(tx);
            let cols = []; try { cols = estrutura_forms[tab].grid.colModel.map(c => c.name); } catch {}
            if (!cols.length) throw new Error("grid " + tab + " sem colModel (página do IXC não carregou?)");
            return (j.rows || []).map(x => Object.fromEntries(x.cell.map((v, k) => [cols[k] || "c" + k, v])));
        } finally { clearTimeout(t); }
    };
    const todas = async (tab, qtype, query, oper) => {
        const out = [];
        for (let p = 1; p <= 20; p++) { const r = await grid(tab, qtype, query, oper, 1000, p); out.push(...r); if (r.length < 1000) break; }
        return out;
    };`;

// cache entre rodadas (o robô é um processo só): mensagens por OS + "impressão" da linha da OS
const cache = { dia: null, msgsPorOs: new Map(), assinatura: new Map(), completoEm: 0 };

async function garantirIxc(pagina) {
    const ok = await pagina.evaluate(() => typeof estrutura_forms !== "undefined" && !!estrutura_forms.su_oss_chamado && !!estrutura_forms.su_oss_chamado_mensagem).catch(() => false);
    if (ok) return;
    await pagina.goto("https://ixc.amointernet.com.br/adm.php", { waitUntil: "domcontentloaded", timeout: 150000 });
    await pagina.waitForTimeout(3000);
    // as definições das grids só existem depois que o módulo foi aberto uma vez: força o carregamento
    await pagina.evaluate(async () => {
        for (const tab of ["su_oss_chamado", "su_oss_chamado_mensagem"]) {
            if (typeof estrutura_forms !== "undefined" && estrutura_forms[tab]) continue;
            try { if (typeof carregaEstrutura === "function") await carregaEstrutura(tab); } catch {}
        }
    }).catch(() => {});
}

const mapOS = o => ({
    id: limpo(o["su_oss_chamado.id"]), status: limpo(o["su_oss_chamado.status"]), assunto: limpo(o["su_oss_assunto.assunto"]),
    setor: limpo(o["empresa_setor.setor"]), cidade: limpo(o["cidade.nome"]), bairro: limpo(o["su_oss_chamado.bairro"]),
    cliente: limpo(o["cliente.razao"]), tecnico: limpo(o["funcionarios.funcionario"]), login: limpo(o["radusuarios.login"]),
    abertura: limpo(o["su_oss_chamado.data_abertura"]), agenda: limpo(o["su_oss_chamado.data_agenda"]),
    inicio: limpo(o["su_oss_chamado.data_inicio"]), final: limpo(o["su_oss_chamado.data_final"]),
    fechamento: limpo(o["su_oss_chamado.data_fechamento"]), diag: limpo(o["su_diagnostico.descricao"]),
    prioridade: limpo(o["su_oss_chamado.prioridade"]), contrato: limpo(o["cliente_contrato.contrato"]),
    mensagem: limpo(o["su_oss_chamado.mensagem"])
});

/** Puxa tudo pelas grids e devolve { movs, ordens, osHoje, stats } no formato do TL_DADOS. */
async function puxarTimelineGrid(pagina, { log = () => {}, completoACadaMin = 60 } = {}) {
    const t0 = Date.now();
    const agora = new Date();
    const hoje0 = new Date(agora); hoje0.setHours(0, 0, 0, 0);
    const ISO = isoDia(agora), BR = brDia(agora);
    if (cache.dia !== ISO) { cache.dia = ISO; cache.msgsPorOs.clear(); cache.assinatura.clear(); cache.completoEm = 0; }
    const completo = Date.now() - cache.completoEm > completoACadaMin * 60000;

    await garantirIxc(pagina);
    const rodar = (corpo, arg) => pagina.evaluate(new Function("arg", `return (async () => { ${GRID_JS}\n${corpo} })();`), arg);

    const [mexidasBrutas, agendaBrutas] = await rodar(`return [
        await todas("su_oss_chamado", "su_oss_chamado.ultima_atualizacao", arg, "L"),
        await todas("su_oss_chamado", "su_oss_chamado.data_agenda", arg, "L")];`, ISO);
    const mexidas = mexidasBrutas.map(mapOS).filter(o => o.id);
    const agenda = agendaBrutas.map(mapOS).filter(o => o.id);
    const tPuxOS = Date.now() - t0;

    // quais OS precisam ter as mensagens (re)puxadas
    const assin = o => [o.status, o.agenda, o.inicio, o.final, o.fechamento, o.tecnico, o.diag].join("|");
    const fila = [];
    for (const o of mexidas) {
        const a = assin(o);
        if (completo || !cache.msgsPorOs.has(o.id) || cache.assinatura.get(o.id) !== a) fila.push(o.id);
        cache.assinatura.set(o.id, a);
    }
    const LOTE = 8;
    let falhas = 0;
    for (let i = 0; i < fila.length; i += LOTE) {
        const lote = fila.slice(i, i + LOTE);
        const res = await rodar(`return Promise.all(arg.map(async id => {
            try {
                const r = await grid("su_oss_chamado_mensagem", "su_oss_chamado_mensagem.id_chamado", id, "=", 500, 1);
                return [id, r.map(m => [m["su_oss_chamado_mensagem.data"], m["su_oss_chamado_mensagem.status"], m["su_oss_chamado_mensagem.historico"], m["su_oss_chamado_mensagem.mensagem"], m["funcionarios.funcionario"]])];
            } catch (e) { if (e.message === "SESSAO_CAIU") throw e; return [id, null]; }
        }));`, lote);
        for (const [id, msgs] of res) {
            if (msgs) cache.msgsPorOs.set(id, msgs);
            else { falhas++; cache.assinatura.delete(id); } // tenta de novo na próxima
        }
    }
    if (completo) cache.completoEm = Date.now();

    // movimentações de hoje + técnico do deslocamento (como o robô fazia pela 529)
    const porId = new Map(mexidas.map(o => [o.id, o]));
    const movs = [], ordens = [];
    for (const [id, msgs] of cache.msgsPorOs) {
        const o = porId.get(id);
        if (!o) continue;
        let tecDesloc = null, temHoje = false;
        const ord = msgs.map(m => ({ data: paraDataBR(m[0]), status: limpo(m[1]), hist: limpo(m[2]), msg: limpo(m[3]) }))
            .filter(m => m.data).sort((a, b) => a.data - b.data);
        let stAnt;
        for (const m of ord) {
            const ev = eventoDe(m.status, m.hist, m.msg, stAnt);
            stAnt = m.status;
            const textoDesloc = /iniciou o deslocamento/i.test(m.hist) ? m.hist : m.msg;
            if (ev === "2") {
                const t = String(textoDesloc).match(/usu[aá]rio\s+(.+?)\s*,\s*iniciou o deslocamento/i);
                if (t) tecDesloc = t[1].trim();
            }
            if (m.data < hoje0) continue;
            temHoje = true;
            movs.push({ ordem_id: id, data: m.data.toISOString(), evento: ev, status: m.status, mensagem: ev === "2" ? textoDesloc : "" });
        }
        if (temHoje) ordens.push({ id, cliente: o.cliente, cidade: o.cidade, assunto: o.assunto, tecnico_responsavel: tecDesloc });
    }
    movs.sort((a, b) => a.data.localeCompare(b.data));

    // previstas p/ hoje no formato de linha da planilha 529 (o Motor do site lê esses cabeçalhos).
    // Uma linha por OS; TECNICO AGENDA = colaborador da OS (a grid já dá o nome).
    // o Motor só considera OS com alguma linha ANTES de hoje: aberta hoje -> base 23:59:59 de ontem
    const ontemFim = new Date(hoje0.getTime() - 1000);
    const baseData = o => { const d = paraDataBR(o.abertura); return d && d < hoje0 ? o.abertura : `${brDia(ontemFim)} 23:59:59`; };
    const osHoje = agenda.filter(o => o.agenda.startsWith(BR) && !/^finalizada|^cancelada/i.test(o.status)).map(o => ({ dados: {
        "ID OS": o.id, "CLIENTE": o.cliente, "LOGIN": o.login, "STATUS": o.status, "EVENTO": "", "COLABORADOR RESPONSAVEL": "",
        "ASSUNTO": o.assunto, "DIAGNOSTICO": o.diag, "MENSAGEM": o.mensagem, "DATA": baseData(o), "AGENDAMENTO": o.agenda,
        "DATA/HORA ABERTURA": o.abertura, "CONTRATO": o.contrato, "CIDADE": o.cidade, "BAIRRO": o.bairro,
        "PRIORIDADE": o.prioridade, "TECNICO AGENDA": o.tecnico, "SETOR": o.setor
    } }));

    const stats = { mexidas: mexidas.length, agenda: agenda.length, osHoje: osHoje.length, repuxadas: fila.length, falhas,
        completo, movs: movs.length, ordens: ordens.length, segOS: Math.round(tPuxOS / 1000), seg: Math.round((Date.now() - t0) / 1000) };
    log(`  timeline (grids): ${stats.mexidas} OS mexidas hoje, ${stats.repuxadas} com mensagens repuxadas${falhas ? ` (${falhas} falharam)` : ""}, ${stats.movs} movimentações, ${stats.osHoje} previstas — ${stats.seg}s`);
    return { movs, ordens, osHoje, stats };
}

module.exports = { puxarTimelineGrid, eventoDe };
