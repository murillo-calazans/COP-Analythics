/**
 * ==========================================================
 * Arquivador mensal — CSV de dados brutos (ordens + movimentações)
 * ==========================================================
 * Gera, pra um mês, um CSV com os dados brutos do Supabase (uma linha por
 * MOVIMENTAÇÃO, com os campos da OS repetidos e os códigos já RESOLVIDOS em
 * nome — evento, operador, diagnóstico, colaborador, técnico), salvo em
 *   <base>\AAAA\MM - Mês\Relatório AAAA-MM (Mês).csv
 * É a parte que a aba "Visualizar mês arquivado" do site vai re-ler. NÃO apaga
 * nada do banco — a poda é um passo separado, só depois de conferir o arquivo.
 *
 * Uso:  node --env-file=.env arquivar-mes.js [AAAA-MM]
 *       (sem argumento = mês anterior ao de hoje)
 *
 * Config (.env, opcional): RELATORIOS_DIR = pasta base (senão usa o padrão COP).
 * Lê SUPABASE_URL + SUPABASE_SERVICE_KEY do mesmo .env do robô.
 */

const fs = require("fs");
const path = require("path");

const BASE_PADRAO = "C:\\Users\\muril\\OneDrive - AMO TIC TECNOLOGIA DA INFORMACAO LTDA\\02 - CONTROLE DE OPERAÇÕES\\02 - COP\\01 - RELATÓRIOS\\06 - RELATÓRIO MENSAL";
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const U = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const K = process.env.SUPABASE_SERVICE_KEY || "";
const BASE = process.env.RELATORIOS_DIR || BASE_PADRAO;

if (!U || !K) { console.error("Faltou SUPABASE_URL / SUPABASE_SERVICE_KEY no .env."); process.exit(1); }

const H = { apikey: K, Authorization: `Bearer ${K}` };
const p2 = n => String(n).padStart(2, "0");

/** Mês alvo: argumento AAAA-MM, ou o mês anterior ao de hoje. */
function mesAlvo() {
    const arg = process.argv[2];
    if (arg && /^\d{4}-\d{2}$/.test(arg)) { const [a, m] = arg.split("-").map(Number); return { ano: a, mes: m }; }
    const h = new Date();
    return h.getMonth() === 0 ? { ano: h.getFullYear() - 1, mes: 12 } : { ano: h.getFullYear(), mes: h.getMonth() };
}

async function rest(caminho) {
    const r = await fetch(`${U}/rest/v1/${caminho}`, { headers: H });
    if (!r.ok) throw new Error(`REST ${r.status} em ${caminho}: ${(await r.text()).slice(0, 200)}`);
    return r.json();
}

/** Map chave -> nome, a partir de uma tabela de referência (dados jsonb). */
async function mapaRef(tabela, campoNome) {
    const linhas = await rest(`${tabela}?select=chave,dados`);
    const m = new Map();
    for (const l of linhas) { const d = l.dados || {}; m.set(String(l.chave), d[campoNome] ?? d.NOME ?? d.DESCRIAAO ?? ""); }
    return m;
}

/** Todas as ordens finalizadas no mês (keyset por id texto). */
async function ordensDoMes(ini, fim) {
    const todas = [];
    let ultimo = "";
    while (true) {
        const q = `ordens?select=*&data_fechamento=gte.${ini}&data_fechamento=lt.${fim}&order=id&limit=1000` +
            (ultimo ? `&id=gt.${encodeURIComponent(ultimo)}` : "");
        const d = await rest(q);
        if (!d.length) break;
        todas.push(...d);
        ultimo = d[d.length - 1].id;
        if (d.length < 1000) break;
    }
    return todas;
}

/** Movimentações de um conjunto de OS (lotes de ordem_id). */
async function movsDasOrdens(ids) {
    const movs = [];
    for (let i = 0; i < ids.length; i += 80) {
        const lote = ids.slice(i, i + 80).map(x => encodeURIComponent(x)).join(",");
        let ultimo = 0;
        while (true) { // keyset por id dentro do lote (pode passar de 1000)
            const d = await rest(`movimentacoes?select=*&ordem_id=in.(${lote})&id=gt.${ultimo}&order=id&limit=1000`);
            if (!d.length) break;
            movs.push(...d);
            ultimo = d[d.length - 1].id;
            if (d.length < 1000) break;
        }
    }
    return movs;
}

const COLUNAS = [
    "ID_OS", "CLIENTE", "LOGIN", "CIDADE", "BAIRRO", "ASSUNTO", "SETOR", "TECNICO_RESPONSAVEL",
    "DATA_ABERTURA", "DATA_FECHAMENTO", "STATUS_ATUAL",
    "EVENTO", "DATA_MOV", "OPERADOR", "COLABORADOR_RESPONSAVEL", "EQUIPE",
    "DIAGNOSTICO", "PROXIMA_TAREFA", "STATUS_MOV", "MENSAGEM", "HISTORICO"
];

const csvCampo = v => {
    if (v == null) return '""';
    const s = typeof v === "string" ? v : (typeof v === "object" ? JSON.stringify(v) : String(v));
    return '"' + s.replace(/"/g, '""') + '"';
};

(async () => {
    const { ano, mes } = mesAlvo();
    const ini = `${ano}-${p2(mes)}-01`;
    const fim = mes === 12 ? `${ano + 1}-01-01` : `${ano}-${p2(mes + 1)}-01`;
    const rotulo = `${ano}-${p2(mes)} (${MESES[mes - 1]})`;
    console.log(`Arquivando ${rotulo} — fechamentos de ${ini} a ${fim} (exclusive)...`);

    const [evento, operador, diagnostico, colaborador] = await Promise.all([
        mapaRef("ref_eventos", "DESCRIAAO"),
        mapaRef("ref_operadores", "NOME"),
        mapaRef("ref_diagnosticos", "DESCRIAAO"),
        mapaRef("ref_colaboradores_responsaveis", "NOME")
    ]);
    console.log(`  refs: ${evento.size} eventos, ${operador.size} operadores, ${diagnostico.size} diagnósticos, ${colaborador.size} colaboradores.`);

    const ordens = await ordensDoMes(ini, fim);
    console.log(`  ${ordens.length} ordens finalizadas no mês.`);
    if (!ordens.length) { console.log("  nada a arquivar."); return; }

    const movs = await movsDasOrdens(ordens.map(o => o.id));
    console.log(`  ${movs.length} movimentações.`);

    const movsPorOrdem = new Map();
    for (const m of movs) { if (!movsPorOrdem.has(m.ordem_id)) movsPorOrdem.set(m.ordem_id, []); movsPorOrdem.get(m.ordem_id).push(m); }

    const linhas = [COLUNAS.join(",")];
    const nome = chave => operador.get(String(chave)) || "";
    for (const o of ordens.sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
        const daOs = [
            o.id, o.cliente, o.login, o.cidade, o.bairro, o.assunto, o.setor, nome(o.tecnico_responsavel),
            o.data_abertura, o.data_fechamento, o.status_atual
        ];
        const ms = (movsPorOrdem.get(o.id) || []).sort((a, b) => String(a.data || "").localeCompare(String(b.data || "")));
        const emitir = m => linhas.push([
            ...daOs,
            m ? (evento.get(String(m.evento)) || "") : "", m ? m.data : "", m ? nome(m.operador) : "",
            m ? (colaborador.get(String(m.colaborador_responsavel)) || "") : "", m ? m.equipe : "",
            m ? (diagnostico.get(String(m.diagnostico)) || "") : "", m ? m.proxima_tarefa : "", m ? m.status : "",
            m ? m.mensagem : "", m ? m.historico : ""
        ].map(csvCampo).join(","));
        if (ms.length) ms.forEach(emitir); else emitir(null);
    }

    const pasta = path.join(BASE, String(ano), `${p2(mes)} - ${MESES[mes - 1]}`);
    fs.mkdirSync(pasta, { recursive: true });
    const arquivo = path.join(pasta, `Relatório ${rotulo}.csv`);
    fs.writeFileSync(arquivo, "\uFEFF" + linhas.join("\r\n"), "utf8");   // BOM: Excel abre acentos certo

    const mb = (fs.statSync(arquivo).size / 1048576).toFixed(2);
    console.log(`\n✓ CSV salvo: ${arquivo}`);
    console.log(`  ${ordens.length} OS, ${movs.length} movimentações, ${linhas.length - 1} linhas, ${mb} MB.`);
})().catch(e => { console.error("FALHOU:", e.message); process.exit(1); });
