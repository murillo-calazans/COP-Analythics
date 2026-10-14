/**
 * ==========================================================
 * Agenda IXC (aba do módulo Agendador IA)
 * ==========================================================
 * Retrato ATUAL de como o IXC está agendado hoje — lido da tabela
 * os_pendentes (gravada pelo robô de hora em hora) e reconstruído com o
 * mesmo motor do pré-agendamento (js/agendador/motor.js -> Motor.montarOS),
 * que já identifica técnico, status, reagendamentos e o "dia combinado"
 * citado na mensagem do agendamento.
 *
 * Mostra, por equipe/técnico, as OS marcadas pra hoje, com o status atual
 * (agendada / deslocamento / em execução / finalizada), o que falta e os
 * reagendados. Cliente marcado pra hoje cuja MENSAGEM cita outro dia fica
 * em VERMELHO com o aviso.
 *
 * "Retrato atual" = o último que o robô puxou (na hora cheia); por isso um
 * "em execução" pode estar com tempo defasado — é esperado.
 */

let agendaIxcCache = null;     // { capturadoEm, model } — evita refazer a cada troca de aba
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

/** "dd/mm/aaaa HH:ii:ss" -> Date (com hora, se houver) ou null (""/00/00/0000). */
function ixcDataBR(s) {
    const m = String(s || "").match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    return m && m[3] !== "0000"
        ? new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0))
        : null;
}

/**
 * Lê na mensagem o DIA que o cliente/técnico pediu pra visita. Resolve dia
 * da semana ("terça") a partir da DATA DA MENSAGEM (ex.: msg de sex. 10/10
 * dizendo "terça" => 13/10), e datas explícitas ("dia 15/10", "para 15/10").
 * IGNORA "hoje"/"amanhã" de propósito — costuma falar de outra coisa (ex.:
 * "cliente chegará hoje às 17h") e dava alarme falso.
 */
function ixcDiaPedido(texto, dataMsg) {
    const t = ixcNorm(texto);
    const dias = Object.keys(IXC_DOW).join("|");
    // o dia só conta quando vem logo depois de um VERBO DE PEDIDO ATIVO — assim
    // "plantão de domingo" (contexto) e "havia sido feita para sábado" (narrativa
    // de pedido passado) NÃO viram pedido, mas "pediu/solicita/reagendar ... terça"
    // sim. NÃO uso "para" sozinho de propósito. Pega o ÚLTIMO pedido do texto.
    // verbos de pedido (formas de verbo, não o substantivo "solicitação"/"agendamento"):
    const re = new RegExp(`(?:pediu|pede|solicit(?:a|ou|ar|am)\\b|reagendar|reagendou|remarcar|remarcou|volta\\w*|retorn\\w*|agendar)[^.;\\d]{0,25}?(?:\\b(${dias})\\b|(\\d{1,2})\\/(\\d{1,2}))`, "g");
    let last = null, m;
    while ((m = re.exec(t))) last = m;
    if (!last) return null;
    if (last[1]) { // dia da semana resolvido a partir da data da mensagem
        const d = new Date(dataMsg); d.setHours(0, 0, 0, 0);
        let add = (IXC_DOW[last[1]] - d.getDay() + 7) % 7; if (add === 0) add = 7;
        d.setDate(d.getDate() + add);
        return d;
    }
    if (last[2] && +last[3] >= 1 && +last[3] <= 12) return new Date(dataMsg.getFullYear(), +last[3] - 1, +last[2]);
    return null;
}

/** Dia pedido mais recente a partir das mensagens de Agendada(5)/Reagend(10) da OS. */
function ixcDiaPedidoDaOs(msgs) {
    const evs = (msgs || [])
        .filter(e => ["5", "10"].includes(String(e.evento)) && e.data)
        .sort((a, b) => b.data - a.data);
    for (const e of evs) { const p = ixcDiaPedido(e.msg, e.data); if (p) return p; }
    return null;
}

/** Lê todas as linhas (eventos) da os_pendentes. */
async function buscarOsPendentes() {
    if (typeof supabaseClient === "undefined") return [];
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

// A os_pendentes é grande (dezenas de milhares de linhas). Na tela inicial o
// painel de operação E o card de atrasadas pedem a mesma coisa; na Gestão do
// COP idem. Esse cache compartilha UMA busca por ~2 min (e dedupa chamadas
// simultâneas guardando a promessa), pra não baixar tudo várias vezes.
let _osPendentesPromise = null, _osPendentesEm = 0;
async function buscarOsPendentesCacheado(maxIdadeMs = 120000) {
    if (_osPendentesPromise && (Date.now() - _osPendentesEm) < maxIdadeMs) return _osPendentesPromise;
    _osPendentesEm = Date.now();
    _osPendentesPromise = buscarOsPendentes().catch(e => { _osPendentesPromise = null; throw e; });
    return _osPendentesPromise;
}
function invalidarCacheOsPendentes() { _osPendentesPromise = null; _osPendentesEm = 0; }

/**
 * Monta o modelo da Agenda IXC: OS marcadas pra hoje, SÓ dos técnicos que
 * estão na escala (casados pelo nome via Motor.nomeBate), agrupadas por
 * técnico. Quem não está na escala (terceirizada de fora, pessoa de
 * escritório que agendou, etc.) não entra — é a regra do setor da Base.
 */
/**
 * Acrescenta aos grupos do dia as OS que o técnico FINALIZOU hoje. Elas não
 * estão no pré-agendamento (529 só traz OS em aberto) — vêm do relatório de
 * ordens, já reconstruído em APP.dados.ordens. O técnico é quem FECHOU (mesmo
 * nome que a gestão de ordens usa), casado com a escala por Motor.nomeBate.
 * É isso que fecha o "X/Y do dia": o pré-agendamento dá o que falta fazer, o
 * de ordens dá o que já foi feito.
 */
function mesclarFinalizadasHoje(porTec, techs, separar, hoje) {
    const ordens = APP?.dados?.ordens;
    if (!ordens || !ordens.size || typeof IndicatorEngine === "undefined" || typeof Motor === "undefined") return;
    const amanha = hoje.getTime() + 24 * 3600 * 1000;
    const dentroDeHoje = d => d && d.getTime() >= hoje.getTime() && d.getTime() < amanha;

    for (const ordem of ordens.values()) {
        if (!dentroDeHoje(ordem.dataFechamento)) continue;          // pré-filtro barato
        if (ixcNorm(ordem.statusAtual) !== "finalizada") continue;

        const info = IndicatorEngine.analisarEventosOS(ordem);
        const fech = info?.ultimoFechamento;
        const quando = fech?.data || ordem.dataFechamento;
        if (!dentroDeHoje(quando)) continue;                        // o fechamento em si é de hoje?

        const nomeFechou = IndicatorEngine.nomeResponsavelFechamento(fech);
        if (!nomeFechou) continue;
        const tech = techs.find(t => Motor.nomeBate(nomeFechou, t));
        if (!tech) continue;            // quem fechou não é técnico de campo da escala (COP, terceira fora da escala…)

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
        if (grupo.oss.some(x => String(x.id) === String(ordem.id))) continue;   // já veio do 529: não duplica
        grupo.oss.push({
            id: ordem.id, cliente: ordem.cliente, cidade: ordem.cidade, bairro: ordem.bairro, assunto: ordem.assunto,
            status: "Finalizada", statusNorm: "finalizada", reagendamentos: 0,
            alerta: false, diaMsg: null, finalizada: true, fonte: "ordens", horaFim: quando
        });
    }
}

function montarAgendaIxc(linhasBrutas, techsEscala) {
    const rows = linhasBrutas.map(l => l.dados);
    // a puxada mais recente: o robô acrescenta linhas de hora em hora (a 1ª linha é a do retrato das 7h)
    const capturadoEm = linhasBrutas.reduce((max, l) => (l.capturado_em && (!max || l.capturado_em > max) ? l.capturado_em : max), null);
    if (!rows.length || typeof Motor === "undefined") return { grupos: [], total: 0, alertas: 0, omitidas: 0, capturadoEm, resumo: {} };

    const hoje = ixcMeiaNoite();
    const pad = n => String(n).padStart(2, "0");
    const hojeIso = `${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}-${pad(hoje.getDate())}`;

    // AGENDAMENTO (data real pra quando a OS está marcada) por OS -> ISO.
    // Filtramos por ISSO (não mais pelo "marcadaHoje" do motor, que acumulava
    // todos os agendamentos antigos em aberto).
    const agPorOs = {};      // id -> ISO do agendamento
    const agDate = {};       // id -> Date do agendamento
    const msgsPorOs = {};    // id -> [{data, evento, status, msg}] (dia pedido + timeline do pop-up)
    const osInfo = {};       // id -> {cliente, assunto, bairro, cidade} (cabeçalho da timeline)
    for (const r of rows) {
        const id = String(r["ID OS"]);
        const d = ixcDataBR(r.AGENDAMENTO);
        if (d) { agDate[id] = d; agPorOs[id] = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
        (msgsPorOs[id] = msgsPorOs[id] || []).push({ data: ixcDataBR(r.DATA), evento: r.EVENTO, status: r.STATUS, msg: r.MENSAGEM });
        if (!osInfo[id]) osInfo[id] = { cliente: r.CLIENTE, assunto: r.ASSUNTO, bairro: r.BAIRRO, cidade: r.CIDADE };
    }

    const { os } = Motor.montarOS(rows, hoje, Motor.PADRAO_PARAMS);
    // Só o que conta pra agendamento (o.campo do motor): fora infra, COP, faturamento, CGR, recolhimento…
    const doDia = os.filter(o => o.campo && agPorOs[String(o.id)] === hojeIso);

    const techs = Array.isArray(techsEscala) ? techsEscala : [];
    const separar = typeof separarTerceira === "function" ? separarTerceira : (n => ({ nome: n, terceira: null }));

    // OS de técnicos da escala já marcadas pra um dia DEPOIS de hoje (card "Para outro dia").
    const futuras = os.filter(o => o.campo && agPorOs[String(o.id)] > hojeIso);
    const gruposFuturos = agruparPorTecnico(futuras, o => ({ agendadoPara: agDate[String(o.id)] }));

    // OS de campo EM ABERTO que não estão marcadas pra hoje nem pra frente: sem agendamento ou
    // com a data já vencida. Sem técnico definido também entra (bloco "Sem técnico" na cidade da OS).
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

    // Agrupa OS pelo técnico da escala (cidade e função dele HOJE, pela escala).
    // extra(o) acrescenta campos à OS (alerta, data marcada…).
    function agruparPorTecnico(lista, extra, incluirSemTecnico = false) {
        const porTecnico = new Map();
        let fora = 0;
        for (const o of lista) {
            // técnico = o do agendamento, ou (se já foi a campo) o último que visitou
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
        // técnico = o do agendamento, ou (se já foi a campo) o último que visitou
        const tecnicoNome = (o.agendaIxc && o.agendaIxc.tecnico) || (o.visitantes && o.visitantes[0]) || null;
        if (!tecnicoNome) { omitidas++; continue; }

        // só entra quem está na escala (= técnico de campo dos setores da Base)
        const tech = techs.find(t => Motor.nomeBate(tecnicoNome, t));
        if (!tech) { omitidas++; continue; }

        const info = separar(tech.nome);
        const chave = tech.id || info.nome;
        // alerta = a mensagem pede um dia DIFERENTE do agendamento real
        const idStr = String(o.id);
        const pedido = ixcDiaPedidoDaOs(msgsPorOs[idStr]);
        const ag = agDate[idStr];
        // alerta só quando o dia pedido é FUTURO (> hoje) e diferente do agendado:
        // cliente marcado hoje mas pediu pra frente. Datas passadas = menção antiga.
        const alerta = !!(pedido && ag && pedido.getTime() > hoje.getTime() && pedido.toDateString() !== ag.toDateString());
        const diaMsg = alerta ? pedido : null;
        if (alerta) alertas++;

        const st = ixcNorm(o.status);
        resumo[o.status] = (resumo[o.status] || 0) + 1;

        if (!porTec.has(chave)) {
            // cidade e função do técnico HOJE pela escala (temporária, remanejamento do dia…)
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

    // Finalizadas HOJE (vêm do relatório de ORDENS — 343, OS já fechadas, que
    // por isso saíram do pré-agendamento). Cruzamos pelo NOME do técnico que
    // FECHOU (igual à gestão de ordens) com a escala, pra fechar o "X/Y do dia":
    // o pré-agendamento dá o que falta, o de ordens dá o que já foi feito.
    mesclarFinalizadasHoje(porTec, techs, separar, hoje);

    const grupos = [...porTec.values()]
        .map(g => ({
            tecnico: g.nome, terceira: g.terceira, setor: g.setor, setorChave: g.setorChave, cidade: g.cidade,
            // feitas no topo (em ordem de quando fecharam), depois alerta, depois cliente
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

// Visual no padrão da "Escala de hoje" (js/ui/escalahoje.js): três cartões no
// topo (Agendadas, Alertas, Para outro dia — cada um abre um pop-up com as OS),
// um cartão por cidade e, dentro dele, um bloco por técnico — verde-claro
// instalação, azul-claro manutenção — com até 5 OS e "Ver mais".
const AGENDA_IXC_OS_VISIVEIS = 5;
const agendaIxcTecnicosAbertos = new Set();  // técnicos com "Ver mais" aberto (na página)

// Cartões do topo: o que cada um conta e mostra no pop-up.
const AGENDA_IXC_CARTOES = [
    { id: "agendadas", rotulo: "Do dia", icone: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>', titulo: "Todas as OS do dia do técnico: as já finalizadas hoje + as ainda em aberto marcadas pra hoje", grupos: m => m.grupos },
    { id: "alertas", rotulo: "Alertas", icone: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>', titulo: "Primeiro quem pediu outro dia na mensagem, depois as OS já reagendadas", grupos: m => gruposComFiltro(m.grupos, o => o.alerta || o.reagendamentos > 0, true) },
    { id: "outroDia", rotulo: "Para outro dia", icone: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M10 14l4 4M14 14l-4 4"/>', titulo: "OS que não estão marcadas pra hoje: agendadas para os próximos dias e em aberto (sem data ou vencidas)", grupos: m => [...(m.gruposFuturos || []), ...(m.gruposEmAberto || [])] }
];

function badgeStatus(statusNorm, rotuloOriginal) {
    const info = AGENDA_IXC_STATUS[statusNorm] || { rotulo: rotuloOriginal || "—", cor: "#6b7280" };
    return `<span class="ixc-status" style="--c:${info.cor}"><i></i>${escaparHtml(info.rotulo)}</span>`;
}

/** "SEM CONEXÃO / LOS (14)" -> "Sem conexão / LOS" */
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

/** Bloco de um técnico. limitar = só as 5 primeiras + "Ver mais" (na página); no pop-up mostra tudo. */
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

/** Cartões por cidade (a do técnico hoje, pela escala); dentro dela, manutenção antes de instalação. */
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

/** Só as OS que passam no filtro, mantendo técnico e cidade; alertaPrimeiro põe "pediu outro dia" no topo. */
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

/** No "Alertas", quem pediu outro dia vem num bloco à parte, logo no início. */
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
    // Dentro da seção da agenda, pra herdar as cores da escala (tokens --escala-* ficam nela).
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

// Clicar numa OS da Agenda IXC abre a ordem cronológica (igual à gestão de
// ordens). Finalizada veio do relatório de ordens -> modal da gestão de ordens;
// em aberto só existe no pré-agendamento -> timeline montada com os eventos do 529.
// Delegado no documento pra pegar tanto a lista da página quanto a do pop-up.
document.addEventListener("click", e => {
    const li = e.target.closest("[data-ixc-os]");
    if (!li) return;
    const id = li.dataset.ixcOs;
    const fonte = li.dataset.ixcFonte;
    if (fonte === "ordens" && typeof abrirModalOS === "function" && AuditEngine.obterDetalhes(id)) {
        fecharPopupIxc();
        abrirModalOS(id);
    } else if (fonte === "cop") {
        // OS do COP: usa os eventos capturados pelo módulo Gestão do COP
        abrirTimelineIxc(id, typeof copAbertasCache !== "undefined" ? copAbertasCache : null);
    } else {
        abrirTimelineIxc(id);
    }
});

/**
 * Timeline de uma OS ainda EM ABERTO (só existe no pré-agendamento, não no
 * relatório de ordens). Monta a ordem cronológica com os eventos do próprio
 * 529 — mesma ideia da gestão de ordens, com o que o IXC exporta.
 */
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

/** Top 5 assuntos e Top 5 cidades das OS marcadas pra hoje (as mesmas do card "Agendadas"). */
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

/** "há 8 min", "há 2 h", "há 3 dias" — idade de um horário até agora. */
function ixcHaQuanto(ms) {
    const min = Math.max(0, Math.round(ms / 60000));
    if (min < 1) return "agora mesmo";
    if (min < 60) return `há ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `há ${h} h`;
    const d = Math.round(h / 24);
    return `há ${d} ${d === 1 ? "dia" : "dias"}`;
}

/** Horários das rodadas automáticas do robô (igual a HORARIOS_RODADA no robo.js). */
const IXC_HORARIOS_RODADA = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];

/** Horário da rodada agendada que veio `n` rodadas antes de agora (n=0: a última). */
function ixcRodadaAnterior(n) {
    const slots = [];
    const hoje = new Date();
    for (let dia = 0; dia <= 2; dia++) {
        for (const h of [...IXC_HORARIOS_RODADA].sort((a, b) => b - a)) {
            const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - dia, h);
            if (d <= hoje) slots.push(d);
        }
    }
    return slots[n];
}

/**
 * Banner de atualização. O robô roda de hora em hora, das 7h às 19h (e sob demanda pelo botão
 * "Atualizar banco"). Verde se o dado é da última rodada agendada (com 30 min
 * de folga pra ela terminar); amarelo se perdeu uma rodada; vermelho se perdeu
 * mais (robô provavelmente parado). Assim o horário nunca passa por "fresco" à toa.
 */
function bannerAtualizacaoIxc(capturadoEm) {
    if (!capturadoEm) {
        return `<div class="ixc-atualizado ixc-atu-parado">
            <span class="ixc-atualizado-ponto"></span>
            <b>Sem atualização ainda</b> — o robô não populou a tabela. Verifique se ele está rodando.
        </div>`;
    }
    const d = new Date(capturadoEm);
    const idade = Date.now() - d.getTime();
    const completo = d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", " às");
    // rodada em andamento: nos 30 min após o horário ainda vale a rodada anterior
    const ultima = ixcRodadaAnterior(0);
    const folga = Date.now() - ultima.getTime() < 30 * 60000 ? 1 : 0;
    const esperada = ixcRodadaAnterior(folga), anterior = ixcRodadaAnterior(folga + 1);

    let classe, texto;
    if (d >= esperada) {
        classe = "ixc-atu-ok";
        texto = `Atualizado <b>${ixcHaQuanto(idade)}</b> (${completo})`;
    } else if (d >= anterior) {
        classe = "ixc-atu-atraso";
        texto = `⚠ Última atualização <b>${ixcHaQuanto(idade)}</b> (${completo}) — o robô pode estar atrasado`;
    } else {
        classe = "ixc-atu-parado";
        texto = `⚠ Desatualizado — última atualização <b>${ixcHaQuanto(idade)}</b> (${completo}). Verifique o robô.`;
    }
    return `<div class="ixc-atualizado ${classe}">
        <span class="ixc-atualizado-ponto"></span>
        ${texto}
        <span class="ixc-atualizado-obs">o robô atualiza de hora em hora (7h às 19h) · extra pelo botão Atualizar banco</span>
    </div>`;
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
      ${bannerAtualizacaoIxc(model.capturadoEm)}

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
    if (forcar) invalidarCacheOsPendentes();   // "Atualizar banco" / troca de dia pede dado fresco
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

/** Troca entre as abas "Agenda IA" e "Agenda IXC" dentro do módulo. */
function registrarAbasAgenda() {
    const botoes = document.querySelectorAll("[data-aba-agenda]");
    if (!botoes.length) return;
    botoes.forEach(botao => botao.addEventListener("click", () => {
        const aba = botao.dataset.abaAgenda;
        botoes.forEach(b => b.classList.toggle("ativo", b === botao));
        const ia = document.getElementById("agendaHojeConteudo");
        const ixc = document.getElementById("agendaIxcConteudo");
        const navDia = document.getElementById("agendaNavDia");
        if (ia) ia.hidden = aba !== "ia";
        if (ixc) ixc.hidden = aba !== "ixc";
        if (navDia) navDia.style.visibility = aba === "ia" ? "" : "hidden"; // nav de dia só faz sentido na Agenda IA
        if (aba === "ixc") carregarAgendaIxc();
    }));
}

/**
 * Pendências de reagendamento: OS ainda EM ABERTO cujo AGENDAMENTO é de um
 * dia ANTERIOR a hoje (dentro dos últimos ATRASADAS_DIAS dias) — ou seja, o
 * técnico começou o dia com OS que ficaram de trás e ninguém reagendou.
 * Agrupa por técnico (da escala). Usado no painel inicial (#2).
 */
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
        const dia = agIso[String(o.id)];
        if (!dia || dia >= hojeIso || dia < limiteIso) continue;   // só agendamento passado recente (últimos dias)
        const nome = (o.agendaIxc && o.agendaIxc.tecnico) || (o.visitantes && o.visitantes[0]) || null;
        const tech = nome ? (techs || []).find(t => Motor.nomeBate(nome, t)) : null;
        if (!tech) continue;   // só OS de técnicos da escala
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
