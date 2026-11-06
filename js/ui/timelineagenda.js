const TL_DIA_INI = 0, TL_DIA_FIM = 24;
const TL_JANELA_INI = 8, TL_JANELA_FIM = 18;
const TL_NAMEW = 270;
const TL_ROW = 52;
let _tlHourW = 110;

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

// Filtrar movimentacoes direto por `data` varre a tabela inteira (sem índice, e
// a RLS faz join com ordens por linha) e estoura o statement timeout. Então:
// OS tocadas hoje vêm de ordens.atualizado_em (o robô marca a cada gravação) e
// as movimentações delas saem por ordem_id, que é indexado.
async function tlBuscarMovHoje() {
    const hoje = hojeMeiaNoite().toISOString();
    const ids = [];
    for (let de = 0; ; de += 1000) {
        const { data, error } = await supabaseClient
            .from("ordens").select("id")
            .gte("atualizado_em", hoje).order("id").range(de, de + 999);
        if (error) throw error;
        if (!data || !data.length) break;
        ids.push(...data.map(o => o.id));
        if (data.length < 1000) break;
    }

    const fatias = [];
    for (let i = 0; i < ids.length; i += 150) fatias.push(ids.slice(i, i + 150));
    const linhas = [];
    for (let i = 0; i < fatias.length; i += 6) {
        const partes = await Promise.all(fatias.slice(i, i + 6).map(async fatia => {
            const { data, error } = await supabaseClient
                .from("movimentacoes")
                .select("ordem_id, data, evento, status, mensagem")
                .in("ordem_id", fatia).gte("data", hoje).limit(5000);
            if (error) throw error;
            return data || [];
        }));
        for (const p of partes) linhas.push(...p);
    }
    return linhas.sort((a, b) => String(a.data).localeCompare(String(b.data)));
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
        } catch (e) {  }
    }
    return mapa;
}

function tlTecnicoDesloc(msg) {
    const m = String(msg || "").match(/usu[aá]rio\s+(.+?)\s*,\s*iniciou o deslocamento/i);
    return m ? m[1].trim() : null;
}

// Eventos que tiram a OS da mão do técnico sem fechar (alteração de setor,
// agendamento, reagendar): encerram a visita como "não concluída".
const TL_EV_INTERROMPE = new Set([4, 5, 10]);

// Uma OS pode ter várias visitas no dia (ex.: cliente ausente de manhã, outro
// técnico volta à tarde e finaliza). Cada deslocamento abre uma visita nova;
// ela termina no fechamento ou num evento de TL_EV_INTERROMPE.
function tlPorOs(mov) {
    const porOs = new Map();
    for (const e of mov) {
        const id = String(e.ordem_id);
        let o = porOs.get(id);
        if (!o) { o = { id, visitas: [], aberta: null }; porOs.set(id, o); }
        const ev = +e.evento;
        const dt = e.data ? new Date(e.data) : null;
        const tecDesloc = ev === 2 ? tlTecnicoDesloc(e.mensagem) : null;
        const novaVisita = () => { const v = { desloc: null, exec: null, fim: null, encerrada: null, motivo: null, tec: null }; o.visitas.push(v); o.aberta = v; return v; };

        if (ev === 2 && (tecDesloc || tlNorm(e.status).includes("desloc"))) {
            const v = novaVisita();
            v.desloc = dt; v.tec = tecDesloc;
        } else if (ev === 9) {
            const v = o.aberta || novaVisita();
            if (!v.exec) v.exec = dt;
        } else if (ev === 6) {
            const v = o.aberta || novaVisita();
            v.fim = dt; o.aberta = null;
        } else if (TL_EV_INTERROMPE.has(ev) && o.aberta) {
            o.aberta.encerrada = dt;
            o.aberta.motivo = tlNorm(e.status).includes("encaminh") ? "encaminhada" : "reagendada";
            o.aberta = null;
        }
    }
    return porOs;
}

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
        if (jaTocadas.has(id)) continue;
        const ag = agDate[id];
        if (!ag || ag.getTime() < hoje || ag.getTime() >= amanha) continue;
        if (TL_EXCLUIR.test(tlNorm(o.assunto))) continue;
        const tec = (o.agendaIxc && o.agendaIxc.tecnico) || (o.visitantes && o.visitantes[0]) || null;
        if (!tec) continue;
        out.push({ id, tec, cliente: o.cliente, cidade: o.cidade, assunto: o.assunto, agendamento: ag });
    }
    return out;
}

function tlMontar(mov, ordensMap, previstas, escalaDia) {
    const agora = new Date();
    const porOs = tlPorOs(mov);

    const linhasTec = [];
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

    const foraEscala = new Map();
    function destino(nome, cidade) {
        const lt = achaTec(nome);
        if (lt) return lt;
        const c = cidade || "Sem cidade";
        if (!foraEscala.has(c)) foraEscala.set(c, { nome: "Fora da escala", cidade: c, setor: "", dupla: false, blocos: [], fora: true });
        return foraEscala.get(c);
    }

    for (const [id, o] of porOs) {
        const info = ordensMap.get(id) || {};
        if (TL_EXCLUIR.test(tlNorm(info.assunto))) continue;
        for (const v of o.visitas) {
            const tec = v.tec || info.tecnico_responsavel;
            if (!tec) continue;
            const lt = destino(tec, info.cidade);
            const exp = tlEsperado(info.assunto, lt.dupla);
            const ini = v.desloc || v.exec;
            if (!ini && !v.fim) continue;
            const start = ini || new Date(v.fim.getTime() - exp * 60000);
            const descFim = (v.desloc && v.exec && v.desloc < v.exec) ? v.exec : null;
            let estado, perf = "", fim = v.fim;
            if (v.fim) {
                const act = (v.fim - (v.exec || v.desloc || start)) / 60000;
                estado = act > exp ? "fin-over" : "fin";
                perf = act > exp ? `▲ +${Math.round(act - exp)}min` : "✔ no tempo";
            } else if (v.encerrada) {
                estado = "interr";
                perf = `↺ não concluída · ${v.motivo}`;
                fim = v.encerrada;
            } else if (v.exec) {
                estado = "exec";
            } else {
                estado = "desloc";
            }
            lt.blocos.push({ tipo: "os", id, cli: info.cliente, a: info.assunto, exp, estado, perf,
                ini: start, descFim, fim: fim || null, execIni: v.exec || start });
        }
    }

    const prevPorTec = new Map();
    for (const p of previstas) { const lt = destino(p.tec, p.cidade); (prevPorTec.get(lt) || prevPorTec.set(lt, []).get(lt)).push(p); }
    for (const [lt, lista] of prevPorTec) {
        let cursor = agora.getTime();
        lt.blocos.forEach(b => { if (b.tipo === "os") { const e = (b.fim || agora).getTime(); if (e > cursor) cursor = e; } });
        const fut = [], over = [];
        lista.forEach(p => (p.agendamento.getTime() > agora.getTime() ? fut : over).push(p));
        fut.forEach(p => { const exp = tlEsperado(p.assunto, lt.dupla); lt.blocos.push({ tipo: "prev", id: p.id, cli: p.cliente, a: p.assunto, exp, ini: p.agendamento, fim: new Date(p.agendamento.getTime() + exp * 60000) }); });
        over.sort((a, b) => a.agendamento - b.agendamento).forEach(p => {
            const exp = tlEsperado(p.assunto, lt.dupla);
            const s = new Date(cursor), e = new Date(cursor + exp * 60000); cursor += exp * 60000;
            lt.blocos.push({ tipo: "prev", id: p.id, cli: p.cliente, a: p.assunto, exp, ini: s, fim: e, fila: true });
        });
    }

    for (const [, lt] of foraEscala) linhasTec.push(lt);

    linhasTec.forEach(lt => lt.blocos.sort((a, b) => (a.ini - b.ini)));

    linhasTec.sort((a, b) =>
        a.cidade.localeCompare(b.cidade, "pt-BR") ||
        (a.fora === b.fora ? 0 : a.fora ? 1 : -1) ||
        a.nome.localeCompare(b.nome, "pt-BR"));
    const cidades = [...new Set(linhasTec.map(lt => lt.cidade))];
    return { linhasTec, cidades, agora };
}

let tlDados = null, tlCidade = "__all__", tlCarregando = false, tlEm = 0, tlTimer = null;

const TL_CSS = `
#agendaTimelineConteudo{ --tl-head-bg:#2b3a57; --tl-head-fg:#eef2fb; --tl-head-line:rgba(255,255,255,.16);
  --tl-verde:#15803d; --tl-verde-bg:#e6f4ea; --tl-azul:#2563eb; --tl-azul-bg:#e6edfd;
  --tl-amarelo:#b45309; --tl-amarelo-bg:#fbecd6; --tl-vermelho:#dc2626; --tl-vermelho-bg:#fbe4e4;
  --tl-cinza:#64748b; --tl-cinza-bg:#eef1f6; --tl-agora:#e5352b;
  --tl-roxo:#7c3aed; --tl-roxo-bg:#efe7fd; --tl-rosa:#db2777; --tl-rosa-bg:#fce7f1;
  --tl-nome-bg:#e6effd; --tl-nome-fg:#1d4ed8; --tl-nome-marca:#60a5fa; --tl-zebra:rgba(30,60,110,.035); }
html[data-tema="dark"] #agendaTimelineConteudo{ --tl-head-bg:#0e3a63; --tl-head-fg:#d7e8fb; --tl-head-line:rgba(255,255,255,.12);
  --tl-verde:#34d399; --tl-verde-bg:#143227; --tl-azul:#60a5fa; --tl-azul-bg:#15274a;
  --tl-amarelo:#fbbf24; --tl-amarelo-bg:#3a2d12; --tl-vermelho:#f87171; --tl-vermelho-bg:#3a1a1a;
  --tl-cinza:#94a3b8; --tl-cinza-bg:#1b2740; --tl-agora:#fb5a50;
  --tl-roxo:#a78bfa; --tl-roxo-bg:#2a1f4a; --tl-rosa:#f472b6; --tl-rosa-bg:#3d1a2e;
  --tl-nome-bg:#1c3a63; --tl-nome-fg:#e3efff; --tl-nome-marca:#93c5fd; --tl-zebra:rgba(255,255,255,.028); }

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
.tl-sw.desloc{ background:var(--tl-roxo-bg); border:1.5px dashed var(--tl-roxo); }
.tl-sw.interr{ background:var(--tl-rosa-bg); border:1.5px dashed var(--tl-rosa); }
.tl-sw.prev{ background:transparent; border:1.5px dashed var(--cor-texto-suave); }
.tl-sw.atras{ background:var(--tl-vermelho-bg); border:1.5px dashed var(--tl-vermelho); }
.tl-sw.agora{ width:3px; height:14px; border-radius:2px; background:var(--tl-agora); }

.tl-board{ background:var(--cor-superficie); border:1px solid var(--cor-borda); border-radius:14px; overflow:auto; }
.tl-grid{ position:relative; display:grid; }
.tl-cell{ border-bottom:1px solid var(--cor-borda); }
.tl-corner,.tl-name{ position:sticky; left:0; z-index:20; background:var(--cor-superficie); border-right:1px solid var(--cor-borda); }
.tl-head{ position:sticky; top:0; z-index:10; background:var(--tl-head-bg); border-bottom-color:var(--tl-head-line); }
.tl-corner{ z-index:22; display:flex; align-items:center; padding:0 14px; font-size:11.5px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:var(--tl-head-fg); background:var(--tl-head-bg); border-right-color:var(--tl-head-line); }
.tl-hours{ position:relative; background:var(--tl-head-bg); }
.tl-htick{ position:absolute; top:0; bottom:0; display:flex; align-items:center; padding-left:7px; font-size:12px; font-weight:600; color:var(--tl-head-fg); border-left:1px solid var(--tl-head-line); font-variant-numeric:tabular-nums; }
.tl-cidade-sep{ grid-column:1/-1; position:sticky; left:0; background:var(--cor-fundo-suave,rgba(0,0,0,.05)); font-size:11.5px; font-weight:800; text-transform:uppercase; letter-spacing:.04em; color:var(--cor-texto); padding:6px 14px 6px 284px; border-bottom:1px solid var(--cor-borda); }

.tl-name{ padding:8px 14px 8px 16px; display:flex; flex-direction:column; justify-content:center; gap:3px;
  background:var(--tl-nome-bg); box-shadow:inset 3px 0 0 var(--tl-nome-marca); }
.tl-name .nm{ font-size:13.5px; font-weight:650; line-height:1.2; overflow-wrap:anywhere; color:var(--tl-nome-fg); }
.tl-name.zebra{ background:linear-gradient(var(--tl-zebra),var(--tl-zebra)),var(--tl-nome-bg); }
.tl-name.semos, .tl-name.fora{ box-shadow:inset 3px 0 0 var(--cor-borda); }
.tl-lane.zebra{ background-color:var(--tl-zebra); }
.tl-name .mt{ display:flex; align-items:center; gap:6px; font-size:11px; color:var(--cor-texto-suave); }
.tl-pill{ font-size:10.5px; font-weight:700; padding:1px 7px; border-radius:999px; }
.tl-pill.dupla{ color:var(--tl-azul); background:var(--tl-azul-bg); }
.tl-pill.solo{ color:var(--tl-cinza); background:var(--tl-cinza-bg); }
.tl-name.semos .nm, .tl-name.fora .nm{ color:var(--cor-texto-suave); }

.tl-lane{ position:relative; background-image:repeating-linear-gradient(90deg,var(--cor-borda) 0 1px,transparent 1px var(--tl-hourw)); }
.tl-blk{ position:absolute; z-index:1; border-radius:6px; padding:3px 7px; overflow:hidden; display:flex; flex-direction:column; justify-content:center; gap:1px; }
.tl-blk .os{ font-size:11px; font-weight:700; line-height:1.1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.tl-blk .cli{ font-size:10px; line-height:1.1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; opacity:.82; }
.tl-blk .perf{ font-size:10px; font-weight:700; line-height:1.1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.tl-blk.fin{ background:var(--tl-verde-bg); border:1px solid var(--tl-verde); color:var(--tl-verde); }
.tl-blk.fin-over{ background:var(--tl-amarelo-bg); border:1px solid var(--tl-amarelo); color:var(--tl-amarelo); }
.tl-blk.exec{ background:var(--tl-azul-bg); border:1px solid var(--tl-azul); color:var(--tl-azul); box-shadow:0 0 0 2px color-mix(in srgb,var(--tl-azul) 16%,transparent); }
.tl-blk.exec.over{ background:var(--tl-amarelo-bg); border-color:var(--tl-amarelo); color:var(--tl-amarelo); }
.tl-blk.desloc{ background:var(--tl-roxo-bg); border:1px dashed var(--tl-roxo); color:var(--tl-roxo); }
.tl-blk.prev{ background:transparent; border:1px dashed var(--cor-texto-suave); color:var(--cor-texto-suave); }
.tl-blk.prev.fila{ background:var(--cor-fundo-suave,rgba(0,0,0,.04)); }

/* CARD da OS: 1 só card com deslocamento (cinza) + execução/finalização, borda grossa envolvendo */
.tl-os{ position:absolute; z-index:1; border-radius:8px; overflow:hidden; border:2.5px solid var(--tl-cinza); background:var(--cor-superficie); }
.tl-os.fin{ border-color:var(--tl-verde); }
.tl-os.fin-over{ border-color:var(--tl-amarelo); }
.tl-os.exec{ border-color:var(--tl-azul); }
.tl-os.exec.over{ border-color:var(--tl-amarelo); }
.tl-seg-desl{ position:absolute; left:0; top:0; bottom:0; background:repeating-linear-gradient(45deg,color-mix(in srgb,var(--tl-roxo) 22%,transparent) 0 5px,transparent 5px 10px),var(--tl-roxo-bg); border-right:1px solid var(--cor-borda); }
.tl-corpo{ position:absolute; top:0; right:0; bottom:0; left:0; padding:3px 8px; display:flex; flex-direction:column; justify-content:center; gap:1px; overflow:hidden; }
.tl-os.fin .tl-corpo{ background:var(--tl-verde-bg); color:var(--tl-verde); }
.tl-os.fin-over .tl-corpo{ background:var(--tl-amarelo-bg); color:var(--tl-amarelo); }
.tl-os.exec .tl-corpo{ background:var(--tl-azul-bg); color:var(--tl-azul); }
.tl-os.exec.over .tl-corpo{ background:var(--tl-amarelo-bg); color:var(--tl-amarelo); }
.tl-corpo.desl{ background:var(--tl-roxo-bg); color:var(--tl-roxo); }
.tl-os.desloc{ border-color:var(--tl-roxo); border-style:dashed; }
.tl-os.interr{ border-style:dashed; border-color:var(--tl-rosa); }
.tl-os.interr .tl-corpo{ background:var(--tl-rosa-bg); color:var(--tl-rosa); }
.tl-os .os{ font-size:11px; font-weight:700; line-height:1.1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.tl-os .cli{ font-size:10px; line-height:1.1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; opacity:.82; }
.tl-os .perf{ font-size:10px; font-weight:700; line-height:1.1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
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
        <span class="it"><span class="tl-sw interr"></span> Não concluída (reagendada)</span>
        <span class="it"><span class="tl-sw prev"></span> Prevista</span>
        <span class="it"><span class="tl-sw atras"></span> Não iniciada (atrasada)</span>
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

    let cidadeAtual = null, nLinha = 0;
    lista.forEach(lt => {
        if (tlCidade === "__all__" && lt.cidade !== cidadeAtual) {
            cidadeAtual = lt.cidade;
            nLinha = 0;
            html += `<div class="tl-cidade-sep">${escaparHtml(cidadeAtual)}</div>`;
        }
        const zebra = nLinha++ % 2 ? " zebra" : "";

        const faixas = tlFaixas(lt.blocos);
        const alturaLinha = Math.max(1, faixas.n) * TL_ROW + 8;
        const tag = lt.fora ? "" : (lt.dupla ? `<span class="tl-pill dupla">dupla</span>` : `<span class="tl-pill solo">sozinho</span>`);
        const sub = lt.setor ? (tlCidade === "__all__" ? lt.setor : lt.setor) : (lt.fora ? "fora da escala" : "");
        html += `<div class="tl-cell tl-name${zebra}${lt.blocos.length ? "" : " semos"}${lt.fora ? " fora" : ""}" style="min-height:${alturaLinha}px">
            <span class="nm">${escaparHtml(lt.nome)}</span><span class="mt">${tag}${sub ? `<span>${escaparHtml(sub)}</span>` : ""}</span></div>`;
        let lane = `<div class="tl-cell tl-lane${zebra}" style="min-height:${alturaLinha}px">`;
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

function tlFaixas(blocos) {
    const fimDe = [];
    const de = blocos.map(b => {
        const s = b.ini.getTime(), e = (b.fim || new Date()).getTime();
        let f = 0;
        while (f < fimDe.length && fimDe[f] > s + 1) f++;
        fimDe[f] = e;
        return f;
    });
    return { de, n: fimDe.length };
}

function tlBlocoHtml(b, faixa) {
    const top = 6 + faixa * TL_ROW;
    const live = b.fim == null;
    const end = live ? new Date() : b.fim;
    const left = tlX(tlHoras(b.ini));
    const w = Math.max(16, (tlHoras(end) - tlHoras(b.ini)) * _tlHourW);
    const titulo = `#${b.id} · ${b.cli || ""} · ${tlCurto(b.a)}`;

    if (b.tipo === "prev") {
        return `<div class="tl-blk prev${b.fila ? " fila" : ""}" style="left:${left}px;width:${w}px;top:${top}px;height:${TL_ROW - 10}px" title="${escaparHtml(titulo)} · prevista">
            <div class="os">#${escaparHtml(b.id)} ${escaparHtml(tlCurto(b.a))}</div>
            <div class="cli">${escaparHtml(b.cli || "—")}</div>
            <div class="perf">previsto ${b.exp}min</div></div>`;
    }

    const deslocMs = b.descFim ? (b.descFim - b.ini) : (b.estado === "desloc" ? (end - b.ini) : 0);
    const deslW = Math.max(0, deslocMs / 3600000 * _tlHourW);
    const seg = (deslW > 0 && b.estado !== "desloc") ? `<div class="tl-seg-desl" style="width:${deslW.toFixed(1)}px"></div>` : "";
    let corpo;
    if (b.estado === "desloc") {
        corpo = `<div class="tl-corpo desl"><div class="os">🚚 #${escaparHtml(b.id)}</div><div class="perf tl-perf-live"></div></div>`;
    } else {
        const perf = b.estado === "exec" ? `<span class="tl-perf-live"></span>` : escaparHtml(b.perf || "");
        corpo = `<div class="tl-corpo" style="left:${deslW.toFixed(1)}px">
            <div class="os">#${escaparHtml(b.id)} ${escaparHtml(tlCurto(b.a))}</div>
            <div class="cli">${escaparHtml(b.cli || "—")}</div>
            <div class="perf">${perf}</div></div>`;
    }
    return `<div class="tl-os ${b.estado}" data-live="${live ? 1 : 0}" data-ini="${tlHoras(b.ini)}" data-exec="${tlHoras(b.execIni || b.ini)}" data-exp="${b.exp || 0}" style="left:${left}px;width:${w}px;top:${top}px;height:${TL_ROW - 10}px" title="${escaparHtml(titulo)}">
        ${seg}${corpo}</div>`;
}

function tlResumo() {
    const { linhasTec } = tlDados;
    const lista = tlCidade === "__all__" ? linhasTec : linhasTec.filter(lt => lt.cidade === tlCidade);
    const rotulo = tlCidade === "__all__" ? "todas as cidades" : tlCidade;
    let ok = 0, bad = 0; const ass = {};
    lista.forEach(lt => lt.blocos.forEach(b => {
        if (b.id) ass[tlCurto(b.a)] = (ass[tlCurto(b.a)] || 0) + 1;
        if (b.tipo === "os" && (b.estado === "fin" || b.estado === "fin-over")) (b.estado === "fin-over" ? bad++ : ok++);
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
    grid.querySelectorAll('.tl-os[data-live="1"]').forEach(el => {
        const ini = +el.dataset.ini, exec = +el.dataset.exec, exp = +el.dataset.exp;
        el.style.width = Math.max(16, (h - ini) * _tlHourW) + "px";
        const p = el.querySelector(".tl-perf-live");
        if (!p) return;
        if (el.classList.contains("desloc")) { p.textContent = `${Math.round((h - ini) * 60)}min em deslocamento`; return; }
        const min = (h - exec) * 60, over = min > exp;
        el.classList.toggle("over", over);
        p.textContent = over ? `▲ passou +${Math.round(min - exp)}min` : `▶ ${Math.round(min)}min · no tempo`;
    });
}

let _tlRz;
window.addEventListener("resize", () => {
    const alvo = document.getElementById("agendaTimelineConteudo");
    if (!alvo || alvo.hidden || !tlDados) return;
    clearTimeout(_tlRz); _tlRz = setTimeout(() => { tlDesenharGrade(); tlTick(); }, 150);
});
