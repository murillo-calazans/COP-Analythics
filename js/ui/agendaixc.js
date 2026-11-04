let agendaIxcCache = null;
let agendaIxcCarregando = false;

const AGENDA_IXC_STATUS = {
    "em execucao": { rotulo: "Em execução", cor: "#2563eb" },
    "execucao": { rotulo: "Em execução", cor: "#2563eb" },
    "deslocamento": { rotulo: "Deslocamento", cor: "#d97706" },
    "finalizada": { rotulo: "Finalizada", cor: "#16a34a" },
    "agendada": { rotulo: "Agendada", cor: "#6b7280" },
    "aberta": { rotulo: "Aberta", cor: "#6b7280" },
    "encaminhada": { rotulo: "Encaminhada", cor: "#6b7280" },
    "assumida": { rotulo: "Assumida", cor: "#7c3aed" },
    "aguardando agendamento": { rotulo: "Aguardando", cor: "#6b7280" }
};

function ixcNorm(t) {
    return String(t ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
}

function ixcMeiaNoite() {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
}

const IXC_DOW = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };

function ixcDataBR(s) {
    const m = String(s || "").match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    return m && m[3] !== "0000"
        ? new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0))
        : null;
}

function ixcDiaPedido(texto, dataMsg) {
    const t = ixcNorm(texto);
    const dias = Object.keys(IXC_DOW).join("|");

    const re = new RegExp(`(?:pediu|pede|solicit(?:a|ou|ar|am)\\b|reagendar|reagendou|remarcar|remarcou|volta\\w*|retorn\\w*|agendar)[^.;\\d]{0,25}?(?:\\b(${dias})\\b|(\\d{1,2})\\/(\\d{1,2}))`, "g");
    let last = null, m;
    while ((m = re.exec(t))) last = m;
    if (!last) return null;
    if (last[1]) {
        const d = new Date(dataMsg); d.setHours(0, 0, 0, 0);
        let add = (IXC_DOW[last[1]] - d.getDay() + 7) % 7; if (add === 0) add = 7;
        d.setDate(d.getDate() + add);
        return d;
    }
    if (last[2] && +last[3] >= 1 && +last[3] <= 12) return new Date(dataMsg.getFullYear(), +last[3] - 1, +last[2]);
    return null;
}

function ixcDiaPedidoDaOs(msgs) {
    const evs = (msgs || [])
        .filter(e => ["5", "10"].includes(String(e.evento)) && e.data)
        .sort((a, b) => b.data - a.data);
    for (const e of evs) { const p = ixcDiaPedido(e.msg, e.data); if (p) return p; }
    return null;
}

async function buscarOsPendentes() {
    if (typeof supabaseClient === "undefined") return [];

    if (typeof buscarTodasLinhasKeysetParalelo === "function")
        return buscarTodasLinhasKeysetParalelo("os_pendentes", "id, dados, capturado_em", "id");
    const linhas = [];
    for (let de = 0; ; de += 1000) {
        const { data, error } = await supabaseClient
            .from("os_pendentes").select("dados, capturado_em").order("id").range(de, de + 999);
        if (error || !data || !data.length) break;
        linhas.push(...data);
        if (data.length < 1000) break;
    }
    return linhas;
}

let _osPendentesPromise = null, _osPendentesEm = 0;
async function buscarOsPendentesCacheado(maxIdadeMs = 120000) {
    if (_osPendentesPromise && (Date.now() - _osPendentesEm) < maxIdadeMs) return _osPendentesPromise;
    _osPendentesEm = Date.now();
    _osPendentesPromise = buscarOsPendentes().catch(e => { _osPendentesPromise = null; throw e; });
    return _osPendentesPromise;
}
function invalidarCacheOsPendentes() { _osPendentesPromise = null; _osPendentesEm = 0; }

function mesclarFinalizadasHoje(porTec, techs, separar, hoje) {
    const ordens = APP?.dados?.ordens;
    if (!ordens || !ordens.size || typeof IndicatorEngine === "undefined" || typeof Motor === "undefined") return;
    const amanha = hoje.getTime() + 24 * 3600 * 1000;
    const dentroDeHoje = d => d && d.getTime() >= hoje.getTime() && d.getTime() < amanha;

    for (const ordem of ordens.values()) {
        if (!dentroDeHoje(ordem.dataFechamento)) continue;
        if (ixcNorm(ordem.statusAtual) !== "finalizada") continue;

        const info = IndicatorEngine.analisarEventosOS(ordem);
        const fech = info?.ultimoFechamento;
        const quando = fech?.data || ordem.dataFechamento;
        if (!dentroDeHoje(quando)) continue;

        const nomeFechou = IndicatorEngine.nomeResponsavelFechamento(fech);
        if (!nomeFechou) continue;
        const tech = techs.find(t => Motor.nomeBate(nomeFechou, t));
        if (!tech) continue;

        const infoT = separar(tech.nome);
        const chave = tech.id || infoT.nome;
        if (!porTec.has(chave)) {
            const diaEscala = typeof EscalaDia !== "undefined" ? EscalaDia.regras.resumo(tech, hoje) : {};
            const setorChave = diaEscala.situacao === "instalador" || diaEscala.situacao === "manutencao"
                ? diaEscala.situacao
                : (ixcNorm(tech.setor).startsWith("manut") ? "manutencao" : "instalador");
            porTec.set(chave, { nome: infoT.nome, terceira: infoT.terceira, setor: tech.setor, setorChave, cidade: diaEscala.cidade || tech.cidade || "Sem cidade", oss: [] });
        }
        const grupo = porTec.get(chave);
        if (grupo.oss.some(x => String(x.id) === String(ordem.id))) continue;
        grupo.oss.push({
            id: ordem.id, cliente: ordem.cliente, cidade: ordem.cidade, bairro: ordem.bairro, assunto: ordem.assunto,
            status: "Finalizada", statusNorm: "finalizada", reagendamentos: 0,
            alerta: false, diaMsg: null, finalizada: true, fonte: "ordens", horaFim: quando
        });
    }
}

function montarAgendaIxc(linhasBrutas, techsEscala) {
    const rows = linhasBrutas.map(l => l.dados);

    const capturadoEm = linhasBrutas.reduce((max, l) => (l.capturado_em && (!max || l.capturado_em > max) ? l.capturado_em : max), null);
    if (!rows.length || typeof Motor === "undefined") return { grupos: [], total: 0, alertas: 0, omitidas: 0, capturadoEm, resumo: {} };

    const hoje = ixcMeiaNoite();
    const pad = n => String(n).padStart(2, "0");
    const hojeIso = `${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}-${pad(hoje.getDate())}`;

    const agPorOs = {};
    const agDate = {};
    const msgsPorOs = {};
    const osInfo = {};
    for (const r of rows) {
        const id = String(r["ID OS"]);
        const d = ixcDataBR(r.AGENDAMENTO);
        if (d) { agDate[id] = d; agPorOs[id] = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
        (msgsPorOs[id] = msgsPorOs[id] || []).push({ data: ixcDataBR(r.DATA), evento: r.EVENTO, status: r.STATUS, msg: r.MENSAGEM });
        if (!osInfo[id]) osInfo[id] = { cliente: r.CLIENTE, assunto: r.ASSUNTO, bairro: r.BAIRRO, cidade: r.CIDADE };
    }

    const { os } = Motor.montarOS(rows, hoje, Motor.PADRAO_PARAMS);

    const doDia = os.filter(o => o.campo && agPorOs[String(o.id)] === hojeIso);

    const techs = Array.isArray(techsEscala) ? techsEscala : [];
    const separar = typeof separarTerceira === "function" ? separarTerceira : (n => ({ nome: n, terceira: null }));

    const futuras = os.filter(o => o.campo && agPorOs[String(o.id)] > hojeIso);
    const gruposFuturos = agruparPorTecnico(futuras, o => ({ agendadoPara: agDate[String(o.id)] }));

    const emAberto = os.filter(o => {
        const iso = agPorOs[String(o.id)];
        return o.campo && ixcNorm(o.status) !== "finalizada" && !(iso && iso >= hojeIso);
    });
    const gruposEmAberto = agruparPorTecnico(emAberto, o => {
        const d = agDate[String(o.id)];
        return { agendadoPara: d || null, atrasada: !!d, semData: !d };
    }, true);

    const resumo = {};
    let alertas = 0, omitidas = 0;

    function agruparPorTecnico(lista, extra, incluirSemTecnico = false) {
        const porTecnico = new Map();
        let fora = 0;
        for (const o of lista) {

            const tecnicoNome = (o.agendaIxc && o.agendaIxc.tecnico) || (o.visitantes && o.visitantes[0]) || null;
            const tech = tecnicoNome ? techs.find(t => Motor.nomeBate(tecnicoNome, t)) : null;
            if (!tech && incluirSemTecnico) {
                const cidade = o.cidade || "Sem cidade";
                const setorChave = o.setor === "manutencao" ? "manutencao" : "instalador";
                const chaveSem = `sem|${cidade}|${setorChave}`;
                if (!porTecnico.has(chaveSem)) porTecnico.set(chaveSem, { tecnico: `Sem técnico · ${setorChave === "manutencao" ? "manutenção" : "instalação"}`, semTecnico: true, terceira: null, setor: null, setorChave, cidade, oss: [] });
                const st0 = ixcNorm(o.status);
                porTecnico.get(chaveSem).oss.push({
                    id: o.id, cliente: o.cliente, cidade: o.cidade, bairro: o.bairro, assunto: o.assunto,
                    status: o.status, statusNorm: st0, reagendamentos: o.reagendamentos || 0,
                    alerta: false, diaMsg: null, finalizada: false, ...extra(o)
                });
                continue;
            }
            if (!tech) { fora++; continue; }
            const info = separar(tech.nome);
            const chave = tech.id || info.nome;
            if (!porTecnico.has(chave)) {
                const diaEscala = typeof EscalaDia !== "undefined" ? EscalaDia.regras.resumo(tech, hoje) : {};
                const setorChave = diaEscala.situacao === "instalador" || diaEscala.situacao === "manutencao"
                    ? diaEscala.situacao
                    : (ixcNorm(tech.setor).startsWith("manut") ? "manutencao" : "instalador");
                porTecnico.set(chave, { tecnico: info.nome, terceira: info.terceira, setor: tech.setor, setorChave, cidade: diaEscala.cidade || tech.cidade || "Sem cidade", oss: [] });
            }
            const st = ixcNorm(o.status);
            porTecnico.get(chave).oss.push({
                id: o.id, cliente: o.cliente, cidade: o.cidade, bairro: o.bairro, assunto: o.assunto,
                status: o.status, statusNorm: st, reagendamentos: o.reagendamentos || 0,
                alerta: false, diaMsg: null, finalizada: st === "finalizada", ...extra(o)
            });
        }
        const lista2 = [...porTecnico.values()].map(g => ({
            ...g,
            oss: g.oss.sort((a, b) => (a.agendadoPara || 0) - (b.agendadoPara || 0) || (a.cliente || "").localeCompare(b.cliente || "", "pt-BR")),
            total: g.oss.length,
            feitas: g.oss.filter(x => x.finalizada).length,
            alertas: 0
        }));
        lista2.fora = fora;
        return lista2;
    }

    const porTec = new Map();
    for (const o of doDia) {

        const tecnicoNome = (o.agendaIxc && o.agendaIxc.tecnico) || (o.visitantes && o.visitantes[0]) || null;
        if (!tecnicoNome) { omitidas++; continue; }

        const tech = techs.find(t => Motor.nomeBate(tecnicoNome, t));
        if (!tech) { omitidas++; continue; }

        const info = separar(tech.nome);
        const chave = tech.id || info.nome;

        const idStr = String(o.id);
        const pedido = ixcDiaPedidoDaOs(msgsPorOs[idStr]);
        const ag = agDate[idStr];

        const alerta = !!(pedido && ag && pedido.getTime() > hoje.getTime() && pedido.toDateString() !== ag.toDateString());
        const diaMsg = alerta ? pedido : null;
        if (alerta) alertas++;

        const st = ixcNorm(o.status);
        resumo[o.status] = (resumo[o.status] || 0) + 1;

        if (!porTec.has(chave)) {

            const diaEscala = typeof EscalaDia !== "undefined" ? EscalaDia.regras.resumo(tech, hoje) : {};
            const setorChave = diaEscala.situacao === "instalador" || diaEscala.situacao === "manutencao"
                ? diaEscala.situacao
                : (ixcNorm(tech.setor).startsWith("manut") ? "manutencao" : "instalador");
            porTec.set(chave, { nome: info.nome, terceira: info.terceira, setor: tech.setor, setorChave, cidade: diaEscala.cidade || tech.cidade || "Sem cidade", oss: [] });
        }
        porTec.get(chave).oss.push({
            id: o.id, cliente: o.cliente, cidade: o.cidade, bairro: o.bairro, assunto: o.assunto,
            status: o.status, statusNorm: st, reagendamentos: o.reagendamentos || 0,
            alerta, diaMsg: alerta ? diaMsg : null, finalizada: st === "finalizada", fonte: "ixc"
        });
    }

    mesclarFinalizadasHoje(porTec, techs, separar, hoje);

    const grupos = [...porTec.values()]
        .map(g => ({
            tecnico: g.nome, terceira: g.terceira, setor: g.setor, setorChave: g.setorChave, cidade: g.cidade,

            oss: g.oss.sort((a, b) =>
                Number(b.finalizada) - Number(a.finalizada) ||
                (a.finalizada ? (a.horaFim || 0) - (b.horaFim || 0) : 0) ||
                Number(b.alerta) - Number(a.alerta) ||
                (a.cliente || "").localeCompare(b.cliente || "", "pt-BR")),
            total: g.oss.length,
            feitas: g.oss.filter(o => o.finalizada).length,
            alertas: g.oss.filter(o => o.alerta).length
        }))
        .sort((a, b) => b.total - a.total);

    const total = grupos.reduce((s, g) => s + g.total, 0);
    const feitas = grupos.reduce((s, g) => s + g.feitas, 0);
    return { grupos, total, feitas, alertas, omitidas, capturadoEm, resumo, gruposFuturos, gruposEmAberto, eventosPorOs: msgsPorOs, osInfo };
}

const AGENDA_IXC_OS_VISIVEIS = 5;
const agendaIxcTecnicosAbertos = new Set();

const AGENDA_IXC_CARTOES = [
    { id: "agendadas", rotulo: "Do dia", icone: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>', titulo: "Todas as OS do dia do técnico: as já finalizadas hoje + as ainda em aberto marcadas pra hoje", grupos: m => m.grupos },
    { id: "alertas", rotulo: "Alertas", icone: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>', titulo: "Primeiro quem pediu outro dia na mensagem, depois as OS já reagendadas", grupos: m => gruposComFiltro(m.grupos, o => o.alerta || o.reagendamentos > 0, true) },
    { id: "outroDia", rotulo: "Para outro dia", icone: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M10 14l4 4M14 14l-4 4"/>', titulo: "OS que não estão marcadas pra hoje: agendadas para os próximos dias e em aberto (sem data ou vencidas)", grupos: m => [...(m.gruposFuturos || []), ...(m.gruposEmAberto || [])] }
];

function badgeStatus(statusNorm, rotuloOriginal) {
    const info = AGENDA_IXC_STATUS[statusNorm] || { rotulo: rotuloOriginal || "—", cor: "#6b7280" };
    return `<span class="ixc-status" style="--c:${info.cor}"><i></i>${escaparHtml(info.rotulo)}</span>`;
}

function ixcAssuntoCurto(assunto) {
    const s = String(assunto || "").replace(/\s*\(\d+\)/g, "").trim().toLowerCase();
    return (s.charAt(0).toUpperCase() + s.slice(1)).replace(/\blos\b/g, "LOS");
}

function htmlOsIxc(o) {
    const marcada = o.semData
        ? `<span class="escala-tag" title="Sem agendamento no IXC">sem data</span>`
        : o.agendadoPara
        ? `<span class="escala-tag ixc-data${o.atrasada ? " ixc-data-vencida" : ""}" title="${o.atrasada ? "Agendamento vencido" : "Agendada no IXC para"}">📅 ${o.atrasada ? "venceu " : ""}${o.agendadoPara.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}</span>`
        : "";
    const reag = o.reagendamentos > 0 ? `<span class="escala-tag" title="Reagendamentos">↻ ${o.reagendamentos}</span>` : "";
    const feita = o.finalizada && o.horaFim
        ? `<span class="escala-tag ixc-feita-hora" title="Finalizada">✔ ${o.horaFim.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>`
        : "";
    const aviso = o.alerta
        ? `<div class="ixc-alerta">⚠ Cliente pediu outro dia: <b>${o.diaMsg.toLocaleDateString("pt-BR")}</b> — confira a mensagem no IXC</div>`
        : "";
    return `
      <li class="ixc-os ixc-os-click${o.alerta ? " ixc-os-alerta" : ""}${o.finalizada ? " ixc-os-feita" : ""}" data-ixc-os="${escaparHtml(String(o.id))}" data-ixc-fonte="${o.fonte || "ixc"}" title="Ver a ordem completa">
        <div class="ixc-os-linha">
          <span class="ixc-os-cliente">#${escaparHtml(String(o.id))} · ${escaparHtml(o.cliente || "—")}</span>
          ${badgeStatus(o.statusNorm, o.status)}
        </div>
        <div class="ixc-os-sub">${escaparHtml(o.bairro || "—")} · ${escaparHtml(ixcAssuntoCurto(o.assunto))} ${feita} ${reag} ${marcada}</div>
        ${aviso}
      </li>`;
}

function htmlTecnicoIxc(g, limitar) {
    const aberto = !limitar || agendaIxcTecnicosAbertos.has(g.tecnico);
    const visiveis = aberto ? g.oss : g.oss.slice(0, AGENDA_IXC_OS_VISIVEIS);
    const escondidas = g.oss.length - AGENDA_IXC_OS_VISIVEIS;
    return `
      <div class="ixc-tec setor-${g.setorChave}${g.semTecnico ? " ixc-tec-sem" : ""}">
        <div class="ixc-tec-topo">
          <span class="escala-nome">
            <strong>${escaparHtml(g.tecnico)}</strong>
            ${g.terceira ? `<span class="escala-tag">${escaparHtml(g.terceira)}</span>` : ""}
          </span>
          <span class="ixc-tec-conta" title="Finalizadas hoje / total do dia (feitas + em aberto)">${g.feitas}/${g.total}${g.alertas ? ` <b class="ixc-alertas" title="Cliente pediu outro dia">⚠ ${g.alertas}</b>` : ""}</span>
        </div>
        <ul class="ixc-lista">${visiveis.map(htmlOsIxc).join("")}</ul>
        ${limitar && escondidas > 0 ? `<button type="button" class="escala-ver-mais" data-ixc-ver-mais="${escaparHtml(g.tecnico)}">${aberto ? "Ver menos" : `Ver mais ${escondidas}`}</button>` : ""}
      </div>`;
}

function htmlCidadesIxc(grupos, limitar) {
    const porCidade = new Map();
    for (const g of grupos) {
        if (!porCidade.has(g.cidade)) porCidade.set(g.cidade, []);
        porCidade.get(g.cidade).push(g);
    }
    if (!porCidade.size) return '<p class="alerta-vazio">Nenhuma OS aqui.</p>';

    const ordemSetor = { manutencao: 0, instalador: 1 };
    for (const lista of porCidade.values()) {
        lista.sort((a, b) => (ordemSetor[a.setorChave] ?? 2) - (ordemSetor[b.setorChave] ?? 2) || b.oss.length - a.oss.length || a.tecnico.localeCompare(b.tecnico, "pt-BR"));
    }
    const totalDe = lista => lista.reduce((s, g) => s + g.oss.length, 0);
    const cidades = [...porCidade.keys()].sort((a, b) => totalDe(porCidade.get(b)) - totalDe(porCidade.get(a)) || a.localeCompare(b, "pt-BR"));

    return `<div class="escala-cidades ixc-cidades">${cidades.map(cidade => {
        const lista = porCidade.get(cidade);
        return `
          <div class="escala-cidade">
            <div class="escala-cidade-topo">
              <h3>${escaparHtml(cidade)}</h3>
              <span class="escala-pilula">${totalDe(lista)} OS · ${lista.length} ${lista.length === 1 ? "técnico" : "técnicos"}</span>
            </div>
            <div class="ixc-tecnicos">${lista.map(g => htmlTecnicoIxc(g, limitar)).join("")}</div>
          </div>`;
    }).join("")}</div>`;
}

function gruposComFiltro(grupos, filtro, alertaPrimeiro) {
    const lista = grupos
        .map(g => ({ ...g, oss: g.oss.filter(filtro) }))
        .filter(g => g.oss.length);
    if (alertaPrimeiro) {
        lista.forEach(g => g.oss.sort((a, b) => Number(b.alerta) - Number(a.alerta) || b.reagendamentos - a.reagendamentos));
        lista.sort((a, b) => Number(b.oss.some(o => o.alerta)) - Number(a.oss.some(o => o.alerta)));
    }
    return lista;
}

function gruposDoCartao(model, cartao) {
    return cartao.grupos(model);
}

function corpoPopupIxc(model, cartao, grupos) {
    if (cartao.id === "outroDia") {
        const conta = l => l.reduce((s, g) => s + g.oss.length, 0);
        const futuros = model.gruposFuturos || [], abertos = model.gruposEmAberto || [];
        return `
          <h3 class="ixc-popup-secao">📅 Agendadas para os próximos dias <span class="escala-pilula">${conta(futuros)}</span></h3>
          ${htmlCidadesIxc(futuros, false)}
          <h3 class="ixc-popup-secao">📂 Em aberto, sem agendamento ou com data vencida <span class="escala-pilula">${conta(abertos)}</span></h3>
          ${htmlCidadesIxc(abertos, false)}`;
    }
    if (cartao.id !== "alertas") return htmlCidadesIxc(grupos, false);
    const pediram = gruposComFiltro(model.grupos, o => o.alerta, false);
    const reagendadas = gruposComFiltro(model.grupos, o => !o.alerta && o.reagendamentos > 0, false);
    const conta = l => l.reduce((s, g) => s + g.oss.length, 0);
    return `
      <h3 class="ixc-popup-secao">⚠ Pediram outro dia <span class="escala-pilula">${conta(pediram)}</span></h3>
      ${conta(pediram) ? htmlCidadesIxc(pediram, false) : '<p class="alerta-vazio">Nenhum cliente marcado hoje pediu outro dia.</p>'}
      <h3 class="ixc-popup-secao">↻ Reagendadas <span class="escala-pilula">${conta(reagendadas)}</span></h3>
      ${htmlCidadesIxc(reagendadas, false)}`;
}

function abrirPopupIxc(model, cartao) {
    fecharPopupIxc();
    const grupos = gruposDoCartao(model, cartao);
    const total = grupos.reduce((s, g) => s + g.oss.length, 0);
    const fundo = document.createElement("div");
    fundo.className = "ixc-popup-fundo";
    fundo.innerHTML = `
      <div class="ixc-popup" role="dialog" aria-modal="true" aria-label="${escaparHtml(cartao.rotulo)}">
        <div class="ixc-popup-topo">
          <div>
            <h2>${escaparHtml(cartao.rotulo)} <span class="escala-pilula">${total} OS</span></h2>
            <p>${escaparHtml(cartao.titulo)}</p>
          </div>
          <button type="button" class="ixc-popup-fechar" aria-label="Fechar">✕</button>
        </div>
        <div class="ixc-popup-corpo">${corpoPopupIxc(model, cartao, grupos)}</div>
      </div>`;

    (document.getElementById("secao-agenda-hoje") || document.body).appendChild(fundo);
    document.body.classList.add("ixc-popup-aberto");
    fundo.addEventListener("click", e => { if (e.target === fundo) fecharPopupIxc(); });
    fundo.querySelector(".ixc-popup-fechar").addEventListener("click", fecharPopupIxc);
    fundo.querySelector(".ixc-popup-fechar").focus();
}

function fecharPopupIxc() {
    document.querySelector(".ixc-popup-fundo")?.remove();
    document.body.classList.remove("ixc-popup-aberto");
}
document.addEventListener("keydown", e => { if (e.key === "Escape") fecharPopupIxc(); });

document.addEventListener("click", e => {
    const li = e.target.closest("[data-ixc-os]");
    if (!li) return;
    const id = li.dataset.ixcOs;
    const fonte = li.dataset.ixcFonte;
    if (fonte === "ordens" && typeof abrirModalOS === "function" && AuditEngine.obterDetalhes(id)) {
        fecharPopupIxc();
        abrirModalOS(id);
    } else if (fonte === "cop") {

        abrirTimelineIxc(id, typeof copAbertasCache !== "undefined" ? copAbertasCache : null);
    } else {
        abrirTimelineIxc(id);
    }
});

function abrirTimelineIxc(id, fonte) {
    const model = fonte || agendaIxcCache;
    const corpo = document.getElementById("modalOsIxcCorpo");
    const titulo = document.getElementById("modalOsIxcTitulo");
    if (!corpo || !titulo) return;
    const eventos = (model?.eventosPorOs?.[String(id)] || []).slice().sort((a, b) => (a.data || 0) - (b.data || 0));
    const info = model?.osInfo?.[String(id)] || {};

    titulo.textContent = `OS ${id}`;
    corpo.innerHTML = !eventos.length
        ? `<p class="alerta-vazio">Sem histórico no pré-agendamento para esta OS.</p>`
        : `
          <div class="modal-resumo resumo-grid">
            <div><span>Cliente</span><strong>${escaparHtml(info.cliente || "—")}</strong></div>
            <div><span>Cidade / Bairro</span><strong>${escaparHtml(info.cidade || "—")} / ${escaparHtml(info.bairro || "—")}</strong></div>
            <div><span>Assunto</span><strong>${escaparHtml(info.assunto || "—")}</strong></div>
          </div>
          <ol class="ixc-timeline">${eventos.map(ev => `
            <li class="ixc-timeline-item">
              <div class="ixc-timeline-topo">
                <span class="ixc-timeline-data">${ev.data ? ev.data.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}</span>
                ${badgeStatus(ixcNorm(ev.status), ev.status)}
              </div>
              <div class="ixc-timeline-evento">${escaparHtml(ev.evento || "—")}</div>
              ${ev.msg ? `<div class="ixc-timeline-msg">${escaparHtml(ev.msg)}</div>` : ""}
            </li>`).join("")}</ol>`;
    abrirModal("modalOsIxc");
}

function htmlTopsIxc(model) {
    const oss = model.grupos.flatMap(g => g.oss);
    if (!oss.length) return "";
    const top5 = chave => {
        const cont = new Map();
        for (const o of oss) {
            const k = chave(o) || "—";
            cont.set(k, (cont.get(k) || 0) + 1);
        }
        return [...cont.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR")).slice(0, 5);
    };
    const painel = (titulo, itens) => {
        const maior = itens[0]?.[1] || 1;
        return `
          <div class="escala-cidade ixc-top">
            <div class="escala-cidade-topo"><h3>${titulo}</h3><span class="escala-pilula">${oss.length} OS hoje</span></div>
            <ol class="ixc-top-lista">${itens.map(([nome, n]) => `
              <li title="${escaparHtml(nome)}: ${n} OS (${Math.round(n / oss.length * 100)}% do dia)">
                <span class="ixc-top-nome">${escaparHtml(nome)}</span>
                <span class="ixc-top-barra"><i style="width:${Math.max(4, Math.round(n / maior * 100))}%"></i></span>
                <span class="ixc-top-valor"><b>${n}</b> ${Math.round(n / oss.length * 100)}%</span>
              </li>`).join("")}</ol>
          </div>`;
    };
    return `<div class="ixc-tops">${painel("Top 5 assuntos do dia", top5(o => ixcAssuntoCurto(o.assunto)))}${painel("Top 5 cidades com mais OS", top5(o => o.cidade))}</div>`;
}

function ixcHaQuanto(ms) {
    const min = Math.max(0, Math.round(ms / 60000));
    if (min < 1) return "agora mesmo";
    if (min < 60) return `há ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `há ${h} h`;
    const d = Math.round(h / 24);
    return `há ${d} ${d === 1 ? "dia" : "dias"}`;
}

const IXC_HORARIOS_RODADA = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];

function ixcRodadaAnterior(n) {
    const slots = [];
    const hoje = new Date();
    for (let dia = 0; dia <= 2; dia++) {
        for (const h of [...IXC_HORARIOS_RODADA].sort((a, b) => b - a)) {
            const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - dia, h, 30);
            if (d <= hoje) slots.push(d);
        }
    }
    return slots[n];
}

function bannerAtualizacaoIxc(capturadoEm) {
    if (!capturadoEm) {
        return `<div class="ixc-atualizado ixc-atu-parado">
            <span class="ixc-atualizado-ponto"></span>
            <b>Sem atualização ainda</b> — o robô não populou a tabela. Verifique se ele está rodando.
        </div>`;
    }
    const d = new Date(capturadoEm);
    const idade = Date.now() - d.getTime();
    const p2 = n => String(n).padStart(2, "0");
    const curto = `${p2(d.getDate())}/${p2(d.getMonth() + 1)} ${p2(d.getHours())}h${p2(d.getMinutes())}`;

    const ultima = ixcRodadaAnterior(0);
    const folga = Date.now() - ultima.getTime() < 30 * 60000 ? 1 : 0;
    const esperada = ixcRodadaAnterior(folga);

    const emDia = d >= esperada;
    const classe = emDia ? "ixc-atu-ok" : "ixc-atu-parado";
    const texto = `${emDia ? "" : "⚠ "}Atualizado <b>${ixcHaQuanto(idade)}</b> (${curto})`;
    return `<div class="ixc-atualizado ${classe}">
        <span class="ixc-atualizado-ponto"></span>
        ${texto}
    </div>`;
}

async function atualizarBannerGlobal() {
    const el = document.getElementById("bannerGlobalAtualizacao");
    if (!el || typeof supabaseClient === "undefined") return;
    try {
        const { data } = await supabaseClient
            .from("os_pendentes").select("capturado_em").order("capturado_em", { ascending: false }).limit(1);
        el.innerHTML = bannerAtualizacaoIxc(data && data[0] && data[0].capturado_em);
    } catch {  }
}

function renderizarAgendaIxc(model) {
    const alvo = document.getElementById("agendaIxcConteudo");
    if (!alvo) return;

    if (!model || model.total === 0) {
        alvo.innerHTML = `<div class="ixc-vazio">
            <p>Nenhuma OS marcada para hoje no IXC${model && model.capturadoEm ? "" : ", ou a tabela ainda não foi populada pelo robô"}.</p>
        </div>`;
        return;
    }

    const contar = cartao => cartao.grupos(model).reduce((s, g) => s + g.oss.length, 0);
    const feitas = model.grupos.reduce((s, g) => s + g.feitas, 0);
    const icone = caminhos => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${caminhos}</svg>`;

    alvo.innerHTML = `
      <div class="escala-kpis ixc-cartoes" role="group" aria-label="Resumo da agenda do IXC">
        ${AGENDA_IXC_CARTOES.map(c => `
          <button type="button" class="escala-kpi kpi-ixc-${c.id}" data-cartao-ixc="${c.id}" title="${escaparHtml(c.titulo)} — clique para ver todas">
            <span class="escala-kpi-icone">${icone(c.icone)}</span>
            <span><span class="escala-kpi-rotulo">${c.rotulo}</span><span class="escala-kpi-valor">${contar(c)}</span></span>
          </button>`).join("")}
      </div>

      ${htmlTopsIxc(model)}

      ${htmlCidadesIxc(model.grupos, true)}

      <div class="escala-legenda">
        <span><i class="ixc-amostra setor-instalador"></i>Instalação</span>
        <span><i class="ixc-amostra setor-manutencao"></i>Manutenção</span>
        <span>${feitas} de ${model.total} finalizadas</span>
        ${model.omitidas ? `<span>${model.omitidas} OS de técnicos fora da escala não aparecem</span>` : ""}
      </div>`;

    alvo.querySelectorAll("[data-cartao-ixc]").forEach(botao => botao.addEventListener("click", () => {
        abrirPopupIxc(model, AGENDA_IXC_CARTOES.find(c => c.id === botao.dataset.cartaoIxc));
    }));
    alvo.querySelectorAll("[data-ixc-ver-mais]").forEach(botao => botao.addEventListener("click", () => {
        const tec = botao.dataset.ixcVerMais;
        if (agendaIxcTecnicosAbertos.has(tec)) agendaIxcTecnicosAbertos.delete(tec);
        else agendaIxcTecnicosAbertos.add(tec);
        renderizarAgendaIxc(model);
    }));
}

async function carregarAgendaIxc(forcar = false) {
    const alvo = document.getElementById("agendaIxcConteudo");
    if (!alvo || agendaIxcCarregando) return;

    if (agendaIxcCache && !forcar) { renderizarAgendaIxc(agendaIxcCache); return; }

    agendaIxcCarregando = true;
    if (forcar) invalidarCacheOsPendentes();
    alvo.innerHTML = `<div class="ixc-vazio"><p>Carregando a agenda do IXC…</p></div>`;
    try {
        const [linhas, techs] = await Promise.all([
            buscarOsPendentesCacheado(),
            typeof carregarEscalaTecnicos === "function" ? carregarEscalaTecnicos().catch(() => []) : []
        ]);
        agendaIxcCache = montarAgendaIxc(linhas, techs);
        renderizarAgendaIxc(agendaIxcCache);
    } catch (erro) {
        console.error("Agenda IXC:", erro);
        alvo.innerHTML = `<div class="ixc-vazio"><p>Não consegui carregar a agenda do IXC. ${escaparHtml(erro.message || "")}</p></div>`;
    } finally {
        agendaIxcCarregando = false;
    }
}

function ativarAbaAgenda(aba) {
    const botoes = document.querySelectorAll("[data-aba-agenda]");
    if (!botoes.length) return;
    botoes.forEach(b => b.classList.toggle("ativo", b.dataset.abaAgenda === aba));
    const ia = document.getElementById("agendaHojeConteudo");
    const ixc = document.getElementById("agendaIxcConteudo");
    const aberto = document.getElementById("agendaAbertoConteudo");
    const timeline = document.getElementById("agendaTimelineConteudo");
    const navDia = document.getElementById("agendaNavDia");
    if (ia) ia.hidden = aba !== "ia";
    if (ixc) ixc.hidden = aba !== "ixc";
    if (aberto) aberto.hidden = aba !== "aberto";
    if (timeline) timeline.hidden = aba !== "timeline";
    if (navDia) navDia.style.visibility = aba === "ia" ? "" : "hidden";
    if (aba === "ixc") carregarAgendaIxc();
    if (aba === "timeline" && typeof carregarTimelineAgenda === "function") carregarTimelineAgenda();
    if (aba === "aberto" && typeof renderizarAgendaBacklog === "function") renderizarAgendaBacklog();
}

function registrarAbasAgenda() {
    const botoes = document.querySelectorAll("[data-aba-agenda]");
    if (!botoes.length) return;
    botoes.forEach(botao => botao.addEventListener("click", () => ativarAbaAgenda(botao.dataset.abaAgenda)));
}

const ATRASADAS_DIAS = 7;
async function calcularAtrasadas() {
    if (typeof Motor === "undefined") return { grupos: [], total: 0 };
    const [linhas, techs] = await Promise.all([
        buscarOsPendentesCacheado(),
        typeof carregarEscalaTecnicos === "function" ? carregarEscalaTecnicos().catch(() => []) : []
    ]);
    const rows = linhas.map(l => l.dados);
    if (!rows.length) return { grupos: [], total: 0 };

    const hoje = ixcMeiaNoite();
    const limite = new Date(hoje); limite.setDate(limite.getDate() - ATRASADAS_DIAS);
    const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const hojeIso = iso(hoje), limiteIso = iso(limite);

    const agIso = {};
    for (const r of rows) { const d = ixcDataBR(r.AGENDAMENTO); if (d) agIso[String(r["ID OS"])] = iso(d); }

    const { os } = Motor.montarOS(rows, hoje, Motor.PADRAO_PARAMS);
    const separar = typeof separarTerceira === "function" ? separarTerceira : (n => ({ nome: n, terceira: null }));
    const itens = [];
    for (const o of os) {
        if (!o.campo) continue;
        const statusAtual = ixcNorm(o.status);

        if (["encaminhada", "deslocamento", "execucao", "em execucao"].includes(statusAtual)) continue;
        const dia = agIso[String(o.id)];
        if (!dia || dia >= hojeIso || dia < limiteIso) continue;

        const nome = (o.visitantes && o.visitantes[0])
            || (statusAtual === "agendada" && o.agendaIxc && o.agendaIxc.tecnico)
            || null;
        const tech = nome ? (techs || []).find(t => Motor.nomeBate(nome, t)) : null;
        if (!tech) continue;
        const info = separar(tech.nome);
        itens.push({
            id: o.id, cliente: o.cliente, assunto: o.assunto,
            tecnico: info.nome + (info.terceira ? ` (${info.terceira})` : ""),
            dia: dia.split("-").reverse().join("/")
        });
    }
    itens.sort((a, b) => a.tecnico.localeCompare(b.tecnico, "pt-BR") || a.dia.localeCompare(b.dia));
    return { total: itens.length, itens };
}
