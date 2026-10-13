/**
 * ==========================================================
 * Robô de Ordens (COP-Analytics) — IXC Query Builder -> Supabase
 * ==========================================================
 * Mantém um navegador ABERTO e logado (perfil C:\cop-robo\perfil). Você
 * loga 1x por dia; o robô, às 7h e 16h, abre uma aba escondida na
 * MESMA sessão (sem segunda sessão, sem te derrubar do IXC), puxa as
 * linhas recentes da visão do Query Builder pelo endpoint que a própria
 * tela usa (get-query-data) e grava em ordens/movimentacoes do Supabase,
 * do mesmo jeito e com a mesma regra de não-duplicar que a importação por
 * Excel do site (chaveMovimentacao em js/services/armazenamento.js).
 *
 * Não baixa as ~588 mil linhas do ano toda hora: pede ordenado pela data
 * (mais novo primeiro) e para nos últimos JANELA_DIAS dias.
 *
 * Modos:
 *   node --env-file=.env robo.js --simular    -> puxa do IXC e MOSTRA o que
 *        achou (status, datas, amostra), SEM gravar. Não precisa da chave.
 *   node --env-file=.env robo.js --uma-vez     -> uma passada completa (grava).
 *   node --env-file=.env robo.js               -> fica rodando (rodadas às 7h e 16h).
 */

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const PERFIL = path.join(__dirname, "perfil");
// usa só o domínio do IXC_URL (ignora /adm.php, /app/login ou qualquer caminho no fim)
const BASE = (() => {
    try { return new URL(process.env.IXC_URL || "https://ixc.amointernet.com.br").origin; }
    catch { return "https://ixc.amointernet.com.br"; }
})();
const QB = BASE + "/app/query-builder/index";
const IXC_USUARIO = process.env.IXC_USUARIO || "";
const IXC_SENHA = process.env.IXC_SENHA || "";
const URL_DADOS = BASE + "/api-module/query-builder/consulta/get-query-data";
const IXC_HOME = BASE + "/adm.php";   // sistema principal do IXC (onde você trabalha e onde o pulso bate)
const SUPA_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY || "";
const JANELA_DIAS = Number(process.env.JANELA_DIAS || 3);

const TAM_PAGINA = 2000;      // linhas por pedido ao IXC
const MAX_PAGINAS = 80;       // trava de segurança (~160 mil linhas)
const TAM_LOTE_SUPA = 500;
const COL_DATA = 14;          // índice da coluna su_oss_chamado_mensagem_data (ordenação)
// Rodadas automáticas só nesses horários (hora do PC). Cada rodada prende a
// sessão do IXC por alguns minutos (a puxada do pré-agendamento é pesada) e
// trava a tela de quem usa a janela; puxada extra = botão "Atualizar banco".
const HORARIOS_RODADA = [7, 16];
const PULSO_MS = 5 * 60 * 1000;   // mantém a sessão viva a cada 5 min (auto-refresh interno)

// Só a visão de ORDENS entra no Supabase (ordens/movimentacoes) por ora.
// PRÉ AGENDAMENTO (529) fica de fora até definirmos onde entra.
const VISOES_PARA_SINCRONIZAR = ["343"];

// Publicação automática da Agenda IA (dia seguinte), às PUBLICAR_HORA. Roda
// aqui no PC porque o Edge Function da Supabase (free) não aguenta o volume
// (WORKER_RESOURCE_LIMIT). Baixa o motor/módulos do próprio site e usa o
// mesmo PublicarAgenda.publicarAgenda — que nunca sobrescreve publicação manual.
const PUBLICAR_AGENDA = true;
const PUBLICAR_HORA = 16;   // 16h no horário do PC (Brasília)
const SITE_BASE = "https://murillo-calazans.github.io/COP-Analythics";
const MODULOS_AGENDA = ["js/agendador/motor.js", "js/agendador/escala-dia.js", "js/agendador/agenda-publicacao.js", "js/agendador/publicar-agenda.js"];
let ultimaAgendaPublicada = null;
// Pré-agendamento: retrato das OS em aberto (visão 529) -> tabela os_pendentes,
// que o Agendador lê. "" desliga. Puxa TODAS as abertas (sem janela de data).
const VISAO_PENDENTES = "529";

// alias da coluna (vinda do IXC) -> cabeçalho do .xlsx que o Agendador espera
// (ver resolverColunas em js/agendador/motor.js). Assim a tabela os_pendentes
// fica no MESMO formato do upload manual, sem conversão do lado do Agendador.
const PARA_PLANILHA = {
    su_oss_chamado_mensagem_su_oss_chamado_id: "ID OS",
    su_oss_chamado_cliente_razao: "CLIENTE",
    su_oss_chamado_cliente_contrato_status_internet: "STATUS ACESSO",
    su_oss_chamado_radusuarios_login: "LOGIN",
    su_oss_chamado_mensagem_id_tecnico: "COLABORADOR RESPONSAVEL",
    su_oss_chamado_mensagem_id_operador: "ID OPERADOR",
    su_oss_chamado_mensagem_su_equipe_descricao: "EQUIPE",
    su_oss_chamado_mensagem_id_evento: "EVENTO",
    su_oss_chamado_mensagem_status: "STATUS",
    su_oss_chamado_mensagem_su_oss_respostas_titulo: "RESPOSTA PADRAO",
    su_oss_chamado_su_diagnostico_descricao: "DIAGNOSTICO",
    su_oss_chamado_mensagem_wfl_tarefa_descricao: "PRAXIMA TAREFA",
    su_oss_chamado_mensagem_mensagem: "MENSAGEM",
    su_oss_chamado_su_oss_assunto_assunto: "ASSUNTO",
    su_oss_chamado_mensagem_data: "DATA",
    su_oss_chamado_mensagem_su_oss_chamado_data_agenda: "AGENDAMENTO",
    su_oss_chamado_mensagem_su_oss_chamado_data_abertura: "DATA/HORA ABERTURA",
    su_oss_chamado_mensagem_historico: "HISTARICO",
    su_oss_chamado_cliente_contrato_contrato: "CONTRATO",
    su_oss_chamado_cidade_nome: "CIDADE",
    su_oss_chamado_mensagem_su_oss_chamado_bairro: "BAIRRO",
    su_oss_chamado_mensagem_su_oss_chamado_prioridade: "PRIORIDADE",
    su_oss_chamado_mensagem_su_oss_chamado_latitude: "LATITUDE",
    su_oss_chamado_mensagem_su_oss_chamado_longitude: "LONGITUDE"
};

// Código do status (su_oss_chamado_mensagem.status) -> nome que a planilha
// do IXC mostra (e que o site já usa). Código desconhecido é avisado no log.
const STATUS_IXC = {
    A: "Aberta", EN: "Encaminhada", AN: "Análise", AS: "Assumida",
    AG: "Agendada", DS: "Deslocamento", EX: "Execução", F: "Finalizada",
    AAG: "Aguardando agendamento", RAG: "Aguardando agendamento"
};
const statusDesconhecidos = new Set();

const log = m => console.log(`[${new Date().toLocaleString("pt-BR")}] ${m}`);

// ---------- conversões (espelham DataEngine/paraData do site) ----------

const vazio = v => v === "" || v === undefined || v === null;
const texto = v => (vazio(v) ? null : String(v));

function statusNome(cod) {
    const c = texto(cod);
    if (c === null) return null;
    if (STATUS_IXC[c]) return STATUS_IXC[c];
    statusDesconhecidos.add(c);
    return c;
}

// "dd/mm/aaaa HH:ii:ss" -> Date no horário de Brasília (-03:00)
function paraData(v) {
    const m = String(v ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/);
    if (!m) return null;
    const [, d, mes, a, h, min, s] = m;
    if (a === "0000") return null;
    const data = new Date(`${a}-${mes}-${d}T${h}:${min}:${s}-03:00`);
    return isNaN(data.getTime()) ? null : data;
}

function converterLinha(r) {
    const hist = texto(r.su_oss_chamado_mensagem_historico);
    return {
        id: texto(r.su_oss_chamado_mensagem_su_oss_chamado_id),
        ordem: {
            cliente: texto(r.su_oss_chamado_cliente_razao),
            login: texto(r.su_oss_chamado_radusuarios_login),
            cidade: texto(r.su_oss_chamado_cidade_nome),
            bairro: texto(r.su_oss_chamado_mensagem_su_oss_chamado_bairro),
            assunto: texto(r.su_oss_chamado_su_oss_assunto_assunto)
        },
        mov: {
            operador: texto(r.su_oss_chamado_mensagem_id_operador),
            colaborador_responsavel: texto(r.su_oss_chamado_mensagem_id_tecnico),
            equipe: texto(r.su_oss_chamado_mensagem_su_equipe_descricao),
            evento: texto(r.su_oss_chamado_mensagem_id_evento),
            diagnostico: texto(r.su_oss_chamado_su_diagnostico_descricao),
            proxima_tarefa: texto(r.su_oss_chamado_mensagem_wfl_tarefa_descricao),
            status: statusNome(r.su_oss_chamado_mensagem_status),
            resposta_padrao: texto(r.su_oss_chamado_mensagem_su_oss_respostas_titulo),
            mensagem: texto(r.su_oss_chamado_mensagem_mensagem) ?? "",
            historico: hist === null ? [] : [hist],
            data: paraData(r.su_oss_chamado_mensagem_data)
        }
    };
}

// mesma "impressão digital" de chaveMovimentacao() do site
function chaveMovimentacao(m) {
    const data = m.data ? Math.round(new Date(m.data).getTime() / 1000) : m.data;
    return [data, m.evento, m.operador, m.status, m.diagnostico, m.resposta_padrao]
        .map(v => (vazio(v) ? "" : String(v))).join("|");
}

// mesma regra de OrdemServico.adicionarMovimentacao, sobre TODAS as movs da OS
function calcularResumo(movs) {
    const r = { dataAbertura: null, dataFechamento: null, statusAtual: null, tecnico: null };
    const ord = [...movs].sort((a, b) => (a.data ? new Date(a.data) : 0) - (b.data ? new Date(b.data) : 0));
    for (const m of ord) {
        const data = m.data ? new Date(m.data) : null;
        if (data) {
            if (!r.dataAbertura || data < r.dataAbertura) r.dataAbertura = data;
            if (!r.dataFechamento || data >= r.dataFechamento) {
                r.dataFechamento = data; r.statusAtual = m.status ?? r.statusAtual; r.tecnico = m.operador ?? r.tecnico;
            }
        } else if (r.statusAtual === null) { r.statusAtual = m.status; r.tecnico = m.operador; }
    }
    return r;
}

const normalizar = t => String(t).normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toUpperCase();
function resolverSetor(operadores, tecnico) {
    if (vazio(tecnico)) return null;
    const linha = operadores.get(String(tecnico));
    if (!linha) return String(tecnico);
    const col = Object.keys(linha).find(k => normalizar(k) === "DESCRIAAO");
    return col ? linha[col] : String(tecnico);
}

// ---------- Supabase (REST) ----------

async function supabase(metodo, caminho, corpo, prefer) {
    const r = await fetch(`${SUPA_URL}/rest/v1/${caminho}`, {
        method: metodo,
        headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, "Content-Type": "application/json",
            ...(prefer ? { Prefer: prefer } : {}) },
        body: corpo === undefined ? undefined : JSON.stringify(corpo)
    });
    if (!r.ok) throw new Error(`Supabase ${metodo} ${caminho.split("?")[0]}: ${r.status} ${await r.text()}`);
    const t = await r.text();
    return t ? JSON.parse(t) : null;
}
async function buscarTodas(tabela, colunas, colunaOrdem, filtro = "") {
    const linhas = []; let ultimo = null;
    while (true) {
        const depois = ultimo === null ? "" : `&${colunaOrdem}=gt.${encodeURIComponent(ultimo)}`;
        const pg = await supabase("GET", `${tabela}?select=${colunas}&order=${colunaOrdem}&limit=1000${filtro}${depois}`);
        if (pg.length === 0) break;
        linhas.push(...pg); ultimo = pg[pg.length - 1][colunaOrdem];
    }
    return linhas;
}
const emLotes = (l, n) => { const o = []; for (let i = 0; i < l.length; i += n) o.push(l.slice(i, i + n)); return o; };
const listaIn = ids => `(${ids.map(id => `"${id}"`).join(",")})`;

// ---------- puxar linhas do IXC (dentro da sessão logada) ----------

const p2 = n => String(n).padStart(2, "0");
const ymd = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

/** Ajusta o molde cirurgicamente (sem reescrever o campo json gigante):
 *  troca start/length/draw e ESTREITA o filtro data_final pro período recente.
 *  O IXC ignora a ordenação por DataTables, então o jeito de pegar só os
 *  recentes é filtrar no próprio pedido: trocamos as duas datas do BETWEEN
 *  (ano inteiro) por [hoje-janela, hoje]. Datas vêm codificadas (espaço=+, :=%3A). */
function montarPayload(molde, start, length, draw, janelaDias) {
    let p = molde.payload;
    p = p.replace(/(^|&)start=\d+/, `$1start=${start}`);
    p = p.replace(/(^|&)length=\d+/, `$1length=${length}`);
    p = p.replace(/(^|&)draw=\d+/, `$1draw=${draw}`);

    // janelaDias só pra 343 (ordens fechadas): estreita o filtro de data pro
    // período recente. A 529 (pré-agendamento) passa janelaDias falsy e NÃO
    // mexe nas datas — precisa de TODAS as OS em aberto, não só as recentes.
    if (janelaDias) {
        const ini = ymd(new Date(Date.now() - janelaDias * 86400000));
        const fim = ymd(new Date());
        p = p.replace(/\d{4}-\d{2}-\d{2}\+00%3A00%3A00/g, `${ini}+00%3A00%3A00`);
        p = p.replace(/\d{4}-\d{2}-\d{2}\+23%3A59%3A59/g, `${fim}+23%3A59%3A59`);
    }
    return p;
}

/** Puxa as linhas da visão JÁ filtrada pelo período recente (data_final nos
 *  últimos janelaDias dias), paginando até o fim. O corte é feito no servidor
 *  (no filtro do pedido), então aqui é só juntar as páginas. */
async function puxarRecentes(pagina, molde, janelaDias) {
    const linhas = [];
    let total = null;

    for (let i = 0; i < MAX_PAGINAS; i++) {
        const body = montarPayload(molde, i * TAM_PAGINA, TAM_PAGINA, i + 1, janelaDias);
        const txt = await pagina.evaluate(async ({ url, body }) => {
            const r = await fetch(url, {
                method: "POST", credentials: "include",
                headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest" },
                body
            });
            return { status: r.status, texto: await r.text() };
        }, { url: URL_DADOS, body });

        if (txt.status === 401 || /\/login/.test(txt.texto)) throw new Error("SESSAO_CAIU");
        let j; try { j = JSON.parse(txt.texto); } catch { throw new Error("resposta não-JSON do IXC (sessão caiu?)"); }
        const bloco = j.data || j.result || [];
        if (i === 0) total = j.recordsTotal ?? null;

        if (i === 0) { // diagnóstico: confirma que o filtro de data reduziu o total
            const ds = bloco.map(r => r.su_oss_chamado_mensagem_data);
            try {
                fs.writeFileSync(path.join(__dirname, "debug.txt"),
                    `status ${txt.status} | recordsTotal ${j.recordsTotal} | linhas na 1ª pág ${bloco.length}\n` +
                    `amostra de datas: ${ds.slice(0, 10).join(" | ")}\n`, "utf8");
            } catch {}
        }

        if (bloco.length === 0) break;
        linhas.push(...bloco);
        if (linhas.length >= (total ?? Infinity)) break;
    }
    return linhas;
}

// ---------- processar + gravar ----------

async function processarEGravar(linhasBrutas, { simular }) {
    const novas = new Map();
    let semId = 0;
    for (const lb of linhasBrutas) {
        const { id, ordem, mov } = converterLinha(lb);
        if (id === null) { semId++; continue; }
        if (!novas.has(id)) novas.set(id, { ...ordem, movs: [] });
        novas.get(id).movs.push(mov);
    }
    const ids = [...novas.keys()];

    if (simular) {
        const dist = {};
        for (const o of novas.values()) for (const m of o.movs) dist[m.status] = (dist[m.status] || 0) + 1;
        const datas = linhasBrutas.map(r => paraData(r.su_oss_chamado_mensagem_data)).filter(Boolean).sort((a, b) => a - b);
        const resumo = [
            `${linhasBrutas.length} linhas | ${ids.length} OS | período ${datas[0]?.toLocaleString("pt-BR")} → ${datas.at(-1)?.toLocaleString("pt-BR")}`,
            `status: ${JSON.stringify(dist)}`,
            statusDesconhecidos.size ? `⚠ status SEM tradução: ${[...statusDesconhecidos].join(", ")}` : `tradução de status: 100% ok`
        ];
        resumo.forEach(l => log("  " + l));
        // salva num arquivo pra conferência (não precisa copiar do terminal)
        try { fs.writeFileSync(path.join(__dirname, "simular.txt"),
            `Simulação ${new Date().toLocaleString("pt-BR")}\n` + resumo.join("\n") + "\n", "utf8"); } catch {}
        return { inseridas: 0, ignoradas: 0, ordens: ids.length };
    }

    // existentes no Supabase (pra não duplicar e pra mesclar o resumo da OS)
    const ordensExist = new Map(), movsExist = new Map();
    for (const lote of emLotes(ids, 150)) {
        for (const o of await buscarTodas("ordens", "id,cliente,login,cidade,bairro,assunto,data_abertura,data_fechamento,status_atual,tecnico_responsavel", "id", `&id=in.${listaIn(lote)}`))
            ordensExist.set(o.id, o);
        for (const m of await buscarTodas("movimentacoes", "id,ordem_id,operador,evento,status,diagnostico,resposta_padrao,data", "id", `&ordem_id=in.${listaIn(lote)}`)) {
            if (!movsExist.has(m.ordem_id)) movsExist.set(m.ordem_id, []);
            movsExist.get(m.ordem_id).push({ ...m, data: m.data ? new Date(m.data) : null });
        }
    }
    const operadores = new Map((await buscarTodas("ref_operadores", "chave,dados", "chave")).map(l => [l.chave, l.dados]));

    const linhasOrdens = [], linhasMovs = [];
    let ignoradas = 0;
    for (const [id, nova] of novas) {
        const existentes = movsExist.get(id) ?? [];
        const vistas = new Set(existentes.map(chaveMovimentacao));
        const novasDaOs = [];
        for (const m of nova.movs) {
            const ch = chaveMovimentacao(m);
            if (vistas.has(ch)) { ignoradas++; continue; }
            vistas.add(ch); novasDaOs.push(m);
            linhasMovs.push({ ordem_id: id, ...m });
        }
        const antiga = ordensExist.get(id) ?? {};
        const existNorm = existentes.map(m => ({ data: m.data, status: m.status, operador: m.operador }));
        const resumo = calcularResumo([...existNorm, ...novasDaOs]);
        // data_abertura: menor entre a já salva e a calculada (só temos movs recentes)
        const abExist = antiga.data_abertura ? new Date(antiga.data_abertura) : null;
        const dataAbertura = [abExist, resumo.dataAbertura].filter(Boolean).sort((a, b) => a - b)[0] ?? null;
        linhasOrdens.push({
            id, cliente: antiga.cliente ?? nova.cliente, login: antiga.login ?? nova.login,
            cidade: antiga.cidade ?? nova.cidade, bairro: antiga.bairro ?? nova.bairro, assunto: antiga.assunto ?? nova.assunto,
            data_abertura: dataAbertura, data_fechamento: resumo.dataFechamento,
            status_atual: resumo.statusAtual, tecnico_responsavel: resumo.tecnico,
            setor: resolverSetor(operadores, resumo.tecnico), atualizado_em: new Date()
        });
    }

    for (const lote of emLotes(linhasOrdens, TAM_LOTE_SUPA))
        await supabase("POST", "ordens?on_conflict=id", lote, "resolution=merge-duplicates,return=minimal");
    for (const lote of emLotes(linhasMovs, TAM_LOTE_SUPA))
        await supabase("POST", "movimentacoes", lote, "return=minimal");

    if (statusDesconhecidos.size) log(`  ⚠ status SEM tradução: ${[...statusDesconhecidos].join(", ")}`);
    return { inseridas: linhasMovs.length, ignoradas, ordens: ids.length };
}

// ---------- sessão / navegador ----------

async function estaLogado(pagina) {
    // vai pro Query Builder; se continuar logado, fica lá; se não, o IXC
    // redireciona pra alguma tela de /login (admin ou assinante).
    await pagina.goto(QB, { waitUntil: "domcontentloaded", timeout: 40000 }).catch(() => {});
    await pagina.waitForTimeout(2500);
    return !/\/login/.test(pagina.url());
}

/**
 * Tenta logar sozinho com usuário/senha do .env (o dispositivo já é confiável,
 * então não cai no 2FA fora da renovação mensal). Login do IXC é em 2 etapas,
 * com web components — digito no teclado (eventos reais) pra o campo aceitar.
 * Devolve true se saiu da tela de login. Nunca lança — se não der, cai no manual.
 */
async function tentarLoginAutomatico(pagina) {
    if (!IXC_USUARIO || !IXC_SENHA) return false;
    try {
        await pagina.goto(QB, { waitUntil: "domcontentloaded", timeout: 40000 }).catch(() => {});
        await pagina.waitForTimeout(2500);
        if (/central_assinante/.test(pagina.url())) {
            await pagina.goto(QB, { waitUntil: "domcontentloaded" }).catch(() => {});
            await pagina.waitForTimeout(2000);
        }
        if (!/\/login/.test(pagina.url())) return true; // já estava logado

        // limpa o campo antes de digitar (ele pode já vir preenchido/salvo —
        // digitar por cima dobra o valor e dá "senha incorreta").
        const limparEDigitar = async (campo, texto) => {
            await campo.click({ force: true }).catch(() => {});
            await pagina.keyboard.press("Control+A").catch(() => {});
            await pagina.keyboard.press("Delete").catch(() => {});
            await pagina.keyboard.type(texto, { delay: 30 }).catch(() => {});
        };

        // etapa 1: e-mail (se estiver editável) + "Continuar"
        const email = pagina.locator('input[name=username]').first();
        if (await email.count().catch(() => 0) && await email.isEditable().catch(() => false)) {
            await limparEDigitar(email, IXC_USUARIO);
        }
        const continuar = pagina.getByText("Continuar", { exact: true }).first();
        if (await continuar.count().catch(() => 0)) { await continuar.click().catch(() => {}); await pagina.waitForTimeout(2500); }

        // etapa 2: senha (limpa e digita tecla a tecla) + "Entrar"
        const senha = pagina.locator('input[type=password]').first();
        await senha.waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
        if (!(await senha.count().catch(() => 0))) return false;
        await limparEDigitar(senha, IXC_SENHA);
        const submeter = async () => {
            const entrar = pagina.getByText("Entrar", { exact: true }).first();
            if (await entrar.count().catch(() => 0)) await entrar.click().catch(() => {});
            else await pagina.keyboard.press("Enter").catch(() => {});
        };
        await submeter();

        // O IXC mostra o aviso vermelho "Já existe uma sessão ativa, tente
        // novamente para acessar!" quando a sessão está presa noutro lugar — a
        // solução é RE-SUBMETER (é o seu "apertar Entrar de novo"). Isso NÃO é
        // senha errada, então pode repetir à vontade. Se for senha incorreta de
        // verdade, para na hora (evita bloquear a conta).
        for (let i = 0; i < 10 && /\/login/.test(pagina.url()); i++) {
            await pagina.waitForTimeout(2500);
            const txt = await pagina.evaluate(() => document.body ? document.body.innerText : "").catch(() => "");
            if (/senha incorret|senha inv[aá]lid|login incorret|usu[aá]rio ou senha/i.test(txt)) {
                log("IXC recusou a senha — vai pro login manual.");
                return false;
            }
            if (/j[aá] existe uma sess|sess[aã]o ativa|tente novamente/i.test(txt)) {
                log("IXC: 'sessão ativa, tente novamente' — re-submetendo...");
                const s2 = pagina.locator('input[type=password]').first();
                if (await s2.count().catch(() => 0) && await s2.isVisible().catch(() => false)) await limparEDigitar(s2, IXC_SENHA);
                await submeter();
            }
        }
        return !/\/login/.test(pagina.url());
    } catch (e) {
        log("Login automático não deu: " + e.message);
        return false;
    }
}

async function garantirLogin(pagina) {
    // entra pela rota do Query Builder: deslogado, o IXC manda pra tela de login
    // do ADMIN (/app/login). Ir direto em /app/login cai no portal do assinante.
    if (await estaLogado(pagina)) { log("Já logado."); return; }

    // 1º tenta logar sozinho (senha no .env). UMA tentativa só — se a senha
    // for recusada, não insiste (evita bloquear a conta) e cai no manual.
    log("Tentando login automático...");
    if (await tentarLoginAutomatico(pagina) && await estaLogado(pagina)) {
        log("Login automático OK.");
        return;
    }

    // fallback: pede login manual (caso típico: renovação do 2FA do mês)
    await pagina.bringToFront().catch(() => {});
    console.log("\n>> Login automático não concluiu (talvez o 2FA do mês). Entre no IXC na janela.");
    console.log(">> NÃO use a 'Central do Assinante' se aparecer — o robô te leva pra tela certa.");
    console.log(">> Assim que você entrar (sair da tela de login), o robô segue sozinho.\n");

    // espera você SAIR de qualquer tela de login (= logou). Se cair no portal
    // do assinante, reconduz pra rota do admin.
    while (true) {
        let url;
        try { url = pagina.url(); } catch { throw new Error("A janela foi fechada antes de logar."); }
        if (/central_assinante/.test(url)) { await pagina.goto(QB, { waitUntil: "domcontentloaded" }).catch(() => {}); await pagina.waitForTimeout(2000); continue; }
        if (!/\/login/.test(url)) break;
        await pagina.waitForTimeout(3000);
    }
    // confirma abrindo o Query Builder logado
    let tentativas = 0;
    while (!(await estaLogado(pagina))) { if (++tentativas > 20) throw new Error("não confirmou o login no Query Builder"); await pagina.waitForTimeout(3000); }
    log("Login detectado.");
}

/** Converte uma linha crua do IXC pro formato de planilha que o Agendador lê. */
function paraLinhaPlanilha(r) {
    const o = {};
    for (const [alias, header] of Object.entries(PARA_PLANILHA)) {
        let v = r[alias];
        if (alias === "su_oss_chamado_mensagem_status") v = statusNome(v) ?? v; // código -> nome
        o[header] = v === null || v === undefined ? "" : v;
    }
    return o;
}

/**
 * Pré-agendamento: puxa TODAS as OS em aberto (visão 529, sem janela de data)
 * e grava um RETRATO na tabela os_pendentes — apaga o retrato anterior e
 * insere o novo (OS já agendadas/fechadas saem sozinhas). O Agendador lê daí.
 */
async function sincronizarPendentes(pagina, moldes, simular) {
    if (!VISAO_PENDENTES) return;
    const molde = moldes.find(m => m.viewId === VISAO_PENDENTES);
    if (!molde) { log(`molde da visão ${VISAO_PENDENTES} (pré-agendamento) não encontrado em templates.json`); return; }

    log(`Pré-agendamento: visão ${VISAO_PENDENTES} "${molde.viewName}" — puxando OS em aberto...`);
    const linhas = await puxarRecentes(pagina, molde, null); // null = sem janela (todas)
    const dados = linhas.map(r => ({ dados: paraLinhaPlanilha(r) }));
    const idsOs = new Set(linhas.map(r => r.su_oss_chamado_mensagem_su_oss_chamado_id)).size;

    if (simular) { log(`  (simulação) ${linhas.length} eventos, ${idsOs} OS em aberto — não gravou.`); return; }

    // retrato novo: apaga tudo e reinsere
    await supabase("DELETE", "os_pendentes?id=gt.0", undefined, "return=minimal");
    for (const lote of emLotes(dados, TAM_LOTE_SUPA)) await supabase("POST", "os_pendentes", lote, "return=minimal");
    log(`  os_pendentes atualizada: ${linhas.length} eventos, ${idsOs} OS em aberto.`);
}

/** Baixa os módulos do agendador do site e carrega num objeto (IIFEs: this=ctx). */
async function carregarModulosAgenda() {
    const ctx = {};
    for (const arq of MODULOS_AGENDA) {
        const r = await fetch(`${SITE_BASE}/${arq}?t=${Date.now()}`);
        if (!r.ok) throw new Error(`baixar ${arq}: ${r.status}`);
        new Function(await r.text()).call(ctx);
    }
    return ctx;
}

function amanhaIso() {
    const d = new Date(); d.setDate(d.getDate() + 1);
    const p = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Publica a Agenda IA de amanhã, uma vez por dia, a partir de PUBLICAR_HORA. */
async function publicarAgendaSeNaHora() {
    if (!PUBLICAR_AGENDA || !SUPA_KEY) return;
    if (new Date().getHours() < PUBLICAR_HORA) return;
    const alvo = amanhaIso();
    if (ultimaAgendaPublicada === alvo) return;
    try {
        const ctx = await carregarModulosAgenda();
        const r = await ctx.PublicarAgenda.publicarAgenda({
            url: SUPA_URL, chave: SUPA_KEY, data: alvo,
            mods: { Motor: ctx.Motor, EscalaDia: ctx.EscalaDia, AgendaPublicacao: ctx.AgendaPublicacao }
        });
        ultimaAgendaPublicada = alvo;
        log(`Agenda IA ${r.data}: ${r.status}` +
            (r.agendadas != null ? ` (${r.agendadas} OS, ${r.equipes} equipes)` : "") +
            (r.motivo ? ` — ${r.motivo}` : "") + ".");
    } catch (e) {
        log("Falha ao publicar a Agenda IA: " + e.message);
    }
}

async function umaPassada(pagina, moldes, simular) {
    for (const id of VISOES_PARA_SINCRONIZAR) {
        const molde = moldes.find(m => m.viewId === id);
        if (!molde) { log(`molde da visão ${id} não encontrado em templates.json`); continue; }
        log(`Visão ${id} "${molde.viewName}" (total ${molde.recordsTotal}): puxando últimos ${JANELA_DIAS} dia(s)...`);
        const linhas = await puxarRecentes(pagina, molde, JANELA_DIAS);
        const r = await processarEGravar(linhas, { simular });
        if (!simular) log(`  gravado: ${r.ordens} OS, ${r.inseridas} movimentação(ões) nova(s), ${r.ignoradas} já existiam.`);
    }
    await sincronizarPendentes(pagina, moldes, simular);
}

async function principal() {
    const args = process.argv.slice(2);
    const simular = args.includes("--simular");
    const umaVez = args.includes("--uma-vez");

    if (!fs.existsSync(path.join(__dirname, "templates.json"))) throw new Error("templates.json não encontrado — rode capturar-dados.js antes.");
    const moldes = JSON.parse(fs.readFileSync(path.join(__dirname, "templates.json"), "utf8"));

    if (!simular && !SUPA_KEY) throw new Error("SUPABASE_SERVICE_KEY vazia no .env — preencha, ou use --simular pra testar sem gravar.");

    // ctx/pagina são "vivos": se a aba ou o navegador forem fechados (ou o
    // Chromium travar), garantirNavegador() reabre em vez de o robô ficar preso
    // com "Target page, context or browser has been closed".
    let ctx = null, ctxFechado = true, pagina = null;

    const prepararPagina = async p => {
        // se o aviso de "sessão ativa" vier como caixa de diálogo do navegador, aceita sozinho
        p.on("dialog", d => d.accept().catch(() => {}));
        // registra no console quando a aba usada pelo robô morre (pra saber a causa)
        p.on("close", () => log("A aba usada pelo robô foi fechada."));
        p.on("crash", () => log("A aba usada pelo robô travou (crash)."));
        await p.bringToFront().catch(() => {});
        await garantirLogin(p);
        // deixa a janela no sistema principal do IXC pra você trabalhar; o robô
        // puxa os dados por trás (fetch), sem mexer nesta tela.
        await p.goto(IXC_HOME, { waitUntil: "domcontentloaded" }).catch(() => {});
        await p.bringToFront().catch(() => {});
        return p;
    };

    const garantirNavegador = async () => {
        if (ctxFechado) {
            if (ctx) log("Navegador foi fechado — reabrindo...");
            ctx = await chromium.launchPersistentContext(PERFIL, {
                headless: false, viewport: null,   // usa o tamanho real da janela (maximizada)
                args: ["--start-maximized", "--no-first-run", "--no-default-browser-check", "--hide-crash-restore-bubble"]
            });
            ctxFechado = false;
            ctx.on("close", () => { ctxFechado = true; });
            // dá um tempo pro navegador restaurar abas antigas (ex.: a raiz "/"), mantém UMA
            // e fecha as extras (não dá pra fechar todas: fecha o navegador junto).
            await new Promise(r => setTimeout(r, 1500));
            const p = ctx.pages()[0] || await ctx.newPage();
            for (const extra of ctx.pages()) if (extra !== p) await extra.close().catch(() => {});
            pagina = await prepararPagina(p);
        } else if (!pagina || pagina.isClosed()) {
            log("A aba do IXC foi fechada — abrindo outra...");
            pagina = await prepararPagina(ctx.pages().find(p => !p.isClosed()) || await ctx.newPage());
        }
        return pagina;
    };
    const fechouNavegador = e => /has been closed|Target closed|browser has disconnected/i.test(e && e.message || "");

    await garantirNavegador();

    let emExecucao = false;  // trava: não deixa a rodada agendada e um comando rodarem juntos
    const rodar = async () => {
        if (emExecucao) return false;
        emExecucao = true;
        try { await garantirNavegador(); await umaPassada(pagina, moldes, simular); await publicarAgendaSeNaHora(); }
        catch (e) {
            if (e.message === "SESSAO_CAIU") { log("Sessão caiu — faça login na janela."); await garantirLogin(pagina).catch(() => {}); }
            else if (fechouNavegador(e)) log("Navegador/aba fechou durante a rodada — reabro na próxima.");
            else log("ERRO: " + e.message);
        } finally { emExecucao = false; }
        return true;
    };

    await rodar();

    if (simular || umaVez) { await ctx.close(); process.exit(0); }

    // Comandos sob demanda: o botão "Atualizar banco" no COP-Analytics (só
    // admin/editor) insere um pedido em robo_comandos; aqui a gente checa a
    // cada ~30s e, se tiver pedido 'pendente', atualiza na hora.
    const verificarComandos = async () => {
        if (emExecucao) return;
        let cmd;
        try {
            const pend = await supabase("GET", "robo_comandos?status=eq.pendente&order=solicitado_em.asc&limit=1");
            if (!pend || !pend.length) return;
            cmd = pend[0];
        } catch { return; } // sem rede/tabela: ignora

        emExecucao = true;
        try {
            await supabase("PATCH", `robo_comandos?id=eq.${cmd.id}`, { status: "processando" }, "return=minimal");
            log(`Comando #${cmd.id} de ${cmd.solicitado_por || "?"} — atualizando sob demanda...`);
            try { await garantirNavegador(); await umaPassada(pagina, moldes, false); }
            catch (e) {
                if (!fechouNavegador(e)) throw e;
                // aba/navegador fechou no meio: reabre e tenta mais uma vez
                await garantirNavegador();
                await umaPassada(pagina, moldes, false);
            }
            await supabase("PATCH", `robo_comandos?id=eq.${cmd.id}`, { status: "concluido", processado_em: new Date(), resultado: { ok: true } }, "return=minimal");
            log("Comando concluído.");
        } catch (e) {
            await supabase("PATCH", `robo_comandos?id=eq.${cmd.id}`, { status: "erro", processado_em: new Date(), resultado: { erro: e.message } }, "return=minimal").catch(() => {});
            if (e.message === "SESSAO_CAIU") { log("Sessão caiu durante o comando — faça login na janela."); await garantirLogin(pagina).catch(() => {}); }
            else log("Erro no comando: " + e.message);
        } finally { emExecucao = false; }
    };

    // auto-refresh interno: mantém a sessão do SISTEMA PRINCIPAL do IXC (/adm.php)
    // viva, e avisa/reconecta se cair. Sem extensão, sem recarregar sua tela.
    const pulso = async () => {
        if (emExecucao) return;
        emExecucao = true;
        try {
            await garantirNavegador();   // se fecharam a aba/janela, reabre aqui mesmo
            const r = await pagina.evaluate(async url => {
                const resp = await fetch(url, { credentials: "include" });
                return { status: resp.status, url: resp.url };
            }, IXC_HOME);
            if (r.status === 401 || /\/login/.test(r.url)) {
                log("Sessão do IXC caiu — faça login na janela.");
                await garantirLogin(pagina);
                await pagina.goto(IXC_HOME, { waitUntil: "domcontentloaded" }).catch(() => {});
            }
        } catch { /* ignora falha pontual de rede */ }
        finally { emExecucao = false; }
    };

    // agenda: confere a cada minuto se chegou um dos HORARIOS_RODADA e ainda
    // não rodou nele hoje. Se estiver ocupado (comando/pulso), tenta no minuto seguinte.
    const chaveRodada = d => `${ymd(d)} ${d.getHours()}h`;
    // a rodada da abertura já vale pelo horário, se o robô abriu dentro de um (ex.: 7h20)
    const rodadasFeitas = new Set([chaveRodada(new Date())]);
    const agenda = async () => {
        const agora = new Date();
        if (!HORARIOS_RODADA.includes(agora.getHours())) return;
        const chave = chaveRodada(agora);
        if (rodadasFeitas.has(chave)) return;
        if (await rodar()) rodadasFeitas.add(chave);
    };

    log(`Pronto. Rodadas automáticas às ${HORARIOS_RODADA.map(h => h + "h").join(" e ")} (extra: botão "Atualizar banco"). Pode minimizar a janela (não feche).`);
    setInterval(pulso, PULSO_MS);
    setInterval(agenda, 60 * 1000);
    setInterval(verificarComandos, 30 * 1000);
}

principal().catch(e => { log("FALHOU: " + e.message); process.exit(1); });
