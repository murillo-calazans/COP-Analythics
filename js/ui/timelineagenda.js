/**
 * ==========================================================
 * Timeline da operação (aba Timeline, dentro de Gestão de Ordens)
 * ==========================================================
 * Gantt AO VIVO do dia: linhas = técnicos da escala (por cidade), colunas =
 * horas. Cada bloco é uma OS no horário REAL (deslocamento → execução →
 * finalização), com a linha do "agora" andando com o relógio. Terminou,
 * fica fixo no horário real que terminou; em execução cresce até o agora.
 *
 * Fontes (tudo já existe):
 *  - movimentacoes (data >= hoje): eventos do dia com hora real — ev.2
 *    deslocamento ("Usuário X, iniciou o deslocamento"), ev.9 execução,
 *    ev.6 finalização. Reconstrói o começo/fim de cada OS, inclusive as
 *    finalizadas (que já saíram da os_pendentes).
 *  - ordens (pelos ids do dia): cliente, cidade, assunto, técnico.
 *  - os_pendentes + Motor.montarOS: OS AGENDADAS pra hoje ainda não
 *    iniciadas (bloco "previsto"), com o técnico resolvido como na Agenda IXC.
 *  - escala do dia (EscalaDia.montarDia): quem trabalha, cidade, setor e
 *    sozinho × dupla. Técnico sem OS aparece como "sem OS".
 *
 * Tempo esperado por serviço (sozinho × dupla) por enquanto é um padrão
 * aqui no TL_TEMPOS; a tela de configuração (estilo LPU) é a próxima etapa.
 */

// ---- janela / medidas ----
const TL_DIA_INI = 0, TL_DIA_FIM = 24;      // a linha cobre 24h
const TL_JANELA_INI = 8, TL_JANELA_FIM = 18; // recorte padrão (rola pra ver o resto)
const TL_NAMEW = 220;
let _tlHourW = 110;

// Tempo esperado (min) por assunto — [sozinho, dupla]. Padrão enquanto não há a tela de config.
const TL_TEMPOS = {
    "sem conexao / los": [20, 15], "troca de equipamento": [25, 20], "instalacao": [40, 40],
    "verificar conexao": [20, 15], "transferencia de endereco": [30, 25], "troca de senha": [10, 10],
    "visita tecnica prioritaria": [25, 20], "instalacao novo cliente": [60, 40]
};
const TL_TEMPO_PADRAO = [30, 25];
function tlEsperado(assunto, dupla) {
    const chave = String(assunto || "").replace(/\s*\(\d+\)/g, "").trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
    const t = TL_TEMPOS[chave] || TL_TEMPO_PADRAO;
    return dupla ? t[1] : t[0];
}

const tlNorm = t => String(t ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
const tlCurto = a => { const s = String(a || "").replace(/\s*\(\d+\)/g, "").trim().toLowerCase(); return (s.charAt(0).toUpperCase() + s.slice(1)).replace(/\blos\b/g, "LOS"); };
const tlHoras = d => d ? (d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600) : 0;
const tlFmtH = d => d ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—";
const TL_EXCLUIR = /auditoria|exclusao de acesso|pos.?terceiriz|retirada|recolhimento/;

// ---------------- dados ----------------
async function tlBuscarMovHoje() {
    const hoje = hojeMeiaNoite().toISOString();
    const linhas = [];
    for (let de = 0; ; de += 1000) {
        const { data, error } = await supabaseClient
            .from("movimentacoes")
            .select("ordem_id, data, evento, status, mensagem")
            .gte("data", hoje).order("data").range(de, de + 999);
        if (error || !data || !data.length) break;
        linhas.push(...data);
        if (data.length < 1000) break;
    }
    return linhas;
}

async function tlBuscarOrdens(ids) {
    const mapa = new Map();
    for (let i = 0; i < ids.length; i += 150) {
        const fatia = ids.slice(i, i + 150);
        try {
            const { data } = await supabaseClient.from("ordens")
                .select("id, cliente, cidade, assunto, tecnico_responsavel, status_atual, data_fechamento")
                .in("id", fatia);
            (data || []).forEach(o => mapa.set(String(o.id), o));
        } catch (e) { /* ignora */ }
    }
    return mapa;
}

/** Nome do técnico que iniciou o deslocamento (texto do evento 2). */
function tlTecnicoDesloc(msg) {
    const m = String(msg || "").match(/usu[aá]rio\s+(.+?)\s*,\s*iniciou o deslocamento/i);
    return m ? m[1].trim() : null;
}

/** Reconstrói, por OS, o começo/fim do dia a partir das movimentações. */
function tlPorOs(mov) {
    const porOs = new Map();
    for (const e of mov) {
        const id = String(e.ordem_id);
        let o = porOs.get(id);
        if (!o) { o = { id, desloc: null, exec: null, fim: null, tec: null, status: null, ultData: null }; porOs.set(id, o); }
        const ev = +e.evento;
        const dt = e.data ? new Date(e.data) : null;
        if (ev === 2) { if (!o.desloc) o.desloc = dt; const t = tlTecnicoDesloc(e.mensagem); if (t) o.tec = t; }
        if (ev === 9 && !o.exec) o.exec = dt;
        if (ev === 6) o.fim = dt;
        if (dt && (!o.ultData || dt > o.ultData)) { o.ultData = dt; o.status = e.status; }
    }
    return porOs;
}

/** OS agendadas pra HOJE ainda não iniciadas (bloco previsto), via Motor. */
function tlAgendadasPrevistas(linhasOsPendentes, jaTocadas) {
    const out = [];
    if (typeof Motor === "undefined" || typeof Motor.montarOS !== "function") return out;
    let osM, agDate = {};
    try {
        const rows = linhasOsPendentes.map(l => l.dados);
        for (const r of rows) { const d = ixcDataBR(r.AGENDAMENTO); if (d) agDate[String(r["ID OS"])] = d; }
        osM = Motor.montarOS(rows, hojeMeiaNoite(), Motor.PADRAO_PARAMS).os;
    } catch (e) { return out; }
    const hoje = hojeMeiaNoite().getTime(), amanha = hoje + 86400000;
    for (const o of osM) {
        if (!o.campo) continue;
        const id = String(o.id);
        if (jaTocadas.has(id)) continue;                 // já tem deslocamento/execução hoje
        const ag = agDate[id];
        if (!ag || ag.getTime() < hoje || ag.getTime() >= amanha) continue;   // agendada pra hoje
        if (TL_EXCLUIR.test(tlNorm(o.assunto))) continue;
        const tec = (o.agendaIxc && o.agendaIxc.tecnico) || (o.visitantes && o.visitantes[0]) || null;
        if (!tec) continue;
        out.push({ id, tec, cliente: o.cliente, cidade: o.cidade, assunto: o.assunto, agendamento: ag });
    }
    return out;
}

/** Monta as linhas de técnico (escala do dia) com os blocos de cada um. */
function tlMontar(mov, ordensMap, previstas, escalaDia) {
    const agora = new Date();
    const porOs = tlPorOs(mov);

    // técnicos da escala de hoje: nome, cidade, setor, dupla
    const linhasTec = [];      // { nome, chaveNorm, tech, cidade, setor, dupla, blocos:[] }
    const bate = (typeof Motor !== "undefined" && Motor.nomeBate) ? Motor.nomeBate : () => false;
    for (const d of (escalaDia || [])) {
        if (!d.trabalha) continue;
        const setor = d.resumo.situacao === "manutencao" ? "Manutenção" : "Instalação";
        linhasTec.push({
            nome: d.tech.nome, tech: d.tech, cidade: d.resumo.cidade || "Sem cidade",
            setor, dupla: !!d.parceiro, blocos: []
        });
    }
    const achaTec = nome => linhasTec.find(lt => bate(nome, lt.tech));

    const foraEscala = new Map();   // cidade -> linha sintética "fora da escala"
    function destino(nome, cidade) {
        const lt = achaTec(nome);
        if (lt) return lt;
        const c = cidade || "Sem cidade";
        if (!foraEscala.has(c)) foraEscala.set(c, { nome: "Fora da escala", cidade: c, setor: "", dupla: false, blocos: [], fora: true });
        return foraEscala.get(c);
    }

    // blocos a partir das movimentações (deslocamento/execução/finalização)
    for (const [id, o] of porOs) {
        const info = ordensMap.get(id) || {};
        if (TL_EXCLUIR.test(tlNorm(info.assunto))) continue;
        const tec = o.tec || info.tecnico_responsavel;
        if (!tec) continue;
        const dupla = (achaTec(tec) || {}).dupla || false;
        const exp = tlEsperado(info.assunto, dupla);
        const comum = { id, cli: info.cliente, a: info.assunto, exp };
        const st = tlNorm(o.status);
        const lt = destino(tec, info.cidade);

        if (o.fim) {
            const ini = o.exec || o.desloc || new Date(o.fim.getTime() - exp * 60000);
            lt.blocos.push({ ...comum, t: "fin", s: ini, e: o.fim, aproxIni: !(o.exec || o.desloc) });
        } else if (st.includes("execu") || o.exec) {
            lt.blocos.push({ ...comum, t: "exec", s: o.exec || o.desloc || agora, e: null });
            if (o.desloc && o.exec && o.desloc < o.exec) lt.blocos.push({ t: "desloc", s: o.desloc, e: o.exec });
        } else if (st === "deslocamento" || o.desloc) {
            lt.blocos.push({ ...comum, t: "desloc", s: o.desloc || agora, e: null });
        }
    }

    // blocos previstos (agendadas ainda não iniciadas)
    for (const p of previstas) {
        const lt = destino(p.tec, p.cidade);
        const dupla = lt.dupla;
        const exp = tlEsperado(p.assunto, dupla);
        const fim = new Date(p.agendamento.getTime() + exp * 60000);
        lt.blocos.push({ t: "prev", id: p.id, cli: p.cliente, a: p.assunto, exp, s: p.agendamento, e: fim, atras: p.agendamento < agora });
    }

    for (const [, lt] of foraEscala) linhasTec.push(lt);

    // cidades (ordenadas), e ordena técnicos dentro da cidade (quem tem mais OS primeiro)
    linhasTec.forEach(lt => lt.blocos.sort((a, b) => (a.s - b.s)));
    const cidades = [...new Set(linhasTec.map(lt => lt.cidade))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    return { linhasTec, cidades, agora };
}

// ---------------- render ----------------
let tlDados = null, tlCidade = "__all__", tlCarregando = false, tlEm = 0, tlTimer = null;

const TL_CSS = `
#agendaTimelineConteudo{ --tl-head-bg:#2b3a57; --tl-head-fg:#eef2fb; --tl-head-line:rgba(255,255,255,.16);
  --tl-verde:#15803d; --tl-verde-bg:#e6f4ea; --tl-azul:#2563eb; --tl-azul-bg:#e6edfd;
  --tl-amarelo:#b45309; --tl-amarelo-bg:#fbecd6; --tl-vermelho:#dc2626; --tl-vermelho-bg:#fbe4e4;
  --tl-cinza:#64748b; --tl-cinza-bg:#eef1f6; --tl-agora:#e5352b; }
html[data-tema="dark"] #agendaTimelineConteudo{ --tl-head-bg:#0e3a63; --tl-head-fg:#d7e8fb; --tl-head-line:rgba(255,255,255,.12);
  --tl-verde:#34d399; --tl-verde-bg:#143227; --tl-azul:#60a5fa; --tl-azul-bg:#15274a;
  --tl-amarelo:#fbbf24; --tl-amarelo-bg:#3a2d12; --tl-vermelho:#f87171; --tl-vermelho-bg:#3a1a1a;
  --tl-cinza:#94a3b8; --tl-cinza-bg:#1b2740; --tl-agora:#fb5a50; }

.tl-tabs{ display:flex; flex-wrap:wrap; gap:8px; margin:0 0 12px; }
.tl-tab{ font:inherit; font-size:13px; font-weight:600; color:var(--cor-texto-suave); background:var(--cor-superficie);
  border:1px solid var(--cor-borda); border-radius:999px; padding:6px 14px; cursor:pointer; }
.tl-tab:hover{ border-color:var(--cor-texto-suave); }
.tl-tab.on{ background:var(--tl-azul); border-color:var(--tl-azul); color:#fff; }
.tl-tab .c{ opacity:.75; font-weight:700; margin-left:5px; }

.tl-legend{ display:flex; flex-wrap:wrap; gap:10px 16px; margin:0 0 12px; font-size:12.5px; color:var(--cor-texto-suave); align-items:center; }
.tl-legend .it{ display:inline-flex; align-items:center; gap:7px; }
.tl-sw{ width:20px; height:12px; border-radius:4px; flex:none; }
.tl-sw.fin{ background:var(--tl-verde-bg); border:1.5px solid var(--tl-verde); }
.tl-sw.over{ background:var(--tl-amarelo-bg); border:1.5px solid var(--tl-amarelo); }
.tl-sw.exec{ background:var(--tl-azul-bg); border:1.5px solid var(--tl-azul); }
.tl-sw.desloc{ background:var(--tl-cinza-bg); border:1.5px dashed var(--tl-cinza); }
.tl-sw.prev{ background:transparent; border:1.5px dashed var(--cor-texto-suave); }
.tl-sw.agora{ width:3px; height:14px; border-radius:2px; background:var(--tl-agora); }

.tl-board{ background:var(--cor-superficie); border:1px solid var(--cor-borda); border-radius:14px; overflow:auto; }
.tl-grid{ position:relative; display:grid; }
.tl-cell{ border-bottom:1px solid var(--cor-borda); }
.tl-corner,.tl-name{ position:sticky; left:0; z-index:4; background:var(--cor-superficie); border-right:1px solid var(--cor-borda); }
.tl-head{ position:sticky; top:0; z-index:5; background:var(--tl-head-bg); border-bottom-color:var(--tl-head-line); }
.tl-corner{ z-index:6; display:flex; align-items:center; padding:0 14px; font-size:11.5px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:var(--tl-head-fg); background:var(--tl-head-bg); border-right-color:var(--tl-head-line); }
.tl-hours{ position:relative; background:var(--tl-head-bg); }
.tl-htick{ position:absolute; top:0; bottom:0; display:flex; align-items:center; padding-left:7px; font-size:12px; font-weight:600; color:var(--tl-head-fg); border-left:1px solid var(--tl-head-line); font-variant-numeric:tabular-nums; }
.tl-cidade-sep{ grid-column:1/-1; position:sticky; left:0; background:var(--cor-fundo-suave,rgba(0,0,0,.04)); font-size:11.5px; font-weight:800; text-transform:uppercase; letter-spacing:.04em; color:var(--cor-texto-suave); padding:5px 14px; border-bottom:1px solid var(--cor-borda); }

.tl-name{ padding:8px 12px; display:flex; flex-direction:column; justify-content:center; gap:3px; }
.tl-name .nm{ font-size:13.5px; font-weight:600; line-height:1.15; }
.tl-name .mt{ display:flex; align-items:center; gap:6px; font-size:11px; color:var(--cor-texto-suave); }
.tl-pill{ font-size:10.5px; font-weight:700; padding:1px 7px; border-radius:999px; }
.tl-pill.dupla{ color:var(--tl-azul); background:var(--tl-azul-bg); }
.tl-pill.solo{ color:var(--tl-cinza); background:var(--tl-cinza-bg); }
.tl-name.semos .nm, .tl-name.fora .nm{ color:var(--cor-texto-suave); }

.tl-lane{ position:relative; background-image:repeating-linear-gradient(90deg,var(--cor-borda) 0 1px,transparent 1px var(--tl-hourw)); }
.tl-blk{ position:absolute; border-radius:6px; padding:3px 7px; overflow:hidden; display:flex; flex-direction:column; justify-content:center; gap:1px; }
.tl-blk .os{ font-size:11px; font-weight:700; line-height:1.1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.tl-blk .cli{ font-size:10px; line-height:1.1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; opacity:.82; }
.tl-blk .perf{ font-size:10px; font-weight:700; line-height:1.1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.tl-blk.fin{ background:var(--tl-verde-bg); border:1px solid var(--tl-verde); color:var(--tl-verde); }
.tl-blk.fin-over{ background:var(--tl-amarelo-bg); border:1px solid var(--tl-amarelo); color:var(--tl-amarelo); }
.tl-blk.exec{ background:var(--tl-azul-bg); border:1px solid var(--tl-azul); color:var(--tl-azul); box-shadow:0 0 0 2px color-mix(in srgb,var(--tl-azul) 16%,transparent); }
.tl-blk.exec.over{ background:var(--tl-amarelo-bg); border-color:var(--tl-amarelo); color:var(--tl-amarelo); }
.tl-blk.desloc{ background:var(--tl-cinza-bg); border:1px dashed var(--tl-cinza); color:var(--tl-cinza); }
.tl-blk.prev{ background:transparent; border:1px dashed var(--cor-texto-suave); color:var(--cor-texto-suave); }
.tl-blk.atras{ background:var(--tl-vermelho-bg); border:1px dashed var(--tl-vermelho); color:var(--tl-vermelho); }
.tl-semos-chip{ position:absolute; top:8px; left:10px; font-size:11.5px; color:var(--cor-texto-suave); border:1px dashed var(--cor-borda); border-radius:999px; padding:2px 11px; }

.tl-nowline{ position:absolute; top:0; bottom:0; width:2px; background:var(--tl-agora); z-index:3; pointer-events:none; transition:left .5s linear; }
.tl-nowflag{ position:absolute; top:-1px; left:50%; transform:translateX(-50%); background:var(--tl-agora); color:#fff; font-size:11px; font-weight:600; padding:2px 7px; border-radius:0 0 7px 7px; white-space:nowrap; font-variant-numeric:tabular-nums; }

.tl-cards{ display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-top:14px; }
.tl-card{ background:var(--cor-superficie); border:1px solid var(--cor-borda); border-radius:12px; padding:14px 16px; min-width:0; }
.tl-card h3{ font-size:13px; margin:0 0 12px; display:flex; align-items:center; gap:6px; }
.tl-card h3 .ct{ margin-left:auto; font-size:11px; font-weight:600; color:var(--cor-texto-suave); }
.tl-perf-row{ display:flex; gap:12px; margin-bottom:12px; }
.tl-tile{ flex:1; border-radius:10px; padding:12px 14px; border:1px solid var(--cor-borda); }
.tl-tile .n{ font-size:28px; font-weight:800; line-height:1; font-variant-numeric:tabular-nums; }
.tl-tile .l{ font-size:12px; margin-top:4px; color:var(--cor-texto-suave); }
.tl-tile.ok{ background:var(--tl-verde-bg); border-color:color-mix(in srgb,var(--tl-verde) 35%,transparent); }
.tl-tile.ok .n{ color:var(--tl-verde); }
.tl-tile.bad{ background:var(--tl-amarelo-bg); border-color:color-mix(in srgb,var(--tl-amarelo) 35%,transparent); }
.tl-tile.bad .n{ color:var(--tl-amarelo); }
.tl-pbar{ height:11px; border-radius:999px; overflow:hidden; display:flex; background:var(--cor-fundo-suave,rgba(0,0,0,.06)); }
.tl-pbar i{ display:block; height:100%; }
.tl-pbar .g{ background:var(--tl-verde); } .tl-pbar .a{ background:var(--tl-amarelo); }
.tl-pbar-leg{ font-size:11.5px; color:var(--cor-texto-suave); margin-top:6px; }
.tl-arow{ display:grid; grid-template-columns:1fr 46px 34px; align-items:center; gap:10px; padding:5px 0; border-bottom:1px solid var(--cor-borda); }
.tl-arow:last-child{ border-bottom:none; }
.tl-arow .an{ font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.tl-arow .ab{ height:9px; background:var(--cor-fundo-suave,rgba(0,0,0,.06)); border-radius:999px; overflow:hidden; }
.tl-arow .ab i{ display:block; height:100%; background:var(--tl-azul); border-radius:999px; }
.tl-arow .aq{ font-size:13px; font-weight:600; text-align:right; font-variant-numeric:tabular-nums; }
.tl-topo{ display:flex; align-items:center; gap:12px; margin-bottom:10px; flex-wrap:wrap; }
.tl-topo .tl-at{ font-size:12px; color:var(--cor-texto-suave); }
.tl-topo .tl-relogio{ margin-left:auto; font-size:18px; font-weight:700; font-variant-numeric:tabular-nums; }
.tl-vazio{ padding:28px 10px; text-align:center; color:var(--cor-texto-suave); }
@media (max-width:720px){ .tl-cards{ grid-template-columns:1fr; } }
`;

function tlRegistrarCss() {
    if (document.getElementById("tlCssTag")) return;
    const s = document.createElement("style");
    s.id = "tlCssTag"; s.textContent = TL_CSS;
    document.head.appendChild(s);
}

async function carregarTimelineAgenda(forcar = false) {
    const alvo = document.getElementById("agendaTimelineConteudo");
    if (!alvo || tlCarregando) return;
    tlRegistrarCss();

    if (tlDados && !forcar && (Date.now() - tlEm) < 120000) { tlRender(); return; }
    tlCarregando = true;
    if (forcar) invalidarCacheOsPendentes();
    alvo.innerHTML = `<div class="tl-vazio">Montando a timeline do dia…</div>`;
    try {
        const [mov, linhasOs, techsEscala] = await Promise.all([
            tlBuscarMovHoje(),
            typeof buscarOsPendentesCacheado === "function" ? buscarOsPendentesCacheado() : [],
            typeof carregarEscalaTecnicos === "function" ? carregarEscalaTecnicos().catch(() => []) : []
        ]);
        const porOs = tlPorOs(mov);
        const ids = [...porOs.keys()];
        const ordensMap = await tlBuscarOrdens(ids);
        const jaTocadas = new Set(ids);
        const previstas = tlAgendadasPrevistas(linhasOs, jaTocadas);
        const escalaDia = (typeof EscalaDia !== "undefined" && EscalaDia.montarDia)
            ? EscalaDia.montarDia(techsEscala, hojeMeiaNoite()) : [];
        tlDados = tlMontar(mov, ordensMap, previstas, escalaDia);
        tlEm = Date.now();
        tlRender();
        if (!tlTimer) tlTimer = setInterval(tlTick, 30000);
    } catch (erro) {
        console.error("Timeline:", erro);
        alvo.innerHTML = `<div class="tl-vazio">Não consegui montar a timeline. ${escaparHtml(erro.message || "")}</div>`;
    } finally {
        tlCarregando = false;
    }
}

const tlX = h => (h - TL_DIA_INI) * _tlHourW;

function tlRender() {
    const alvo = document.getElementById("agendaTimelineConteudo");
    if (!alvo || !tlDados) return;
    const { linhasTec, cidades } = tlDados;

    const cidadesTab = cidades.filter(c => linhasTec.some(lt => lt.cidade === c));
    if (tlCidade !== "__all__" && !cidadesTab.includes(tlCidade)) tlCidade = "__all__";
    const conta = c => linhasTec.filter(lt => lt.cidade === c).length;

    alvo.innerHTML = `
      <div class="tl-topo">
        <div class="tl-tabs" id="tlTabs">
          <button type="button" class="tl-tab" data-c="__all__">Todas <span class="c">${linhasTec.length}</span></button>
          ${cidadesTab.map(c => `<button type="button" class="tl-tab" data-c="${escaparHtml(c)}">${escaparHtml(c)} <span class="c">${conta(c)}</span></button>`).join("")}
        </div>
        <span class="tl-relogio" id="tlRelogio">--:--</span>
      </div>
      <div class="tl-legend">
        <span class="it"><span class="tl-sw fin"></span> Feita no tempo</span>
        <span class="it"><span class="tl-sw over"></span> Passou do tempo</span>
        <span class="it"><span class="tl-sw exec"></span> Em execução</span>
        <span class="it"><span class="tl-sw desloc"></span> Deslocamento</span>
        <span class="it"><span class="tl-sw prev"></span> Prevista</span>
        <span class="it"><span class="tl-sw agora"></span> Agora</span>
        <span class="tl-at">atualizado ${tlFmtH(new Date(tlEm))}</span>
      </div>
      <div class="tl-board" id="tlBoard"><div class="tl-grid" id="tlGrid"></div></div>
      <div class="tl-cards">
        <div class="tl-card">
          <h3>Desempenho de hoje <span class="ct" id="tlPerfCid"></span></h3>
          <div class="tl-perf-row">
            <div class="tl-tile ok"><div class="n" id="tlOk">0</div><div class="l">Feitas no tempo esperado</div></div>
            <div class="tl-tile bad"><div class="n" id="tlBad">0</div><div class="l">Passaram do tempo esperado</div></div>
          </div>
          <div class="tl-pbar"><i class="g" id="tlBarOk"></i><i class="a" id="tlBarBad"></i></div>
          <div class="tl-pbar-leg" id="tlPbarLeg"></div>
        </div>
        <div class="tl-card">
          <h3>Assuntos do dia <span class="ct" id="tlAssCid"></span></h3>
          <div id="tlAssuntos"></div>
        </div>
      </div>`;

    document.querySelectorAll("#tlTabs .tl-tab").forEach(b => {
        b.classList.toggle("on", b.dataset.c === tlCidade);
        b.addEventListener("click", () => { tlCidade = b.dataset.c; tlRender(); });
    });

    tlDesenharGrade();
    tlResumo();
    tlTick();
}

function tlDesenharGrade() {
    const grid = document.getElementById("tlGrid"), board = document.getElementById("tlBoard");
    if (!grid || !board) return;
    const { linhasTec } = tlDados;
    const lista = tlCidade === "__all__" ? linhasTec : linhasTec.filter(lt => lt.cidade === tlCidade);

    const janela = TL_JANELA_FIM - TL_JANELA_INI;
    _tlHourW = Math.max(74, Math.floor((board.clientWidth - TL_NAMEW) / janela));
    const laneW = (TL_DIA_FIM - TL_DIA_INI) * _tlHourW;

    let html = `<div class="tl-cell tl-corner tl-head">Técnico</div><div class="tl-cell tl-head tl-hours" style="height:38px">`;
    for (let h = TL_DIA_INI; h < TL_DIA_FIM; h++) html += `<span class="tl-htick" style="left:${tlX(h)}px">${h}h</span>`;
    html += `</div>`;

    // agrupa por cidade quando for "Todas"
    let cidadeAtual = null;
    lista.forEach(lt => {
        if (tlCidade === "__all__" && lt.cidade !== cidadeAtual) {
            cidadeAtual = lt.cidade;
            html += `<div class="tl-cidade-sep">${escaparHtml(cidadeAtual)}</div>`;
        }
        // atribui sub-faixas pra blocos que se sobrepõem
        const faixas = tlFaixas(lt.blocos);
        const alturaLinha = Math.max(1, faixas.n) * 42 + 10;
        const tag = lt.fora ? "" : (lt.dupla ? `<span class="tl-pill dupla">dupla</span>` : `<span class="tl-pill solo">sozinho</span>`);
        const sub = lt.setor ? (tlCidade === "__all__" ? lt.setor : lt.setor) : (lt.fora ? "fora da escala" : "");
        html += `<div class="tl-cell tl-name${lt.blocos.length ? "" : " semos"}${lt.fora ? " fora" : ""}" style="min-height:${alturaLinha}px">
            <span class="nm">${escaparHtml(lt.nome)}</span><span class="mt">${tag}${sub ? `<span>${escaparHtml(sub)}</span>` : ""}</span></div>`;
        let lane = `<div class="tl-cell tl-lane" style="min-height:${alturaLinha}px">`;
        if (!lt.blocos.length) lane += `<span class="tl-semos-chip">sem OS hoje</span>`;
        lt.blocos.forEach((b, i) => lane += tlBlocoHtml(b, faixas.de[i]));
        lane += `</div>`;
        html += lane;
    });
    html += `<div class="tl-nowline" id="tlNowline"><span class="tl-nowflag" id="tlNowflag">--:--</span></div>`;

    grid.style.width = (TL_NAMEW + laneW) + "px";
    grid.style.gridTemplateColumns = TL_NAMEW + "px " + laneW + "px";
    grid.style.setProperty("--tl-hourw", _tlHourW + "px");
    grid.innerHTML = html;
    board.scrollLeft = tlX(TL_JANELA_INI);
}

/** Atribui cada bloco a uma sub-faixa (0,1,2…) evitando sobreposição. Retorna {de:[], n}. */
function tlFaixas(blocos) {
    const fimDe = [];      // fim (ms) ocupado de cada sub-faixa
    const de = blocos.map(b => {
        const s = b.s.getTime(), e = (b.e || new Date()).getTime();
        let f = 0;
        while (f < fimDe.length && fimDe[f] > s + 1) f++;
        fimDe[f] = e;
        return f;
    });
    return { de, n: fimDe.length };
}

function tlBlocoHtml(b, faixa) {
    const agora = new Date();
    const live = b.e == null;
    const fim = live ? agora : b.e;
    const left = tlX(tlHoras(b.s));
    const w = Math.max(14, (tlHoras(fim) - tlHoras(b.s)) * _tlHourW);
    const top = 6 + faixa * 42;
    if (b.t === "desloc") {
        return `<div class="tl-blk desloc" data-live="${live ? 1 : 0}" data-s="${tlHoras(b.s)}" style="left:${left}px;width:${w}px;top:${top}px;height:34px" title="Deslocamento"><div class="os">🚚 deslocamento</div></div>`;
    }
    let cls = b.t, perf = "";
    if (b.t === "fin") {
        const act = (b.e - b.s) / 60000;
        if (act > b.exp) { cls = "fin fin-over"; perf = `<span>▲ +${Math.round(act - b.exp)}min</span>`; }
        else perf = `<span>✔ no tempo</span>`;
    } else if (b.t === "exec") {
        perf = `<span class="tl-perf-live"></span>`;
    } else if (b.t === "prev") {
        if (b.atras) { cls = "prev atras"; perf = `<span>não iniciada</span>`; }
        else perf = `<span>previsto ${b.exp}min</span>`;
    }
    const titulo = `#${b.id} · ${b.cli || ""} · ${tlCurto(b.a)}`;
    return `<div class="tl-blk ${cls}" data-live="${live ? 1 : 0}" data-s="${tlHoras(b.s)}" data-exp="${b.exp}" style="left:${left}px;width:${w}px;top:${top}px;height:34px" title="${escaparHtml(titulo)}">
        <div class="os">#${escaparHtml(b.id)} ${escaparHtml(tlCurto(b.a))}</div>
        <div class="cli">${escaparHtml(b.cli || "—")}</div>
        <div class="perf">${perf}</div></div>`;
}

function tlResumo() {
    const { linhasTec } = tlDados;
    const lista = tlCidade === "__all__" ? linhasTec : linhasTec.filter(lt => lt.cidade === tlCidade);
    const rotulo = tlCidade === "__all__" ? "todas as cidades" : tlCidade;
    let ok = 0, bad = 0; const ass = {};
    lista.forEach(lt => lt.blocos.forEach(b => {
        if (b.t === "desloc") return;
        if (b.id) ass[tlCurto(b.a)] = (ass[tlCurto(b.a)] || 0) + 1;
        if (b.t === "fin") { const act = (b.e - b.s) / 60000; (act > b.exp ? bad++ : ok++); }
    }));
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set("tlOk", ok); set("tlBad", bad); set("tlPerfCid", rotulo); set("tlAssCid", rotulo);
    const tot = ok + bad || 1;
    const bo = document.getElementById("tlBarOk"), bb = document.getElementById("tlBarBad");
    if (bo) bo.style.width = (ok / tot * 100) + "%";
    if (bb) bb.style.width = (bad / tot * 100) + "%";
    set("tlPbarLeg", (ok + bad) ? `${Math.round(ok / tot * 100)}% das ${ok + bad} finalizadas dentro do tempo esperado` : "Sem finalizadas ainda.");
    const ents = Object.entries(ass).sort((a, b) => b[1] - a[1]);
    const max = Math.max(1, ...ents.map(e => e[1]));
    const box = document.getElementById("tlAssuntos");
    if (box) box.innerHTML = ents.length
        ? ents.map(([a, q]) => `<div class="tl-arow"><span class="an">${escaparHtml(a)}</span><span class="ab"><i style="width:${q / max * 100}%"></i></span><span class="aq">${q}</span></div>`).join("")
        : `<div class="tl-arow"><span class="an" style="color:var(--cor-texto-suave)">Nenhuma OS nesta cidade hoje.</span><span></span><span></span></div>`;
}

function tlTick() {
    const grid = document.getElementById("tlGrid");
    if (!grid || !tlDados) return;
    const d = new Date(), h = tlHoras(d);
    const rel = document.getElementById("tlRelogio"); if (rel) rel.textContent = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const nl = document.getElementById("tlNowline"), nf = document.getElementById("tlNowflag");
    if (nl) { nl.style.left = (TL_NAMEW + tlX(Math.min(TL_DIA_FIM, Math.max(TL_DIA_INI, h)))) + "px"; nf.textContent = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
    grid.querySelectorAll('.tl-blk[data-live="1"]').forEach(el => {
        const s = +el.dataset.s;
        el.style.width = Math.max(14, (h - s) * _tlHourW) + "px";
        const p = el.querySelector(".tl-perf-live");
        if (p) { const exp = +el.dataset.exp, el2 = (h - s) * 60, over = el2 > exp; el.classList.toggle("over", over);
            p.textContent = over ? `▲ passou +${Math.round(el2 - exp)}min` : `▶ ${Math.round(el2)}min · no tempo`; }
    });
}

// re-encaixa ao redimensionar enquanto a aba está visível
let _tlRz;
window.addEventListener("resize", () => {
    const alvo = document.getElementById("agendaTimelineConteudo");
    if (!alvo || alvo.hidden || !tlDados) return;
    clearTimeout(_tlRz); _tlRz = setTimeout(() => { tlDesenharGrade(); tlTick(); }, 150);
});
