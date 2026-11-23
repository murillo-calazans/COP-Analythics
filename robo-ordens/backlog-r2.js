// Backlog diário (tabela backlog_retratos, gravada pelo próprio Supabase às 23h55) → um arquivo por
// dia no Cloudflare R2 (backlog/AAAA-MM-DD.json, lido pelo "Backlog histórico" do site) + cópia local
// em C:\cop-robo\arquivo\backlog. Depois de publicado, o banco guarda só os últimos DIAS_BANCO dias.
// 23/11/2026 — decisão do usuário: "arquivo por dia na nuvem".
const fs = require("fs"), path = require("path"), zlib = require("zlib");

const PASTA = "C:\\cop-robo\\arquivo\\backlog";
const ARQ_ESTADO = path.join(PASTA, "publicados.json");
const DIAS_BANCO = 7;
const COLUNAS = ["os_id", "cliente", "cidade", "bairro", "assunto", "status", "abertura", "agendamento", "salvo_em"];

const isoBR = d => d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });   // AAAA-MM-DD
const maisDias = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

async function rest(caminho, metodo = "GET") {
    const U = process.env.SUPABASE_URL.replace(/\/$/, ""), K = process.env.SUPABASE_SERVICE_KEY;
    const r = await fetch(`${U}/rest/v1/${caminho}`, { method: metodo, headers: { apikey: K, Authorization: "Bearer " + K, Prefer: "return=minimal" } });
    if (!r.ok) throw new Error(`REST ${r.status} ${caminho.slice(0, 80)}: ${(await r.text()).slice(0, 200)}`);
    return metodo === "GET" ? r.json() : null;
}

async function linhasDoDia(dia) {
    const out = [];
    for (let de = 0; ; de += 1000) {
        const d = await rest(`backlog_retratos?select=${COLUNAS.join(",")}&dia=eq.${dia}&order=os_id,salvo_em&offset=${de}&limit=1000`);
        out.push(...d);
        if (d.length < 1000) return out;
    }
}

async function rodar({ log = () => {} } = {}) {
    fs.mkdirSync(PASTA, { recursive: true });
    let est = {};
    try { est = JSON.parse(fs.readFileSync(ARQ_ESTADO, "utf8")); } catch {}
    const hoje = isoBR(new Date());
    const [min] = await rest("backlog_retratos?select=dia&order=dia.asc&limit=1");
    if (!min) return { publicados: 0, apagados: 0 };
    let publicados = 0, apagados = 0;
    // 1) publica cada dia fechado (antes de hoje) que ainda não foi
    for (let dia = min.dia; dia < hoje; dia = maisDias(dia, 1)) {
        if (est[dia]) continue;
        const linhas = await linhasDoDia(dia);
        if (!linhas.length) continue;
        const salvoEm = linhas.reduce((m, l) => (l.salvo_em > m ? l.salvo_em : m), "");
        const corpo = JSON.stringify({ dia, salvoEm, colunas: COLUNAS, linhas: linhas.map(l => COLUNAS.map(c => l[c] ?? null)) });
        fs.writeFileSync(path.join(PASTA, `${dia}.json.gz`), zlib.gzipSync(corpo));
        await require("./r2").enviar(`backlog/${dia}.json`, corpo);
        est[dia] = linhas.length;
        fs.writeFileSync(ARQ_ESTADO, JSON.stringify(est, null, 1));
        publicados++;
    }
    // 2) apaga do banco os dias antigos — SÓ os que já estão no R2 e na cópia local
    const corte = maisDias(hoje, -DIAS_BANCO);
    for (let dia = min.dia; dia < corte; dia = maisDias(dia, 1)) {
        if (!est[dia] || est["apagado " + dia] || !fs.existsSync(path.join(PASTA, `${dia}.json.gz`))) continue;
        await rest(`backlog_retratos?dia=eq.${dia}`, "DELETE");
        est["apagado " + dia] = true;
        apagados++;
    }
    fs.writeFileSync(ARQ_ESTADO, JSON.stringify(est, null, 1));
    log(`  backlog: ${publicados} dia(s) publicados no R2, ${apagados} dia(s) antigos tirados do banco (fica ${DIAS_BANCO} dias).`);
    return { publicados, apagados };
}

module.exports = { rodar };
