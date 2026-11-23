// Poda das OS finalizadas (23/11/2026, decisão do usuário): o banco do COP Analytics guarda só
// HOJE e ONTEM (data_fechamento >= ontem 00:00, horário de Brasília). Histórico = puxar do IXC quando
// precisar. Antes de apagar, cada dia vira uma cópia BRUTA (ordens + movimentações, todas as colunas)
// em <RELATÓRIO MENSAL>\AAAA\MM - Mês\Dados diários\AAAA-MM-DD.json.gz — conferida antes do DELETE.
// PODA_FINALIZADAS=0 no .env desliga.
const fs = require("fs"), path = require("path"), zlib = require("zlib");

const BASE = process.env.RELATORIOS_DIR || "C:\\Users\\muril\\OneDrive - AMO TIC TECNOLOGIA DA INFORMACAO LTDA\\02 - CONTROLE DE OPERAÇÕES\\02 - COP\\01 - RELATÓRIOS\\06 - RELATÓRIO MENSAL";
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const LOTE = 300;

const isoBR = d => new Date(d).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

async function rest(caminho, metodo = "GET") {
    const U = process.env.SUPABASE_URL.replace(/\/$/, ""), K = process.env.SUPABASE_SERVICE_KEY;
    const r = await fetch(`${U}/rest/v1/${caminho}`, { method: metodo, headers: { apikey: K, Authorization: "Bearer " + K, Prefer: "return=minimal" } });
    if (!r.ok) throw new Error(`REST ${r.status} ${caminho.slice(0, 80)}: ${(await r.text()).slice(0, 200)}`);
    return metodo === "GET" ? r.json() : null;
}

function arquivoDoDia(dia) {
    const [a, m] = dia.split("-").map(Number);
    const pasta = path.join(BASE, String(a), `${String(m).padStart(2, "0")} - ${MESES[m - 1]}`, "Dados diários");
    fs.mkdirSync(pasta, { recursive: true });
    return path.join(pasta, `${dia}.json.gz`);
}

// junta com o que já houver no arquivo do dia (OS reaberta e refechada depois volta a ser podada)
function gravarDia(dia, ordens, movs) {
    const arq = arquivoDoDia(dia);
    let atual = { ordens: [], movimentacoes: [] };
    if (fs.existsSync(arq)) atual = JSON.parse(zlib.gunzipSync(fs.readFileSync(arq)).toString("utf8"));
    const ids = new Set(ordens.map(o => String(o.id)));
    const movIds = new Set(movs.map(m => m.id));
    const dados = {
        dia, atualizadoEm: new Date().toISOString(),
        ordens: [...atual.ordens.filter(o => !ids.has(String(o.id))), ...ordens],
        movimentacoes: [...atual.movimentacoes.filter(m => !movIds.has(m.id)), ...movs]
    };
    fs.writeFileSync(arq, zlib.gzipSync(JSON.stringify(dados)));
    const conf = JSON.parse(zlib.gunzipSync(fs.readFileSync(arq)).toString("utf8"));
    if (conf.ordens.length !== dados.ordens.length || conf.movimentacoes.length !== dados.movimentacoes.length) throw new Error(`cópia de ${dia} não confere`);
}

async function rodar({ log = () => {}, maxOrdens = 20000 } = {}) {
    if (process.env.PODA_FINALIZADAS === "0") return { apagadas: 0 };
    const ontem = new Date(); ontem.setDate(ontem.getDate() - 1);
    const corte = `${isoBR(ontem)}T00:00:00-03:00`;
    let apagadas = 0, movsApagadas = 0;
    while (apagadas < maxOrdens) {
        const ordens = await rest(`ordens?select=*&data_fechamento=lt.${encodeURIComponent(corte)}&order=id&limit=${LOTE}`);
        if (!ordens.length) break;
        const lista = ordens.map(o => encodeURIComponent(o.id)).join(",");
        const movs = [];
        for (let ultimo = 0; ;) {
            const d = await rest(`movimentacoes?select=*&ordem_id=in.(${lista})&id=gt.${ultimo}&order=id&limit=1000`);
            movs.push(...d);
            if (d.length < 1000) break;
            ultimo = d[d.length - 1].id;
        }
        // cópia por dia de fechamento ANTES de apagar
        const porDia = new Map();
        for (const o of ordens) { const dia = isoBR(o.data_fechamento); if (!porDia.has(dia)) porDia.set(dia, { o: [], m: [] }); porDia.get(dia).o.push(o); }
        const diaDaOs = new Map(ordens.map(o => [String(o.id), isoBR(o.data_fechamento)]));
        for (const m of movs) porDia.get(diaDaOs.get(String(m.ordem_id))).m.push(m);
        for (const [dia, g] of porDia) gravarDia(dia, g.o, g.m);
        // apaga: movimentações primeiro, depois as ordens
        for (let i = 0; i < ordens.length; i += 100) {
            const l = ordens.slice(i, i + 100).map(o => encodeURIComponent(o.id)).join(",");
            await rest(`movimentacoes?ordem_id=in.(${l})`, "DELETE");
            await rest(`ordens?id=in.(${l})`, "DELETE");
        }
        apagadas += ordens.length; movsApagadas += movs.length;
    }
    if (apagadas) log(`  poda: ${apagadas} OS finalizadas antes de ontem (${movsApagadas} movimentações) guardadas em "Dados diários" e tiradas do banco.`);
    return { apagadas, movsApagadas };
}

module.exports = { rodar };
