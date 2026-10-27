/**
 * ==========================================================
 * Robô de Ordens (COP-Analytics) — IXC Query Builder -> Supabase
 * ==========================================================
 * Mantém um navegador ABERTO e logado (perfil C:\cop-robo\perfil). Você
 * loga 1x por dia; o robô, de hora em hora (7h às 19h), abre uma aba escondida na
 * MESMA sessão (sem segunda sessão, sem te derrubar do IXC), puxa as
 * linhas recentes da visão do Query Builder pelo endpoint que a própria
 * tela usa (get-query-data) e grava em ordens/movimentacoes do Supabase,
 * do mesmo jeito e com a mesma regra de não-duplicar que a importação por
 * Excel do site (chaveMovimentacao em js/services/armazenamento.js).
 *
 * Puxada incremental: cada rodada só pede o que mudou desde a anterior
 * (horário guardado em estado-puxadas.json, com FOLGA_MIN de sobra):
 *  - ordens (343): OS finalizadas desde a última puxada;
 *  - pré-agendamento (529): retrato COMPLETO na 1ª rodada do dia (7h); nas
 *    outras, só as movimentações novas das OS em aberto, e as OS que vieram
 *    finalizadas na 343 saem da lista.
 * Sem estado salvo (1ª vez), as ordens puxam os últimos JANELA_DIAS dias.
 *
 * Modos:
 *   node --env-file=.env robo.js --simular    -> puxa do IXC e MOSTRA o que
 *        achou (status, datas, amostra), SEM gravar. Não precisa da chave.
 *   node --env-file=.env robo.js --uma-vez     -> uma passada completa (grava).
 *   node --env-file=.env robo.js               -> fica rodando (de hora em hora, 7h às 19h).
 */

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { configurarDownloads } = require("./downloads");

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
// Rodadas automáticas: de hora em hora, das 7h às 19h (hora do PC). A rodada
// prende a sessão do IXC enquanto puxa, por isso é incremental (só o que mudou
// desde a anterior); a puxada completa do pré-agendamento fica só na 1ª do dia.
// Puxada extra = botão "Atualizar banco".
const HORARIOS_RODADA = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
const MINUTO_RODADA = 30;   // roda nos :30 de cada hora (7h30, 8h30…19h30), não na hora cheia
// Logins offline (rompimentos) mudam rápido — atualizam a CADA 30 min, das
// 7h30 às 18h30. Os :30 já vêm da rodada completa; uma mini-rodada só da
// offline cobre os :00. Fora dessa janela a offline não roda (mantém o último
// retrato), menos quando é pedido pelo botão "Atualizar banco".
const OFFLINE_INI_MIN = 7 * 60 + 30;    // 7h30
const OFFLINE_FIM_MIN = 18 * 60 + 30;   // 18h30
const minutosDoDia = d => d.getHours() * 60 + d.getMinutes();
const dentroJanelaOffline = d => { const m = minutosDoDia(d); return m >= OFFLINE_INI_MIN && m <= OFFLINE_FIM_MIN; };
const FOLGA_MIN = 10;   // cada janela começa 10 min antes do fim da anterior (o repetido é ignorado)
const ARQ_ESTADO = path.join(__dirname, "estado-puxadas.json");
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

// Base de clientes x CTO (site: Gestão de Clientes > Cadastro na CTO) -> tabela
// clientes_cto. Retrato completo 1x por dia (1ª rodada). "" desliga: preencha
// o id ou o nome da visão no .env (VISAO_CLIENTES_CTO=CTOs de Clientes).
const VISAO_CLIENTES_CTO = process.env.VISAO_CLIENTES_CTO || "";

// Logins OFFLINE (visão 551 "Login - Off": online=N) -> tabela clientes_offline.
// Retrato COMPLETO a CADA rodada (os offline mudam de hora em hora) — o site
// cruza com as OS em aberto pra detectar rompimento/queda de energia em massa.
// "" desliga. id OU nome da visão.
const VISAO_OFFLINE = process.env.VISAO_OFFLINE || "551";
// Coluna da visão (pelo alias do IXC) -> campo da tabela. 1ª regra que casa,
// sem repetir coluna. O log da rodada mostra o que escolheu.
const COLUNAS_OFFLINE = [
    ["login", [/_radusuarios_login$/i, /(^|_)login$/i]],
    ["cliente", [/razao/i, /fantasia/i]],
    ["bairro", [/(^|_)bairro$/i]],
    ["olt", [/radpop_radio_descricao$/i, /radpop_radio.*descricao/i, /(^|_)olt(_|$)/i]],
    ["cto", [/caixa_ftth_descricao$/i, /(^|_)cto(_|$)/i, /caixa/i]],
    ["interface", [/porta_fibra_interface$/i, /(^|_)interface$/i]],
    ["sinal_rx", [/sinal_rx$/i, /sinal.*rx/i]],
    ["causa", [/causa_ultima_queda$/i, /causa/i]],
    ["status_acesso", [/status_internet$/i, /(^|_)status$/i]],
    ["ultima_conexao", [/ultima_conexao_final$/i, /ultima_conexao/i]],
    ["latitude", [/(^|_)latitude$/i]],
    ["longitude", [/(^|_)longitude$/i]]
];
// Coluna da visão -> campo, pelo nome do alias (a 1ª regra que casa, sem
// repetir coluna). Se errar, o log da rodada mostra o que escolheu.
// Visão "CTOs de Clientes" (539): radusuarios_ativo, radusuarios_login,
// radusuarios_rad_caixa_ftth_descricao, radusuarios_ftth_porta, + lat/long,
// splitter, projeto (rad_caixa_ftth_df_projeto_nome — NÃO é o cliente),
// endereço, ONU MAC, interface. Sem nome do cliente nem lacre por enquanto.
const COLUNAS_CLIENTES_CTO = [
    ["ativo", [/^radusuarios_ativo$/i, /(^|_)ativo$/i]],
    ["login", [/^radusuarios_login$/i, /login/i]],
    // o COP anota o lacre no campo Complemento do login (não há campo próprio)
    ["lacre", [/lacre/i, /complemento/i]],
    // alguns clientes têm o lacre na Referência do cadastro ("LACRE 123…")
    ["lacreRef", [/referencia/i]],
    // clientes do provedor adquirido: o lacre foi parar no campo "Sinal do
    // último atendimento" — vale quando Complemento/Referência não têm lacre
    ["lacreSinal", [/sinal.*atendimento/i, /ultimo.*atendimento/i, /sinal/i]],
    ["porta", [/ftth_porta$/i, /porta(?!.*(fibra|interface))/i]],
    ["cto", [/caixa_ftth_descricao$/i, /(^|_)cto(_|$)/i]],
    ["cliente", [/razao/i, /fantasia/i, /cliente.*nome|nome.*cliente/i]]
];

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

// O robô roda oculto (rodar-oculto.vbs), então console.log some. Erros vão
// pra erros.txt (com passo + stack) pra dar pra ver o que quebrou sem ficar
// olhando o console. Ver uso em sincronizarPendentes.
const ARQ_ERRO = path.join(__dirname, "erros.txt");
function logErro(contexto, e) {
    const msg = (e && e.message) || String(e);
    const stack = e && e.stack ? `\n${e.stack}` : "";
    try { fs.appendFileSync(ARQ_ERRO, `[${new Date().toLocaleString("pt-BR")}] ${contexto}: ${msg}${stack}\n\n`, "utf8"); } catch {}
    log(`ERRO em ${contexto}: ${msg}`);
}

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
            assunto: texto(r.su_oss_chamado_su_oss_assunto_assunto),
            // coordenada da OS (endereço do atendimento) — Mapa de calor, patch-30
            lat: coordenadaCto(r.su_oss_chamado_mensagem_su_oss_chamado_latitude, 90),
            lng: coordenadaCto(r.su_oss_chamado_mensagem_su_oss_chamado_longitude, 180)
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

const dataHora = d => `${ymd(d)} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
// mesma data/hora como vem codificada no molde (espaço=+, :=%3A)
const dataHoraCod = d => `${ymd(d)}+${p2(d.getHours())}%3A${p2(d.getMinutes())}%3A${p2(d.getSeconds())}`;
const fimDoDia = d => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
const CAMPO_ABERTURA = "su_oss_chamado_mensagem_su_oss_chamado.data_abertura";
const CAMPO_MOVIMENTACAO = "su_oss_chamado_mensagem.data";
const regraCod = campo => `%22id%22%3A%22${campo}%22%2C%22field%22%3A%22${campo}%22`;

/** Ajusta o molde cirurgicamente, direto no texto codificado (NÃO remontar com
 *  URLSearchParams: o IXC devolveu 0 linhas quando o campo json foi recodificado).
 *  Troca start/length/draw e, com `janela`, ESTREITA o filtro de data do molde
 *  (BETWEEN do ano inteiro) pra [janela.ini, janela.fim], com hora. O IXC
 *  ignora a ordenação por DataTables, então o jeito de pegar só os recentes é
 *  filtrar no próprio pedido.
 *  janela.porMovimentacao (pré-agendamento): o filtro do molde é pela data de
 *  ABERTURA da OS — troca o campo pela data da MOVIMENTAÇÃO, pra pegar o que
 *  mudou na janela (OS aberta em agosto e reagendada hoje entra). */
function montarPayload(molde, start, length, draw, janela) {
    let p = molde.payload;
    p = p.replace(/(^|&)start=\d+/, `$1start=${start}`);
    p = p.replace(/(^|&)length=\d+/, `$1length=${length}`);
    p = p.replace(/(^|&)draw=\d+/, `$1draw=${draw}`);
    // A caixa de busca da tabela do Query Builder vai junto no molde se tinha
    // algo digitado na captura (15/10: "BJR" -> o robô puxou só 7 mil de 105
    // mil logins). O robô quer sempre a visão inteira: zera a busca geral e a
    // de cada coluna.
    p = p.replace(/(^|&)(search%5Bvalue%5D|search\[value\])=[^&]*/g, "$1$2=");
    p = p.replace(/(^|&)(columns%5B\d+%5D%5Bsearch%5D%5Bvalue%5D|columns\[\d+\]\[search\]\[value\])=[^&]*/g, "$1$2=");
    if (janela) {
        if (janela.porMovimentacao) {
            const antes = p;
            p = p.split(regraCod(CAMPO_ABERTURA)).join(regraCod(CAMPO_MOVIMENTACAO))
                 .split(`${CAMPO_ABERTURA}+BETWEEN+`).join(`${CAMPO_MOVIMENTACAO}+BETWEEN+`);
            // sem trocar o campo, a janela cairia na data de abertura e só viriam OS novas: melhor parar
            if (p === antes) throw new Error("molde sem filtro de data de abertura — não dá pra puxar por movimentação");
        }
        p = p.replace(/\d{4}-\d{2}-\d{2}\+00%3A00%3A00/g, dataHoraCod(janela.ini));
        p = p.replace(/\d{4}-\d{2}-\d{2}\+23%3A59%3A59/g, dataHoraCod(janela.fim));
    }
    return p;
}

/** Puxa as linhas da visão (filtrada por `janela`, ou o molde inteiro se
 *  null), paginando até o fim. O corte é feito no servidor (no filtro do
 *  pedido), então aqui é só juntar as páginas. */
async function puxarRecentes(pagina, molde, janela) {
    const linhas = [];
    let total = null;

    for (let i = 0; i < MAX_PAGINAS; i++) {
        const body = montarPayload(molde, i * TAM_PAGINA, TAM_PAGINA, i + 1, janela);
        // Uma página lenta do IXC estoura o AbortController (180s). Isso NÃO é a
        // sessão caindo — é só o IXC demorando. Tenta de novo até 3x na MESMA
        // página; só então desiste (PULL_TIMEOUT) — sem reiniciar o navegador.
        let txt;
        for (let tent = 1; ; tent++) {
            try {
                txt = await pagina.evaluate(async ({ url, body, timeoutMs }) => {
                    // AbortController derruba o fetch em timeoutMs (senão um fetch
                    // "meio aberto" por VPN oscilando ficaria esperando pra sempre).
                    const ctrl = new AbortController();
                    const t = setTimeout(() => ctrl.abort(), timeoutMs);
                    try {
                        const r = await fetch(url, {
                            method: "POST", credentials: "include",
                            headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest" },
                            body, signal: ctrl.signal
                        });
                        return { status: r.status, texto: await r.text() };
                    } finally { clearTimeout(t); }
                }, { url: URL_DADOS, body, timeoutMs: 180000 });
                break;
            } catch (e) {
                const timeout = /aborted|AbortError|timed? ?out/i.test(e && e.message || "");
                if (timeout && tent < 3) { log(`  visão ${molde.viewId} pág ${i}: IXC demorou >180s (tentativa ${tent}/3), repetindo...`); continue; }
                if (timeout) throw new Error("PULL_TIMEOUT");   // 3 falhas seguidas = sessão travada → rodar() reinicia pra relogar
                throw e;
            }
        }

        if (txt.status === 401 || /\/login/.test(txt.texto)) throw new Error("SESSAO_CAIU");
        let j; try { j = JSON.parse(txt.texto); } catch { throw new Error("resposta não-JSON do IXC (sessão caiu?)"); }
        const bloco = j.data || j.result || [];
        if (i === 0) total = j.recordsTotal ?? null;

        if (i === 0) { // diagnóstico: confirma que o filtro de data reduziu o total
            const ds = bloco.map(r => r.su_oss_chamado_mensagem_data);
            try {
                fs.writeFileSync(path.join(__dirname, "debug.txt"),
                    `visão ${molde.viewId} | janela ${janela ? `${dataHora(janela.ini)} → ${dataHora(janela.fim)}` : "molde inteiro"}\n` +
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

// ordens.lat/lng existem? (patch-30) — sem elas o robô grava como antes.
// Confere de novo enquanto não existir: o patch pode ser rodado com o robô ligado.
let _ordensTemCoord = null;
async function ordensTemCoordenadas() {
    if (_ordensTemCoord) return true;
    try { await supabase("GET", "ordens?select=lat&limit=1"); _ordensTemCoord = true; }
    catch {
        if (_ordensTemCoord === null) log("  ordens sem colunas lat/lng (falta o patch-30) — coordenada das OS não é gravada.");
        _ordensTemCoord = false;
    }
    return _ordensTemCoord;
}

/**
 * Preenche lat/lng das OS ANTIGAS (gravadas antes do patch-30), um mês da
 * visão 343 por rodada, do mês da OS mais antiga do banco até hoje — assim
 * não trava as rodadas normais (e não puxa mês que não tem OS gravada).
 * Progresso em estado.coordenadasMes / coordenadasFeito.
 */
async function mesMaisAntigoDasOrdens() {
    const r = await supabase("GET", "ordens?select=data_fechamento&data_fechamento=not.is.null&order=data_fechamento.asc&limit=1");
    const d = r?.[0]?.data_fechamento ? new Date(r[0].data_fechamento) : new Date();
    return `${d.getFullYear()}-${p2(d.getMonth() + 1)}`;
}
async function preencherCoordenadasAntigas(pagina, moldes, simular, estado) {
    if (simular || estado.coordenadasFeito || !(await ordensTemCoordenadas())) return;
    const molde = moldes.find(m => VISOES_PARA_SINCRONIZAR.includes(m.viewId));
    if (!molde) return;
    if (!estado.coordenadasMes) estado.coordenadasMes = await mesMaisAntigoDasOrdens();
    const [ano, mes] = estado.coordenadasMes.split("-").map(Number);
    const ini = new Date(ano, mes - 1, 1, 0, 0, 0);
    if (ini > new Date()) { estado.coordenadasFeito = true; log("Coordenadas das OS antigas: histórico completo."); return; }
    const fim = new Date(ano, mes, 0, 23, 59, 59);

    log(`Coordenadas das OS antigas: ${p2(mes)}/${ano}...`);
    const linhas = await puxarRecentes(pagina, molde, { ini, fim });
    const porId = new Map();
    for (const r of linhas) {
        const id = texto(r.su_oss_chamado_mensagem_su_oss_chamado_id);
        const lat = coordenadaCto(r.su_oss_chamado_mensagem_su_oss_chamado_latitude, 90);
        const lng = coordenadaCto(r.su_oss_chamado_mensagem_su_oss_chamado_longitude, 180);
        if (id && lat != null && lng != null && !porId.has(id)) porId.set(id, { id, lat, lng });
    }
    let atualizadas = 0;
    for (const lote of emLotes([...porId.values()], 1000))
        atualizadas += Number(await supabase("POST", "rpc/preencher_coordenadas_ordens", { p_linhas: lote })) || 0;
    log(`  ${porId.size} OS com coordenada no mês, ${atualizadas} atualizada(s) no banco.`);
    estado.coordenadasMes = mes === 12 ? `${ano + 1}-01` : `${ano}-${p2(mes + 1)}`;
}

async function processarEGravar(linhasBrutas, { simular }) {
    const novas = new Map();
    let semId = 0;
    for (const lb of linhasBrutas) {
        const { id, ordem, mov } = converterLinha(lb);
        if (id === null) { semId++; continue; }
        if (!novas.has(id)) novas.set(id, { ...ordem, movs: [] });
        const atual = novas.get(id);
        if (atual.lat == null && ordem.lat != null) { atual.lat = ordem.lat; atual.lng = ordem.lng; }
        atual.movs.push(mov);
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
    const comCoord = await ordensTemCoordenadas();
    const colunasOrdem = "id,cliente,login,cidade,bairro,assunto,data_abertura,data_fechamento,status_atual,tecnico_responsavel" + (comCoord ? ",lat,lng" : "");
    for (const lote of emLotes(ids, 150)) {
        for (const o of await buscarTodas("ordens", colunasOrdem, "id", `&id=in.${listaIn(lote)}`))
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
            setor: resolverSetor(operadores, resumo.tecnico), atualizado_em: new Date(),
            // a coordenada que veio agora vale; sem ela, mantém a salva (não apaga com null)
            ...(comCoord ? { lat: nova.lat ?? antiga.lat ?? null, lng: nova.lat != null ? nova.lng : (antiga.lng ?? null) } : {})
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

// estado das puxadas incrementais (sobrevive a reiniciar o robô)
const lerEstado = () => { try { return JSON.parse(fs.readFileSync(ARQ_ESTADO, "utf8")); } catch { return {}; } };
const salvarEstado = e => { try { fs.writeFileSync(ARQ_ESTADO, JSON.stringify(e, null, 2), "utf8"); } catch (x) { log("não salvou o estado das puxadas: " + x.message); } };
const desdeComFolga = iso => new Date(new Date(iso).getTime() - FOLGA_MIN * 60000);

// Janela grande (1ª rodada / backfill de meses) faz o IXC demorar demais pra
// devolver UMA página só da visão 343 e estourar o timeout de 90s do fetch
// (AbortError em puxarRecentes) — aí a rodada toda falha e o período fica sem
// puxar (foi o que deixou outubro/2026 incompleto na migração). A solução é
// puxar a janela em PEDAÇOS de poucos dias: cada pedaço responde rápido. A
// puxada incremental normal (janela de minutos/horas) vira um pedaço só, igual
// a antes. Ver uso em umaPassada.
const MAX_DIAS_JANELA = 7;
function fatiarJanela(ini, fim, maxDias = MAX_DIAS_JANELA) {
    const fatias = [];
    const passoMs = maxDias * 86400000;
    let a = new Date(ini);
    const alvo = new Date(fim);
    while (a <= alvo) {
        const b = new Date(Math.min(a.getTime() + passoMs - 1, alvo.getTime()));
        fatias.push({ ini: a, fim: b });
        a = new Date(b.getTime() + 1);
    }
    return fatias.length ? fatias : [{ ini: new Date(ini), fim: new Date(fim) }];
}

const ID_OS = "ID OS";
const FILTRO_ID_OS = "dados->>ID%20OS";
// colunas que são da OS (e não da movimentação): repetem em toda linha da OS
const CAMPOS_DA_OS = Object.entries(PARA_PLANILHA)
    .filter(([alias]) => !alias.startsWith("su_oss_chamado_mensagem_") || alias.startsWith("su_oss_chamado_mensagem_su_oss_chamado_"))
    .map(([, header]) => header);
const chavePendente = d => [d[ID_OS], d.DATA, d.EVENTO, d.STATUS, d["COLABORADOR RESPONSAVEL"], d.MENSAGEM].join("|");

/** Início do filtro de data de abertura do molde (ex.: 2026-01-01), pra a
 *  puxada por movimentação respeitar o mesmo corte do retrato completo. */
function inicioAberturaDoMolde(molde) {
    const m = (new URLSearchParams(molde.payload).get("json") || "").match(/data_abertura BETWEEN \\"(\d{4})-(\d{2})-(\d{2})/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}

/**
 * Pré-agendamento (visão 529) -> tabela os_pendentes, que o Agendador e a
 * Agenda IXC leem.
 *  - 1ª rodada do dia: RETRATO completo — apaga tudo e reinsere todas as OS em
 *    aberto (limpa o que a incremental não pega: cancelada, apagada...).
 *  - demais: só as movimentações novas desde a última puxada. As OS que vieram
 *    finalizadas na 343 (`finalizadas`) saem; as movimentações novas entram sem
 *    duplicar; e as linhas antigas das OS mexidas recebem os campos da OS
 *    atualizados (agendamento, diagnóstico...).
 */
async function sincronizarPendentes(pagina, moldes, simular, { finalizadas, estado, inicio }) {
    if (!VISAO_PENDENTES) return;
    const molde = moldes.find(m => m.viewId === VISAO_PENDENTES);
    if (!molde) { log(`molde da visão ${VISAO_PENDENTES} (pré-agendamento) não encontrado em templates.json`); return; }

    const hoje = ymd(inicio);
    if (estado.pendentesCompletaDia !== hoje || !estado.pendentesDesde || estado.pendentesForcarCompleta) {
        log(`Pré-agendamento: visão ${VISAO_PENDENTES} "${molde.viewName}" — retrato completo do dia (todas as OS em aberto)...`);
        const linhas = await puxarRecentes(pagina, molde, null); // null = molde inteiro
        const dados = linhas.map(r => ({ dados: paraLinhaPlanilha(r) }));
        const idsOs = new Set(linhas.map(r => r.su_oss_chamado_mensagem_su_oss_chamado_id)).size;

        if (simular) { log(`  (simulação) ${linhas.length} eventos, ${idsOs} OS em aberto — não gravou.`); return; }

        // retrato novo: apaga tudo e reinsere
        await supabase("DELETE", "os_pendentes?id=gt.0", undefined, "return=minimal");
        for (const lote of emLotes(dados, TAM_LOTE_SUPA)) await supabase("POST", "os_pendentes", lote, "return=minimal");
        log(`  os_pendentes atualizada: ${linhas.length} eventos, ${idsOs} OS em aberto.`);
        estado.pendentesCompletaDia = hoje;
        estado.pendentesDesde = inicio.toISOString();
        delete estado.pendentesForcarCompleta;
        return;
    }

    const janela = { ini: desdeComFolga(estado.pendentesDesde), fim: fimDoDia(inicio), porMovimentacao: true };
    log(`Pré-agendamento: movimentações desde ${janela.ini.toLocaleString("pt-BR")}...`);
    const corte = inicioAberturaDoMolde(molde);
    let brutas;
    try { brutas = await puxarRecentes(pagina, molde, janela); }
    catch (e) {
        if (e.message === "SESSAO_CAIU" || /has been closed|Target closed|browser has disconnected/i.test(e.message)) throw e;
        // o IXC não aceitou o filtro por movimentação: não deixa a lista parada — faz o retrato completo
        log(`  puxada por movimentação falhou (${e.message}) — fazendo o retrato completo.`);
        estado.pendentesForcarCompleta = true;
        return sincronizarPendentes(pagina, moldes, simular, { finalizadas, estado, inicio });
    }
    if (brutas.length > 5000) log(`  ⚠ ${brutas.length} linhas numa puxada por hora — o filtro por movimentação pode não estar valendo.`);
    const linhas = brutas
        .filter(r => !corte || (paraData(r.su_oss_chamado_mensagem_su_oss_chamado_data_abertura) || inicio) >= corte);
    const dados = linhas.map(paraLinhaPlanilha);
    const idsMexidas = [...new Set(dados.map(d => String(d[ID_OS])).filter(Boolean))];
    const idsFinalizadas = finalizadas.filter(id => !idsMexidas.includes(id));

    if (simular) { log(`  (simulação) ${dados.length} movimentação(ões) em ${idsMexidas.length} OS em aberto; ${idsFinalizadas.length} OS finalizadas sairiam — não gravou.`); return; }

    // Instrumentado (14/10): a gravação incremental estava falhando em silêncio
    // (robô oculto). `passo` marca onde está; qualquer erro vai pra erros.txt
    // com o passo e o stack, e é relançado (estado não é salvo, repete a janela).
    let passo = "início";
    try {
        // 1) finalizadas no período saem da lista de abertas
        passo = `DELETE finalizadas (${idsFinalizadas.length} OS)`;
        for (const lote of emLotes(idsFinalizadas, 150))
            await supabase("DELETE", `os_pendentes?${FILTRO_ID_OS}=in.${listaIn(lote)}`, undefined, "return=minimal");

        // 2) linhas que já existem das OS mexidas: pra não duplicar e pra atualizar os campos da OS
        passo = `buscar existentes (${idsMexidas.length} OS)`;
        const existentes = [];
        for (const lote of emLotes(idsMexidas, 150))
            existentes.push(...await buscarTodas("os_pendentes", "id,dados", "id", `&${FILTRO_ID_OS}=in.${listaIn(lote)}`));
        const vistas = new Set(existentes.map(l => chavePendente(l.dados)));
        const novas = dados.filter(d => { const k = chavePendente(d); if (vistas.has(k)) return false; vistas.add(k); return true; });

        // campos da OS mais recentes (a última movimentação puxada de cada OS)
        const camposOs = new Map();
        for (const d of dados) {
            const atual = camposOs.get(String(d[ID_OS]));
            if (!atual || (paraData(d.DATA) || 0) >= (paraData(atual.DATA) || 0)) camposOs.set(String(d[ID_OS]), d);
        }
        const atualizadas = [];
        for (const l of existentes) {
            const fonte = camposOs.get(String(l.dados[ID_OS]));
            if (!fonte || CAMPOS_DA_OS.every(c => l.dados[c] === fonte[c])) continue;
            const dadosNovos = { ...l.dados };
            for (const c of CAMPOS_DA_OS) dadosNovos[c] = fonte[c];
            atualizadas.push({ id: l.id, dados: dadosNovos });
        }

        passo = `POST atualizadas (${atualizadas.length})`;
        for (const lote of emLotes(atualizadas, TAM_LOTE_SUPA))
            await supabase("POST", "os_pendentes?on_conflict=id", lote, "resolution=merge-duplicates,return=minimal");
        passo = `POST novas (${novas.length})`;
        for (const lote of emLotes(novas.map(d => ({ dados: d })), TAM_LOTE_SUPA))
            await supabase("POST", "os_pendentes", lote, "return=minimal");
        log(`  os_pendentes: ${novas.length} movimentação(ões) nova(s) em ${idsMexidas.length} OS, ${atualizadas.length} linha(s) atualizada(s), ${idsFinalizadas.length} OS finalizada(s) saíram.`);
        estado.pendentesDesde = inicio.toISOString();
    } catch (e) {
        logErro(`gravar os_pendentes [passo: ${passo}]`, e);
        throw e;
    }
}

/** "-22.858880", "-22,858880" -> número; fora de faixa/0 -> null. */
function coordenadaCto(v, limite) {
    const n = Number(String(v ?? "").trim().replace(",", "."));
    return Number.isFinite(n) && n !== 0 && Math.abs(n) <= limite ? n : null;
}

/**
 * Uma linha por CTO (descrição) a partir das linhas da visão de clientes:
 * lat/long/endereço/projeto/splitter da caixa + logins ativos nela.
 * Sem a tabela ctos (patch-29) só avisa.
 */
async function sincronizarCadastroCtos(linhas, mapa, sincronizadoEm, encolheuDemais) {
    const chaves = Object.keys(linhas[0]);
    const col = re => chaves.find(c => re.test(c));
    const cLat = col(/caixa_ftth_latitude$/i), cLng = col(/caixa_ftth_longitude$/i);
    if (!mapa.cto || !cLat || !cLng) { log("  cadastro de CTOs: a visão não tem latitude/longitude da CTO — pulei."); return; }
    const cEnd = col(/caixa_ftth_endereco$/i), cProj = col(/projeto_nome$/i), cSplit = col(/caixa_ftth_capacidade$/i);

    try { await supabase("GET", "ctos?select=descricao&limit=1"); }
    catch { log("  cadastro de CTOs: tabela ctos ainda não existe (falta o patch-29) — pulei."); return; }

    const porCto = new Map();
    for (const r of linhas) {
        const descricao = valorCadastroCto(r[mapa.cto]);
        if (!descricao) continue;
        let c = porCto.get(descricao);
        if (!c) porCto.set(descricao, c = { descricao, lat: null, lng: null, endereco: null, projeto: null, splitter: null, logins_ativos: 0, sincronizado_em: sincronizadoEm });
        c.lat ??= coordenadaCto(r[cLat], 90);
        c.lng ??= coordenadaCto(r[cLng], 180);
        c.endereco ??= cEnd ? valorCadastroCto(r[cEnd]) : null;
        c.projeto ??= cProj ? valorCadastroCto(r[cProj]) : null;
        c.splitter ??= cSplit ? valorCadastroCto(r[cSplit]) : null;
        const ativo = !(mapa.ativo && /^(N|NAO|NÃO)$/i.test(String(r[mapa.ativo] ?? "").trim()));
        if (ativo) c.logins_ativos++;
    }
    const ctos = [...porCto.values()];
    for (const lote of emLotes(ctos, TAM_LOTE_SUPA))
        await supabase("POST", "ctos?on_conflict=descricao", lote, "resolution=merge-duplicates,return=minimal");
    if (!encolheuDemais)
        await supabase("DELETE", `ctos?sincronizado_em=lt.${encodeURIComponent(sincronizadoEm)}`, undefined, "return=minimal");
    log(`  ctos atualizada: ${ctos.length} CTOs (${ctos.filter(c => c.lat != null && c.lng != null).length} com posição).`);
}

/** Total de linhas de uma tabela (cabeçalho Content-Range do PostgREST). */
async function contarLinhasSupabase(tabela) {
    const r = await fetch(`${SUPA_URL}/rest/v1/${tabela}?select=*&limit=1`, {
        headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, Prefer: "count=exact" }
    });
    if (!r.ok) throw new Error(`contar ${tabela}: ${r.status} ${await r.text()}`);
    return Number((r.headers.get("content-range") || "").split("/")[1]) || 0;
}

function mapearColunasClientesCto(chaves) {
    const usadas = new Set(), mapa = {};
    for (const [campo, regras] of COLUNAS_CLIENTES_CTO) {
        for (const regra of regras) {
            const chave = chaves.find(c => !usadas.has(c) && regra.test(c));
            if (chave) { mapa[campo] = chave; usadas.add(chave); break; }
        }
    }
    return mapa;
}

/** "", "0", "-", "null" = não cadastrado (vira null no banco). */
/**
 * Lacre a partir do Complemento do cliente. O campo é o complemento do
 * ENDEREÇO ("LOTE 18 A", "CASA 68", "KM 10"…) e o COP anota o lacre nele
 * com a palavra: "LACRE 0828646", "LACRE: 041029". Só conta o número que
 * vem depois de "LACRE" — número solto é endereço, não lacre.
 */
function lacreDoComplemento(v) {
    const s = valorCadastroCto(v);
    // separador só no meio ("0053-502"), nunca no fim ("0053502- LOTE04" -> 0053502)
    const m = s && s.match(/lacre\D{0,6}(\d+(?:[.\-/]\d+)*)/i);
    return m ? m[1] : null;
}

/**
 * Lacre (anilha) do campo "Sinal do último atendimento" (base do provedor
 * adquirido, ex.: BJR — a anilha foi parar nesse campo). Aceita "LACRE 123456",
 * a anilha como número POSITIVO inteiro ou decimal com 4+ dígitos ("0050954",
 * "1.99741"), ou um prefixo de provedor + número longo. O sinal óptico de
 * verdade (negativo, ou com "dBm": "-21,5", "-18,30 dBm") NÃO é lacre.
 */
function lacreDoSinal(v) {
    const s = valorCadastroCto(v);
    if (!s) return null;
    const rotulado = lacreDoComplemento(s);
    if (rotulado) return rotulado;
    // sinal óptico de verdade (não é lacre): tem "db" ou é número negativo
    if (/d\s*b/i.test(s) || /^[−-]/.test(s.replace(/\s/g, ""))) return null;
    const prov = s.match(/^\s*[A-Za-z]{2,6}\s*(\d{6,})\s*$/);   // provedor (BJR…) + número longo
    if (prov) return prov[1];
    // anilha: número positivo (inteiro ou decimal) com 4+ dígitos
    const num = s.match(/^\s*(?:n[º°o]?\.?\s*)?(\d[\d.,]*)\s*$/);
    if (num && num[1].replace(/\D/g, "").length >= 4) return num[1];
    return null;
}

function valorCadastroCto(v) {
    const s = v === null || v === undefined ? "" : String(v).trim();
    return /^(|0|-+|null|n\/a)$/i.test(s) ? null : s;
}

/**
 * Base de clientes x CTO (visão VISAO_CLIENTES_CTO) -> tabela clientes_cto.
 * Retrato completo 1x por dia: upsert de tudo e, no fim, apaga quem não veio
 * nesta rodada (cliente que saiu da base). Visão vazia não mexe na tabela.
 */
async function sincronizarClientesCto(pagina, moldes, simular, { estado, inicio }) {
    if (!VISAO_CLIENTES_CTO) return;
    const hoje = ymd(inicio);
    const alvo = VISAO_CLIENTES_CTO.trim().toUpperCase(); // id OU nome da visão ("CTOs de Clientes")
    const molde = moldes.find(m => m.viewId === VISAO_CLIENTES_CTO || String(m.viewName ?? "").trim().toUpperCase() === alvo);
    if (!molde) { log(`molde da visão ${VISAO_CLIENTES_CTO} (clientes x CTO) não encontrado em templates.json — rode o capturar-dados.js`); return; }
    // 1x por dia — mas visão recapturada (molde mudou, ex.: coluna nova) puxa de novo na hora
    const assinatura = require("crypto").createHash("md5").update(molde.payload).digest("hex");
    if (!simular && estado.clientesCtoDia === hoje && estado.clientesCtoMolde === assinatura) return;

    log(`Clientes x CTO: visão ${VISAO_CLIENTES_CTO} "${molde.viewName}" — retrato completo da base...`);
    const linhas = await puxarRecentes(pagina, molde, null);
    if (linhas.length === 0) { log("  a visão voltou vazia — tabela clientes_cto mantida como estava."); return; }

    const mapa = mapearColunasClientesCto(Object.keys(linhas[0]));
    log(`  colunas: ${["ativo", "cliente", "login", "cto", "porta", "lacre", "lacreRef", "lacreSinal"].map(c => `${c}=${mapa[c] ?? "(não achei)"}`).join(" | ")}`);
    if (!mapa.cto || !mapa.porta || (!mapa.login && !mapa.cliente)) {
        log("  ⚠ faltou coluna de CTO, porta ou login/cliente na visão — não gravou. Ajuste COLUNAS_CLIENTES_CTO.");
        return;
    }

    // Inativos (Ativo = N/Não) entram marcados ativo=false, pro site alertar
    // quem ainda ocupa CTO/porta. Só com a coluna ativo no banco (patch-26);
    // sem ela, ficam de fora como antes.
    let gravaInativos = true;
    try { await supabase("GET", "clientes_cto?select=ativo&limit=1"); }
    catch { gravaInativos = false; log("  coluna ativo ainda não existe (falta o patch-26) — grava só os ativos."); }

    // um registro por login; login repetido (mais de um contrato) fica com o
    // ativo, e entre iguais com o mais completo
    const pontos = r => (r.ativo ? 10 : 0) + (r.cto ? 1 : 0) + (r.porta ? 1 : 0) + (r.lacre ? 1 : 0);
    const porChave = new Map();
    let inativosFora = 0;
    for (const r of linhas) {
        const ativo = !(mapa.ativo && /^(N|NAO|NÃO)$/i.test(String(r[mapa.ativo] ?? "").trim()));
        if (!ativo && !gravaInativos) { inativosFora++; continue; }
        const reg = {
            cliente: valorCadastroCto(mapa.cliente && r[mapa.cliente]),
            login: valorCadastroCto(mapa.login && r[mapa.login]),
            cto: valorCadastroCto(r[mapa.cto]),
            porta: valorCadastroCto(r[mapa.porta]),
            lacre: lacreDoComplemento(mapa.lacre && r[mapa.lacre])
                ?? lacreDoComplemento(mapa.lacreRef && r[mapa.lacreRef])
                ?? lacreDoSinal(mapa.lacreSinal && r[mapa.lacreSinal]),
            ativo
        };
        reg.chave = reg.login || reg.cliente;
        if (!reg.chave) continue;
        const atual = porChave.get(reg.chave);
        if (!atual || pontos(reg) > pontos(atual)) porChave.set(reg.chave, reg);
    }
    const sincronizadoEm = inicio.toISOString();
    const dados = [...porChave.values()].map(r => {
        const linha = { ...r, sincronizado_em: sincronizadoEm };
        if (!gravaInativos) delete linha.ativo;
        return linha;
    });
    // amostra dos campos de lacre (diagnóstico da regra de leitura), toda puxada
    try {
        const linhaAmostra = r => `${r[mapa.login]} | complemento: ${JSON.stringify(r[mapa.lacre] ?? null)} | sinal: ${JSON.stringify(mapa.lacreSinal ? r[mapa.lacreSinal] : null)} -> lacre ${porChave.get(valorCadastroCto(r[mapa.login]))?.lacre ?? "(nenhum)"}`;
        // separado: sinal preenchido (base do provedor adquirido, "BJR…") e lacre no complemento
        const comSinal = linhas.filter(r => valorCadastroCto(mapa.lacreSinal && r[mapa.lacreSinal]));
        const comComplemento = linhas.filter(r => /lacre/i.test(String(r[mapa.lacre] ?? "")));
        fs.writeFileSync(path.join(__dirname, "amostra-lacre.txt"),
            `${new Date().toLocaleString("pt-BR")}\n\n` +
            `== SINAL DO ÚLTIMO ATENDIMENTO preenchido: ${comSinal.length} linhas (até 60) ==\n${comSinal.slice(0, 60).map(linhaAmostra).join("\n")}\n\n` +
            `== BJR (provedor adquirido): ${linhas.filter(r => /^BJR/i.test(String(r[mapa.login] ?? ""))).length} linhas (até 30) ==\n` +
            `${linhas.filter(r => /^BJR/i.test(String(r[mapa.login] ?? ""))).slice(0, 30).map(linhaAmostra).join("\n")}\n\n` +
            `== LACRE no complemento: ${comComplemento.length} linhas (até 30) ==\n${comComplemento.slice(0, 30).map(linhaAmostra).join("\n")}\n`, "utf8");
    } catch {}
    const ativos = dados.filter(r => r.ativo !== false);
    const completos = ativos.filter(r => r.cto && r.porta).length;
    const inativosCadastrados = dados.filter(r => r.ativo === false && r.cto && r.porta).length;
    const resumo = `${ativos.length} logins ativos (${completos} com CTO e porta, ${ativos.length - completos} sem)` +
        (gravaInativos ? `, ${dados.length - ativos.length} inativos (${inativosCadastrados} ainda com CTO e porta)` : `, ${inativosFora} inativos fora`);

    if (simular) {
        log(`  (simulação) ${linhas.length} linhas: ${resumo} — não gravou.`);
        dados.slice(0, 5).forEach(r => log(`    ${JSON.stringify(r)}`));
        if (mapa.lacre) {
            log(`  com lacre: ${ativos.filter(r => r.lacre).length} logins ativos (${ativos.filter(r => r.lacre && r.cto && r.porta).length} deles com CTO e porta)`);
            if (mapa.lacreSinal) {
                const sinais = linhas.map(r => r[mapa.lacreSinal]).filter(v => valorCadastroCto(v)).slice(0, 20);
                log(`  ${mapa.lacreSinal} -> lacre (amostra): ${sinais.map(v => `"${v}" -> ${lacreDoSinal(v) ?? "(não é lacre)"}`).join(" | ")}`);
            }
            const amostra = linhas.map(r => r[mapa.lacre]).filter(v => /lacre/i.test(v ?? "")).slice(0, 15);
            log(`  ${mapa.lacre} -> lacre (amostra): ${amostra.map(v => `"${v}" -> ${lacreDoComplemento(v) ?? "(sem lacre)"}`).join(" | ")}`);
        }
        return;
    }

    // Trava: retrato muito menor que a base atual (visão filtrada, IXC
    // devolvendo pela metade…) NÃO apaga ninguém — só atualiza quem veio.
    const atuais = await contarLinhasSupabase("clientes_cto");
    const encolheuDemais = atuais > 1000 && dados.length < atuais * 0.7;
    if (encolheuDemais)
        log(`  ⚠ a visão trouxe ${dados.length} logins e a base tem ${atuais} — parece filtrada; NÃO vou apagar quem não veio. Confira a visão / recapture sem filtro.`);

    let passo = "início";
    try {
        passo = `upsert (${dados.length})`;
        for (const lote of emLotes(dados, TAM_LOTE_SUPA))
            await supabase("POST", "clientes_cto?on_conflict=chave", lote, "resolution=merge-duplicates,return=minimal");
        if (!encolheuDemais) {
            passo = "apagar quem saiu da base";
            await supabase("DELETE", `clientes_cto?sincronizado_em=lt.${encodeURIComponent(sincronizadoEm)}`, undefined, "return=minimal");
        }
    } catch (e) {
        logErro(`gravar clientes_cto [passo: ${passo}]`, e);
        throw e;
    }
    log(`  clientes_cto atualizada: ${resumo}.`);

    // Cadastro de CTOs (patch-29): posição de cada caixa, pra aba CTOs e
    // Lacres achar a CTO mais próxima da coordenada que o técnico escreveu.
    // Falha aqui não derruba a base de clientes (já gravada acima).
    try { await sincronizarCadastroCtos(linhas, mapa, sincronizadoEm, encolheuDemais); }
    catch (e) { logErro("gravar ctos", e); log("  cadastro de CTOs falhou: " + e.message); }
    estado.clientesCtoDia = hoje;
    estado.clientesCtoMolde = assinatura;
}

function mapearColunasOffline(chaves) {
    const usadas = new Set(), mapa = {};
    for (const [campo, regras] of COLUNAS_OFFLINE) {
        for (const regra of regras) {
            const chave = chaves.find(c => !usadas.has(c) && regra.test(c));
            if (chave) { mapa[campo] = chave; usadas.add(chave); break; }
        }
    }
    return mapa;
}

/** "", "0", "-", "null" => null; senão o texto limpo. */
function valorOffline(v) {
    const s = v === null || v === undefined ? "" : String(v).trim();
    return /^(|-+|null|n\/a)$/i.test(s) ? null : s;
}
function numeroOffline(v) {
    const s = valorOffline(v);
    if (s === null) return null;
    const n = Number(s.replace(",", "."));
    return Number.isFinite(n) ? n : null;
}

/**
 * Logins OFFLINE (visão VISAO_OFFLINE "Login - Off": online=N) -> tabela
 * clientes_offline. Retrato COMPLETO a cada rodada (upsert por login + apaga
 * quem voltou/saiu). O site cruza com as OS em aberto pra flagar rompimento /
 * queda de energia em massa (muitos logins da mesma OLT/PON/CTO caindo juntos).
 */
async function sincronizarClientesOffline(pagina, moldes, simular, { inicio }) {
    if (!VISAO_OFFLINE) return;
    // só dentro da janela (7h30–18h30); fora dela mantém o último retrato
    if (!simular && !dentroJanelaOffline(inicio)) return;
    const alvo = VISAO_OFFLINE.trim().toUpperCase();
    const molde = moldes.find(m => m.viewId === VISAO_OFFLINE || String(m.viewName ?? "").trim().toUpperCase() === alvo);
    if (!molde) { log(`molde da visão ${VISAO_OFFLINE} (logins offline) não encontrado em templates.json — rode o capturar-dados.js`); return; }

    log(`Logins offline: visão ${molde.viewId} "${molde.viewName}" — retrato completo...`);
    const linhas = await puxarRecentes(pagina, molde, null);
    if (linhas.length === 0) { log("  a visão voltou vazia — tabela clientes_offline mantida como estava."); return; }

    const mapa = mapearColunasOffline(Object.keys(linhas[0]));
    log(`  colunas: ${COLUNAS_OFFLINE.map(([c]) => `${c}=${mapa[c] ?? "(não achei)"}`).join(" | ")}`);
    if (!mapa.login) { log("  ⚠ não achei a coluna de login na visão — não gravou. Ajuste COLUNAS_OFFLINE."); return; }

    const sincronizadoEm = inicio.toISOString();
    const porLogin = new Map();
    for (const r of linhas) {
        const login = valorOffline(r[mapa.login]);
        if (!login) continue;
        porLogin.set(login, {
            login,
            cliente: valorOffline(mapa.cliente && r[mapa.cliente]),
            bairro: valorOffline(mapa.bairro && r[mapa.bairro]),
            olt: valorOffline(mapa.olt && r[mapa.olt]),
            cto: valorOffline(mapa.cto && r[mapa.cto]),
            interface_pon: valorOffline(mapa.interface && r[mapa.interface]),
            sinal_rx: numeroOffline(mapa.sinal_rx && r[mapa.sinal_rx]),
            causa: valorOffline(mapa.causa && r[mapa.causa]),
            status_acesso: valorOffline(mapa.status_acesso && r[mapa.status_acesso]),
            ultima_conexao: valorOffline(mapa.ultima_conexao && r[mapa.ultima_conexao]),
            latitude: numeroOffline(mapa.latitude && r[mapa.latitude]),
            longitude: numeroOffline(mapa.longitude && r[mapa.longitude]),
            sincronizado_em: sincronizadoEm
        });
    }
    const dados = [...porLogin.values()];

    if (simular) {
        log(`  (simulação) ${linhas.length} linhas -> ${dados.length} logins offline — não gravou.`);
        dados.slice(0, 5).forEach(r => log(`    ${JSON.stringify(r)}`));
        return;
    }

    let passo = "início";
    try {
        passo = `upsert (${dados.length})`;
        for (const lote of emLotes(dados, TAM_LOTE_SUPA))
            await supabase("POST", "clientes_offline?on_conflict=login", lote, "resolution=merge-duplicates,return=minimal");
        passo = "apagar quem voltou/saiu";
        await supabase("DELETE", `clientes_offline?sincronizado_em=lt.${encodeURIComponent(sincronizadoEm)}`, undefined, "return=minimal");
    } catch (e) {
        logErro(`gravar clientes_offline [passo: ${passo}]`, e);
        throw e;
    }
    log(`  clientes_offline atualizada: ${dados.length} logins offline.`);
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
    const inicio = new Date();
    const estado = lerEstado();
    const finalizadas = new Set();   // OS finalizadas na janela (saem do pré-agendamento)

    // ordens: OS finalizadas desde a última puxada (1ª vez: últimos JANELA_DIAS dias)
    const ini = estado.ordensDesde ? desdeComFolga(estado.ordensDesde) : new Date(inicio.getTime() - JANELA_DIAS * 86400000);
    const fimJanela = fimDoDia(inicio);
    // Fatia janelas grandes (1ª rodada / backfill) em pedaços de MAX_DIAS_JANELA
    // dias, senão o IXC estoura o timeout de 90s numa página só (ver fatiarJanela).
    // Grava CADA pedaço na hora: se um pedaço falhar, o que já entrou fica (dedup
    // ignora repetido) e a próxima rodada retoma do mesmo ponto sem perder nada.
    const fatias = fatiarJanela(ini, fimJanela);
    for (const id of VISOES_PARA_SINCRONIZAR) {
        const molde = moldes.find(m => m.viewId === id);
        if (!molde) { log(`molde da visão ${id} não encontrado em templates.json`); continue; }
        if (fatias.length > 1) log(`Visão ${id} "${molde.viewName}": janela grande (${ini.toLocaleString("pt-BR")} → ${fimJanela.toLocaleString("pt-BR")}) — puxando em ${fatias.length} pedaços de até ${MAX_DIAS_JANELA} dias.`);
        for (const fat of fatias) {
            log(`Visão ${id} "${molde.viewName}": OS finalizadas ${fat.ini.toLocaleString("pt-BR")} → ${fat.fim.toLocaleString("pt-BR")}...`);
            const linhas = await puxarRecentes(pagina, molde, { ini: fat.ini, fim: fat.fim });
            for (const r of linhas) if (!vazio(r.su_oss_chamado_mensagem_su_oss_chamado_id)) finalizadas.add(String(r.su_oss_chamado_mensagem_su_oss_chamado_id));
            const r = await processarEGravar(linhas, { simular });
            if (!simular) log(`  gravado: ${r.ordens} OS, ${r.inseridas} movimentação(ões) nova(s), ${r.ignoradas} já existiam.`);
        }
    }
    await sincronizarPendentes(pagina, moldes, simular, { finalizadas: [...finalizadas], estado, inicio });
    // à parte: coordenadas das OS antigas, um mês por rodada (patch-30)
    try { await preencherCoordenadasAntigas(pagina, moldes, simular, estado); }
    catch (e) {
        if (e.message === "SESSAO_CAIU" || /has been closed|Target closed|browser has disconnected|Failed to fetch/i.test(e.message)) throw e;
        log("Coordenadas das OS antigas falhou: " + e.message);
    }
    // à parte: se a base de clientes falhar, não derruba a rodada das ordens (tenta de novo na próxima)
    try { await sincronizarClientesCto(pagina, moldes, simular, { estado, inicio }); }
    catch (e) {
        if (e.message === "SESSAO_CAIU" || /has been closed|Target closed|browser has disconnected|Failed to fetch/i.test(e.message)) throw e;
        log("Clientes x CTO falhou: " + e.message);
    }
    // à parte: logins offline (detecção de rompimento) — falha não derruba a rodada
    try { await sincronizarClientesOffline(pagina, moldes, simular, { estado, inicio }); }
    catch (e) {
        if (e.message === "SESSAO_CAIU" || /has been closed|Target closed|browser has disconnected|Failed to fetch/i.test(e.message)) throw e;
        log("Logins offline falhou: " + e.message);
    }
    // só grava o estado com a rodada inteira OK: se o pré-agendamento falhar, a
    // próxima repete a janela das ordens (o repetido é ignorado) e não perde finalizadas
    if (!simular) { estado.ordensDesde = inicio.toISOString(); salvarEstado(estado); }
    log(`Rodada concluída em ${Math.round((Date.now() - inicio.getTime()) / 1000)} s.`);
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
                acceptDownloads: true,
                args: ["--start-maximized", "--no-first-run", "--no-default-browser-check", "--hide-crash-restore-bubble"]
            });
            ctxFechado = false;
            ctx.on("close", () => { ctxFechado = true; });
            configurarDownloads(ctx, log);
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
    // Falha de REDE na puxada (fetch dentro da página não completou): VPN caiu,
    // sessão morta, ou a aba foi parar numa página inválida. Recuperável relogando.
    // NÃO inclui AbortError/timeout: o timeout de 90s é da NOSSA trava (IXC lento),
    // não a sessão caindo. Tratá-lo como falha de rede fazia o robô fechar+reabrir o
    // navegador toda vez que uma puxada demorasse (janela nova na cara do usuário).
    const ehFalhaDeRede = e => /Failed to fetch|NetworkError|net::|ERR_|ERR_NETWORK|ECONN|fetch failed|load failed/i.test(e && e.message || "");

    // Recuperação forte: fecha o navegador inteiro e reabre do zero (garantirNavegador
    // relança + preparaPagina = re-login + volta pro IXC_HOME). Usado quando uma puxada
    // falha (sessão/rede), pra limpar qualquer estado ruim da aba. Fecha também as abas
    // que o usuário tinha abertas nessa janela.
    const reiniciarNavegador = async () => {
        log("Fechando o navegador e reabrindo do zero (recuperação da puxada)...");
        try { if (ctx) await ctx.close(); } catch {}
        ctxFechado = true; pagina = null;
        await garantirNavegador();
    };

    await garantirNavegador();

    let emExecucao = false;  // trava: não deixa a rodada agendada e um comando rodarem juntos
    const rodar = async () => {
        if (emExecucao) return false;
        emExecucao = true;
        let ok = true;   // só TRUE quando a passada completou; senão a hora NÃO é marcada e é retentada
        try { await garantirNavegador(); await umaPassada(pagina, moldes, simular); await publicarAgendaSeNaHora(); }
        catch (e) {
            ok = false;
            if (fechouNavegador(e)) log("Navegador/aba fechou durante a rodada — reabro na próxima.");
            else if (e.message === "SESSAO_CAIU" || e.message === "PULL_TIMEOUT" || ehFalhaDeRede(e)) {
                // puxada não completou (sessão caiu / Failed to fetch): fecha o
                // navegador e reabre do zero, pra limpar o estado e relogar.
                logErro("rodada (puxada falhou: sessão/rede)", e);
                log("Puxada falhou (sessão/rede) — fechando e reabrindo o navegador...");
                await reiniciarNavegador().catch(x => log("Reinício do navegador não concluiu: " + x.message));
            }
            else { logErro("rodada", e); log("ERRO: " + e.message); }
        } finally { emExecucao = false; }
        return ok;
    };

    // Mini-rodada SÓ da offline (rompimentos), pros :00 entre as rodadas
    // completas — assim a offline atualiza a cada 30 min na janela dela.
    const rodarOffline = async () => {
        if (emExecucao) return false;
        emExecucao = true;
        let ok = true;
        try {
            await garantirNavegador();
            await sincronizarClientesOffline(pagina, moldes, simular, { estado: lerEstado(), inicio: new Date() });
        } catch (e) {
            ok = false;
            if (fechouNavegador(e)) log("Navegador/aba fechou na offline — reabro na próxima.");
            else if (e.message === "SESSAO_CAIU" || e.message === "PULL_TIMEOUT" || ehFalhaDeRede(e)) {
                logErro("offline (puxada falhou: sessão/rede)", e);
                await reiniciarNavegador().catch(x => log("Reinício do navegador não concluiu: " + x.message));
            } else { logErro("offline", e); log("ERRO offline: " + e.message); }
        } finally { emExecucao = false; }
        return ok;
    };

    const abertoEm = new Date();   // antes da 1ª rodada: ela pode terminar já na hora seguinte
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
            if (e.message === "SESSAO_CAIU" || e.message === "PULL_TIMEOUT" || ehFalhaDeRede(e)) {
                logErro("comando (puxada falhou: sessão/rede)", e);
                log("Puxada do comando falhou (sessão/rede) — fechando e reabrindo o navegador...");
                await reiniciarNavegador().catch(x => log("Reinício do navegador não concluiu: " + x.message));
            }
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
                // timeout: sem isso, um fetch "meio aberto" trava o pulso (e o robô) pra sempre.
                const ctrl = new AbortController();
                const t = setTimeout(() => ctrl.abort(), 30000);
                try {
                    const resp = await fetch(url, { credentials: "include", signal: ctrl.signal });
                    return { status: resp.status, url: resp.url };
                } finally { clearTimeout(t); }
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
    const rodadasFeitas = new Set([chaveRodada(abertoEm)]);
    const agenda = async () => {
        const agora = new Date();
        if (!HORARIOS_RODADA.includes(agora.getHours())) return;
        if (agora.getMinutes() < MINUTO_RODADA) return;   // só a partir dos :30 da hora
        const chave = chaveRodada(agora);
        if (rodadasFeitas.has(chave)) return;
        if (await rodar()) rodadasFeitas.add(chave);
    };

    // mini-rodada só da offline nos :00 (os :30 já vêm da rodada completa), só
    // na janela 7h30–18h30. Uma vez por :00.
    const offlineFeitas = new Set();
    const agendaOffline = async () => {
        const agora = new Date();
        if (agora.getMinutes() >= MINUTO_RODADA) return;   // :30 é da rodada completa
        if (!dentroJanelaOffline(agora)) return;
        const chave = `${ymd(agora)} ${agora.getHours()}h00`;
        if (offlineFeitas.has(chave)) return;
        if (await rodarOffline()) offlineFeitas.add(chave);
    };

    log(`Pronto. Rodadas de hora em hora, das ${HORARIOS_RODADA[0]}h${MINUTO_RODADA} às ${HORARIOS_RODADA.at(-1)}h${MINUTO_RODADA} (offline a cada 30 min, 7h30–18h30; extra: botão "Atualizar banco"). Pode minimizar a janela (não feche).`);
    setInterval(pulso, PULSO_MS);
    setInterval(agenda, 60 * 1000);
    setInterval(agendaOffline, 60 * 1000);
    setInterval(verificarComandos, 30 * 1000);
}

principal().catch(e => { log("FALHOU: " + e.message); process.exit(1); });
