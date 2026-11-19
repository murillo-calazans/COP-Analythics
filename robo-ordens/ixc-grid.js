// Puxadas pelas TELAS COMUNS (grids) do IXC no lugar do Query Builder (19/11).
// Devolve linhas no MESMO formato da visão do QB (aliases su_oss_chamado_..., códigos de
// status/prioridade/evento), então o resto do robô (paraLinhaPlanilha, sincronizarPendentes,
// comerciais, rompimentos) e o site não mudam nada.
//
// Validado 19/11 contra a 529 do QB: 182 OS / 1.002 movimentações, todas casaram 1 a 1 por
// data; o código do evento sai do histórico (ver eventosDaOs). Única lacuna: a grid de
// mensagens não traz a "resposta padrão" (fica vazia).
// SÓ LEITURA no IXC.

const fs = require("fs");
const path = require("path");

const z = n => String(n).padStart(2, "0");
const isoDia = d => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
const limpo = v => (v === undefined || v === null || String(v).trim() === "-" ? "" : String(v).trim());
const semAc = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const paraDataBR = s => {
    const m = String(s || "").match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
    if (!m || m[3] === "0000") return null;
    return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +m[6]);
};

// nome (grid) -> código (QB)
const STATUS_COD = { "aberta": "A", "encaminhada": "EN", "analise": "AN", "assumida": "AS", "agendada": "AG",
    "deslocamento": "DS", "execucao": "EX", "finalizada": "F", "aguardando agendamento": "RAG" };
const PRIORIDADE_COD = { "baixa": "B", "normal": "N", "alta": "A", "critica": "C" };
const ACESSO_COD = { "ativo": "A", "desativado": "D", "financeiro em atraso": "FA", "bloqueio manual": "CM",
    "bloqueio automatico": "CA", "aguardando assinatura": "AA" };
const cod = (mapa, v) => { const k = semAc(limpo(v)); return k ? (mapa[k] || limpo(v)) : ""; };

// 529 do QB: abertas em 2026, destes setores, status != F
const SETORES_529 = ["7", "4", "5", "8", "27", "34", "44", "52", "55", "59", "61", "65", "63", "71", "73"];
const ABERTURA_DESDE = new Date(2026, 0, 1);
const STATUS_ABERTOS = ["A", "AN", "EN", "AS", "AG", "DS", "EX", "RAG"];

/** Código do evento a partir das mensagens de UMA OS, já ordenadas por data.
 *  Regras tiradas da comparação com a 529 (19/11). */
function eventosDaOs(msgs) {
    let stAnt;
    return msgs.map((m, i) => {
        const h = semAc(m.historico), t = semAc(m.mensagem).slice(0, 200), s = semAc(m.status);
        let ev;
        if (/iniciou o deslocamento/.test(h)) ev = "2";
        else if (/,\s*executou/.test(h)) ev = "9";
        else if (/,\s*finalizou/.test(h)) ev = "6";
        else if (/,\s*reagendou/.test(h)) ev = "10";
        else if (/,\s*encaminhou/.test(h)) ev = "4";
        else if (/,\s*agendou/.test(h)) ev = "5";
        else if (/,\s*assumiu/.test(h)) ev = "8";
        else if (/,\s*registrou uma mensagem/.test(h)) ev = "16";
        else if (/^alteracao de dados da o\.?s/.test(t)) ev = "2";
        else if (/^agendado pela agenda/.test(t)) ev = "5";
        else if (i === 0) ev = "1";
        // sem histórico e sem texto conhecido: só conta se o status mudou
        else if (stAnt !== undefined && semAc(stAnt) === s) ev = "0";
        else ev = { deslocamento: "2", execucao: "9", finalizada: "6", "aguardando agendamento": "10", encaminhada: "4", agendada: "5", assumida: "8" }[s] || "0";
        stAnt = m.status;
        return ev;
    });
}

const GRID_JS = `
    const H = { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest" };
    const grid = async (tab, qtype, query, oper, rp, page) => {
        const body = new URLSearchParams({ page: String(page || 1), rp: String(rp), sortname: tab + ".id", sortorder: "asc", query, qtype, oper, grid_param: "false", grid_param2: "false" });
        const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 90000);
        try {
            const r = await fetch("aplicativo/" + tab + "/action/action.php?action=grid&relation=true&advanced_search=false", { method: "POST", body, credentials: "include", headers: H, signal: ctrl.signal });
            const tx = await r.text();
            if (r.status === 401 || (!tx.startsWith("{") && /login/i.test(tx.slice(0, 2000)))) throw new Error("SESSAO_CAIU");
            const j = JSON.parse(tx);
            let cols = []; try { cols = estrutura_forms[tab].grid.colModel.map(c => c.name); } catch {}
            if (!cols.length) throw new Error("grid " + tab + " sem colModel");
            return (j.rows || []).map(x => Object.fromEntries(x.cell.map((v, k) => [cols[k] || "c" + k, v])));
        } finally { clearTimeout(t); }
    };
    const todas = async (tab, qtype, query, oper) => {
        const out = [];
        for (let p = 1; p <= 40; p++) { const r = await grid(tab, qtype, query, oper, 1000, p); out.push(...r); if (r.length < 1000) break; }
        return out;
    };
    const varias = async (ids, fn, n) => {
        const out = [];
        for (let i = 0; i < ids.length; i += n) out.push(...await Promise.all(ids.slice(i, i + n).map(async id => {
            try { return [id, await fn(id)]; } catch (e) { if (e.message === "SESSAO_CAIU") throw e; return [id, null]; }
        })));
        return out;
    };`;

async function garantirIxc(pagina) {
    const ok = await pagina.evaluate(() => typeof estrutura_forms !== "undefined" && !!estrutura_forms.su_oss_chamado
        && !!estrutura_forms.su_oss_chamado_mensagem && !!estrutura_forms.radusuarios && !!estrutura_forms.funcionarios).catch(() => false);
    if (ok) return;
    await pagina.goto("https://ixc.amointernet.com.br/adm.php", { waitUntil: "domcontentloaded", timeout: 150000 });
    await pagina.waitForTimeout(3000);
}
const rodar = (pagina, corpo, arg) => pagina.evaluate(new Function("arg", `return (async () => { ${GRID_JS}\n${corpo} })();`), arg);

// ---------- caches em disco (tabelas que mudam pouco) ----------
const PASTA_CACHE = path.join(__dirname, "cache-grid");
const lerCache = nome => { try { return JSON.parse(fs.readFileSync(path.join(PASTA_CACHE, nome), "utf8")); } catch { return null; } };
const gravarCache = (nome, v) => { fs.mkdirSync(PASTA_CACHE, { recursive: true }); fs.writeFileSync(path.join(PASTA_CACHE, nome), JSON.stringify(v)); };

/** setor id->nome e funcionário nome->id: 1x por dia */
async function referencias(pagina) {
    const c = lerCache("referencias.json");
    if (c && c.dia === isoDia(new Date())) return c;
    const [setores, funcs, resps] = await rodar(pagina, `return [
        (await todas("empresa_setor", "empresa_setor.id", "0", ">")).map(s => [s["empresa_setor.id"], s["empresa_setor.setor"]]),
        (await todas("funcionarios", "funcionarios.id", "0", ">")).map(f => [f["funcionarios.id"], f["funcionarios.funcionario"], f["funcionarios.ativo"]]),
        (await todas("su_oss_respostas", "su_oss_respostas.id", "0", ">")).map(s => [s["su_oss_respostas.id"], s["su_oss_respostas.titulo"]])];`);
    const r = { dia: isoDia(new Date()), setorNome: Object.fromEntries(setores.map(([id, n]) => [id, String(n || "").trim()])), funcId: {},
        respostas: Object.fromEntries(resps.map(([id, t]) => [id, String(t ?? "")])) };
    // mesmo nome em 2 cadastros (ex.: MARCELO COELHO DA SILVA 923 ativo / 1035 inativo): fica o ativo,
    // e entre iguais o de id maior
    const melhor = {};
    for (const [id, nome, ativo] of funcs) {
        const k = semAc(nome).trim(), pont = (semAc(ativo) === "sim" ? 1e9 : 0) + Number(id);
        if (!melhor[k] || pont > melhor[k].pont) melhor[k] = { id, pont };
    }
    for (const [k, v] of Object.entries(melhor)) r.funcId[k] = v.id;
    gravarCache("referencias.json", r);
    return r;
}

/** login -> { lat, lng, acesso } (status do acesso do contrato). Vale 24 h por login. */
async function dadosLogins(pagina, logins, log) {
    const c = lerCache("logins.json") || {};
    const validade = Date.now() - 24 * 3600000;
    const falta = [...new Set(logins.filter(Boolean))].filter(l => !c[l] || c[l].em < validade);
    if (falta.length) {
        const res = await rodar(pagina, `return varias(arg, async login => {
            const r = (await grid("radusuarios", "radusuarios.login", login, "=", 5, 1)).find(x => x["radusuarios.login"] === login);
            return r ? [r["radusuarios.latitude"], r["radusuarios.longitude"], r["cliente_contrato.status_internet"]] : [];
        }, 8);`, falta);
        const agora = Date.now();
        for (const [login, v] of res) if (v) c[login] = { lat: limpo(v[0]), lng: limpo(v[1]), acesso: cod(ACESSO_COD, v[2]), em: agora };
        gravarCache("logins.json", c);
        if (log) log(`  grids: ${falta.length} login(s) consultados (coordenada/status do acesso)`);
    }
    return c;
}

// OS -> { msgs, em }: vive enquanto o robô estiver aberto (reiniciou = 1º retrato busca tudo, ~4 min)
const CACHE_MSGS = new Map();

/** mensagens de várias OS (grid de mensagens filtrada pelo nº da OS) */
async function mensagensDe(pagina, ids) {
    const res = await rodar(pagina, `return varias(arg, async id =>
        (await grid("su_oss_chamado_mensagem", "su_oss_chamado_mensagem.id_chamado", id, "=", 1000, 1)).map(m => [
            m["su_oss_chamado_mensagem.data"], m["su_oss_chamado_mensagem.status"], m["su_oss_chamado_mensagem.historico"],
            m["su_oss_chamado_mensagem.mensagem"], m["funcionarios.funcionario"], m["su_oss_chamado_mensagem.id_operador"],
            m["su_equipe.descricao"], m["wfl_tarefa.descricao"], m["su_oss_chamado_mensagem.id"]]), 8);`, ids);
    return new Map(res);
}

// ---------- registro completo de cada mensagem (action=recupera, o mesmo do formulário) ----------
// Traz o que a grid não traz: id_evento, id_tecnico e id_resposta (resposta padrão).
// Mensagem não muda depois de criada: cada uma é aberta UMA vez e fica em disco.
const ARQ_DET = "msgs-detalhe.json";
let _det = null;
const detCache = () => (_det = _det || lerCache(ARQ_DET) || {});
const MAX_DET_POR_VEZ = 2500; // ~75 s; o resto entra nas próximas rodadas (até lá vale a dedução)

async function detalhesMsgs(pagina, idsMsg, log) {
    const c = detCache();
    const falta = [...new Set(idsMsg.filter(Boolean))].filter(id => !c[id]).slice(0, MAX_DET_POR_VEZ);
    if (!falta.length) return c;
    const res = await rodar(pagina, `return varias(arg, async id => {
        const r = await fetch("aplicativo/su_oss_chamado_mensagem/action/action.php?action=recupera&id=" + id,
            { method: "POST", body: "action=recupera&id=" + id, credentials: "include", headers: H });
        const tx = await r.text();
        if (!tx.startsWith("[")) { if (/login/i.test(tx.slice(0, 2000)) && !tx.startsWith("{")) throw new Error("SESSAO_CAIU"); return null; }
        const v = Object.fromEntries(JSON.parse(tx).filter(x => x.campo).map(x => [x.campo, x.valor]));
        return [v.id_evento || "", v.id_tecnico || "", v.id_resposta || ""];
    }, 8);`, falta);
    let ok = 0;
    for (const [id, v] of res) if (v) { c[id] = v; ok++; }
    gravarCache(ARQ_DET, c);
    if (log) log(`  grids: ${ok} mensagem(ns) abertas (evento/técnico/resposta padrão)${falta.length < idsMsg.length ? "" : ""}`);
    return c;
}

/** monta as linhas no formato da visão do QB (uma por movimentação) */
function linhasQB(os, msgsBrutas, ref, logins, filtroData, det = {}) {
    const msgs = msgsBrutas.map(m => ({ data: limpo(m[0]), quando: paraDataBR(m[0]), status: limpo(m[1]), historico: limpo(m[2]),
        mensagem: limpo(m[3]), tecnico: limpo(m[4]), operador: limpo(m[5]), equipe: limpo(m[6]), tarefa: limpo(m[7]), idMsg: limpo(m[8]) }))
        .filter(m => m.quando).sort((a, b) => a.quando - b.quando);
    const evs = eventosDaOs(msgs);
    const lg = logins[os.login] || {};
    const out = [];
    msgs.forEach((m, i) => {
        if (filtroData && !filtroData(m.quando)) return;
        const d = det[m.idMsg]; // [id_evento, id_tecnico, id_resposta] do registro; sem ele, dedução
        const tec = d ? (d[1] || "0") : m.tecnico ? (ref.funcId[semAc(m.tecnico).trim()] || "0") : "0";
        const resposta = d && d[2] && d[2] !== "0" ? (ref.respostas || {})[d[2]] || "" : "";
        const op = (m.operador.match(/^(\d+)/) || [, "0"])[1];
        out.push({
            su_oss_chamado_mensagem_su_oss_chamado_id: os.id,
            su_oss_chamado_cliente_razao: os.cliente,
            su_oss_chamado_cliente_contrato_status_internet: lg.acesso || "",
            su_oss_chamado_radusuarios_login: os.login,
            su_oss_chamado_mensagem_id_tecnico: tec,
            su_oss_chamado_mensagem_id_operador: op,
            su_oss_chamado_mensagem_su_equipe_descricao: m.equipe,
            su_oss_chamado_mensagem_id_evento: d && d[0] ? d[0] : evs[i],
            su_oss_chamado_mensagem_status: STATUS_COD[semAc(m.status)] || m.status,
            su_oss_chamado_mensagem_su_oss_respostas_titulo: resposta,
            su_oss_chamado_su_diagnostico_descricao: os.diag,
            su_oss_chamado_mensagem_wfl_tarefa_descricao: m.tarefa,
            su_oss_chamado_mensagem_mensagem: m.mensagem,
            su_oss_chamado_su_oss_assunto_assunto: os.assunto,
            su_oss_chamado_mensagem_data: m.data,
            su_oss_chamado_mensagem_su_oss_chamado_data_agenda: os.agenda,
            su_oss_chamado_mensagem_su_oss_chamado_data_abertura: os.abertura,
            su_oss_chamado_mensagem_historico: m.historico,
            su_oss_chamado_cliente_contrato_contrato: os.contrato,
            su_oss_chamado_cidade_nome: os.cidade,
            su_oss_chamado_mensagem_su_oss_chamado_bairro: os.bairro,
            su_oss_chamado_mensagem_su_oss_chamado_prioridade: cod(PRIORIDADE_COD, os.prioridade),
            su_oss_chamado_mensagem_su_oss_chamado_latitude: lg.lat || "",
            su_oss_chamado_mensagem_su_oss_chamado_longitude: lg.lng || ""
        });
    });
    return out;
}

const mapOS = o => ({
    id: limpo(o["su_oss_chamado.id"]), status: limpo(o["su_oss_chamado.status"]), assunto: limpo(o["su_oss_assunto.assunto"]),
    setor: limpo(o["empresa_setor.setor"]), cidade: limpo(o["cidade.nome"]), bairro: limpo(o["su_oss_chamado.bairro"]),
    cliente: limpo(o["cliente.razao"]), login: limpo(o["radusuarios.login"]), abertura: limpo(o["su_oss_chamado.data_abertura"]),
    agenda: limpo(o["su_oss_chamado.data_agenda"]), diag: limpo(o["su_diagnostico.descricao"]),
    prioridade: limpo(o["su_oss_chamado.prioridade"]), contrato: limpo(o["cliente_contrato.contrato"])
});

/** Substitui puxarRecentes(pagina, molde529, janela) — mesmas regras da visão 529.
 *  janela null: retrato de todas as OS em aberto (com todas as mensagens).
 *  janela {ini, fim, porMovimentacao}: OS atualizadas na janela, só as mensagens da janela. */
async function puxar529Grid(pagina, janela, { log = () => {} } = {}) {
    const t0 = Date.now();
    await garantirIxc(pagina);
    const ref = await referencias(pagina);
    // nomes de setor vêm com espaço sobrando ("PROJETOS "): compara sempre aparado
    const setoresOk = new Set(SETORES_529.map(id => semAc(ref.setorNome[id] || "").trim()).filter(Boolean));
    if (setoresOk.size < SETORES_529.length) throw new Error("grids: não achei o nome de todos os setores da 529");

    let osBrutas;
    if (!janela) {
        osBrutas = await rodar(pagina, `const out = []; for (const st of arg) out.push(...await todas("su_oss_chamado", "su_oss_chamado.status", st, "="));
            return out;`, STATUS_ABERTOS);
    } else {
        const dias = [];
        for (let d = new Date(janela.ini.getFullYear(), janela.ini.getMonth(), janela.ini.getDate()); d <= janela.fim; d.setDate(d.getDate() + 1)) dias.push(isoDia(d));
        osBrutas = await rodar(pagina, `const out = []; for (const dia of arg) out.push(...await todas("su_oss_chamado", "su_oss_chamado.ultima_atualizacao", dia, "L"));
            return out;`, dias);
    }
    const vistos = new Set();
    const os = osBrutas.map(mapOS).filter(o => {
        if (!o.id || vistos.has(o.id)) return false;
        vistos.add(o.id);
        const ab = paraDataBR(o.abertura);
        return setoresOk.has(semAc(o.setor).trim()) && ab && ab >= ABERTURA_DESDE && semAc(o.status) !== "finalizada" && semAc(o.status) !== "cancelada";
    });
    const tOS = Date.now() - t0;
    const logins = await dadosLogins(pagina, os.map(o => o.login), log);
    // mensagens: janela = OS mexidas na janela -> sempre busca; retrato = só as que não estão
    // no cache (ou estão há >20 h). A conferência de hora em hora vira só a lista de OS.
    const validade = Date.now() - 20 * 3600000;
    const buscar = janela ? os.map(o => o.id) : os.filter(o => { const c = CACHE_MSGS.get(o.id); return !c || c.em < validade; }).map(o => o.id);
    const novas = buscar.length ? await mensagensDe(pagina, buscar) : new Map();
    const agoraMs = Date.now();
    for (const [id, m] of novas) if (m) CACHE_MSGS.set(id, { msgs: m, em: agoraMs });
    const msgs = new Map(os.map(o => [o.id, novas.has(o.id) ? novas.get(o.id) : (CACHE_MSGS.get(o.id) || {}).msgs || null]));
    const falhas = [...msgs.values()].filter(v => !v).length;
    if (falhas > Math.max(5, os.length * 0.02)) throw new Error(`grids: ${falhas} de ${os.length} OS sem mensagens (IXC instável)`);

    const filtro = janela ? (d => d >= janela.ini && d <= janela.fim) : null;
    // abre as mensagens ainda não vistas (as da janela primeiro: são as que vão pro banco agora)
    const idsMsg = [];
    for (const o of os) for (const m of msgs.get(o.id) || []) if (!filtro || filtro(paraDataBR(m[0]))) idsMsg.push(limpo(m[8]));
    const det = await detalhesMsgs(pagina, idsMsg, log);
    const linhas = [];
    for (const o of os) { const m = msgs.get(o.id); if (m) linhas.push(...linhasQB(o, m, ref, logins, filtro, det)); }

    // retrato em memória (arquivo do R2): retrato = troca tudo; janela = OS mexidas entram com
    // TODAS as mensagens e as que fecharam/saíram do filtro somem
    if (!janela) {
        RETRATO.os = new Map();
        RETRATO.completo = true;
    }
    if (RETRATO.completo) {
        if (janela) for (const id of vistos) RETRATO.os.delete(id);
        for (const o of os) { const m = msgs.get(o.id); if (m) RETRATO.os.set(o.id, linhasQB(o, m, ref, logins, null, det)); }
        RETRATO.em = Date.now();
        RETRATO.versao++;
    }
    log(`  grids 529${janela ? " (janela)" : " (retrato)"}: ${os.length} OS (${buscar.length} com mensagens buscadas), ${linhas.length} linha(s)${falhas ? `, ${falhas} OS falharam` : ""} — OS ${Math.round(tOS / 1000)}s, total ${Math.round((Date.now() - t0) / 1000)}s`);
    return linhas;
}

// Retrato completo da 529 em memória (todas as OS em aberto, todas as mensagens) — o robô
// publica no R2 depois de cada atualização. Só vale depois do 1º retrato completo do processo.
const RETRATO = { os: new Map(), completo: false, em: 0, versao: 0 };
function retrato529() {
    if (!RETRATO.completo) return null;
    const linhas = []; for (const l of RETRATO.os.values()) linhas.push(...l);
    return { em: RETRATO.em, versao: RETRATO.versao, nOs: RETRATO.os.size, linhas };
}

module.exports = { puxar529Grid, retrato529, eventosDaOs, linhasQB, mapOS, referencias, dadosLogins, mensagensDe, detalhesMsgs, garantirIxc, rodar, GRID_JS };
