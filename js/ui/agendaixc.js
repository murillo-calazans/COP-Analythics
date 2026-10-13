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

/**
 * Monta o modelo da Agenda IXC: OS marcadas pra hoje, SÓ dos técnicos que
 * estão na escala (casados pelo nome via Motor.nomeBate), agrupadas por
 * técnico. Quem não está na escala (terceirizada de fora, pessoa de
 * escritório que agendou, etc.) não entra — é a regra do setor da Base.
 */
function montarAgendaIxc(linhasBrutas, techsEscala) {
    const rows = linhasBrutas.map(l => l.dados);
    const capturadoEm = linhasBrutas.length ? linhasBrutas[0].capturado_em : null;
    if (!rows.length || typeof Motor === "undefined") return { grupos: [], total: 0, alertas: 0, omitidas: 0, capturadoEm, resumo: {} };

    const hoje = ixcMeiaNoite();
    const pad = n => String(n).padStart(2, "0");
    const hojeIso = `${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}-${pad(hoje.getDate())}`;

    // AGENDAMENTO (data real pra quando a OS está marcada) por OS -> ISO.
    // Filtramos por ISSO (não mais pelo "marcadaHoje" do motor, que acumulava
    // todos os agendamentos antigos em aberto).
    const agPorOs = {};      // id -> ISO do agendamento
    const agDate = {};       // id -> Date do agendamento
    const msgsPorOs = {};    // id -> [{data, evento, msg}] (pra ler o dia pedido)
    for (const r of rows) {
        const id = String(r["ID OS"]);
        const d = ixcDataBR(r.AGENDAMENTO);
        if (d) { agDate[id] = d; agPorOs[id] = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
        (msgsPorOs[id] = msgsPorOs[id] || []).push({ data: ixcDataBR(r.DATA), evento: r.EVENTO, msg: r.MENSAGEM });
    }

    const { os } = Motor.montarOS(rows, hoje, Motor.PADRAO_PARAMS);
    const doDia = os.filter(o => agPorOs[String(o.id)] === hojeIso);

    const techs = Array.isArray(techsEscala) ? techsEscala : [];
    const separar = typeof separarTerceira === "function" ? separarTerceira : (n => ({ nome: n, terceira: null }));

    const porTec = new Map();
    const resumo = {};
    let alertas = 0, omitidas = 0;

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
            alerta, diaMsg: alerta ? diaMsg : null, finalizada: st === "finalizada"
        });
    }

    const grupos = [...porTec.values()]
        .map(g => ({
            tecnico: g.nome, terceira: g.terceira, setor: g.setor, setorChave: g.setorChave, cidade: g.cidade,
            oss: g.oss.sort((a, b) => Number(b.alerta) - Number(a.alerta) || (a.cliente || "").localeCompare(b.cliente || "", "pt-BR")),
            total: g.oss.length,
            feitas: g.oss.filter(o => o.finalizada).length,
            alertas: g.oss.filter(o => o.alerta).length
        }))
        .sort((a, b) => b.total - a.total);

    const total = grupos.reduce((s, g) => s + g.total, 0);
    return { grupos, total, alertas, omitidas, capturadoEm, resumo };
}

// Visual no padrão da "Escala de hoje" (js/ui/escalahoje.js): três cartões no
// topo (Agendadas, Alertas, Para outro dia — cada um abre um pop-up com as OS),
// um cartão por cidade e, dentro dele, um bloco por técnico — verde-claro
// instalação, azul-claro manutenção — com até 5 OS e "Ver mais".
const AGENDA_IXC_OS_VISIVEIS = 5;
const agendaIxcTecnicosAbertos = new Set();  // técnicos com "Ver mais" aberto (na página)

// Cartões do topo: o que cada um conta e mostra no pop-up.
const AGENDA_IXC_CARTOES = [
    { id: "agendadas", rotulo: "Agendadas", icone: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>', titulo: "OS marcadas pra hoje no IXC", filtro: () => true },
    { id: "alertas", rotulo: "Alertas", icone: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>', titulo: "OS já reagendadas (voltaram pra agenda)", filtro: o => o.reagendamentos > 0 },
    { id: "outroDia", rotulo: "Para outro dia", icone: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M10 14l4 4M14 14l-4 4"/>', titulo: "Cliente marcado hoje que pediu outro dia na mensagem", filtro: o => o.alerta }
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
    const reag = o.reagendamentos > 0 ? `<span class="escala-tag" title="Reagendamentos">↻ ${o.reagendamentos}</span>` : "";
    const aviso = o.alerta
        ? `<div class="ixc-alerta">⚠ Cliente pediu outro dia: <b>${o.diaMsg.toLocaleDateString("pt-BR")}</b> — confira a mensagem no IXC</div>`
        : "";
    return `
      <li class="ixc-os${o.alerta ? " ixc-os-alerta" : ""}${o.finalizada ? " ixc-os-feita" : ""}">
        <div class="ixc-os-linha">
          <span class="ixc-os-cliente" title="OS ${escaparHtml(String(o.id))}">${escaparHtml(o.cliente || "—")}</span>
          ${badgeStatus(o.statusNorm, o.status)}
        </div>
        <div class="ixc-os-sub">${escaparHtml(o.bairro || "—")} · ${escaparHtml(ixcAssuntoCurto(o.assunto))} ${reag}</div>
        ${aviso}
      </li>`;
}

/** Bloco de um técnico. limitar = só as 5 primeiras + "Ver mais" (na página); no pop-up mostra tudo. */
function htmlTecnicoIxc(g, limitar) {
    const aberto = !limitar || agendaIxcTecnicosAbertos.has(g.tecnico);
    const visiveis = aberto ? g.oss : g.oss.slice(0, AGENDA_IXC_OS_VISIVEIS);
    const escondidas = g.oss.length - AGENDA_IXC_OS_VISIVEIS;
    return `
      <div class="ixc-tec setor-${g.setorChave}">
        <div class="ixc-tec-topo">
          <span class="escala-nome">
            <strong>${escaparHtml(g.tecnico)}</strong>
            ${g.terceira ? `<span class="escala-tag">${escaparHtml(g.terceira)}</span>` : ""}
          </span>
          <span class="ixc-tec-conta" title="Finalizadas / marcadas pra hoje">${g.feitas}/${g.total}${g.alertas ? ` <b class="ixc-alertas" title="Cliente pediu outro dia">⚠ ${g.alertas}</b>` : ""}</span>
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

/** Só as OS que passam no filtro do cartão, mantendo o técnico e a cidade. */
function gruposDoCartao(model, cartao) {
    return model.grupos
        .map(g => ({ ...g, oss: g.oss.filter(cartao.filtro) }))
        .filter(g => g.oss.length);
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
        <div class="ixc-popup-corpo">${htmlCidadesIxc(grupos, false)}</div>
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

function renderizarAgendaIxc(model) {
    const alvo = document.getElementById("agendaIxcConteudo");
    if (!alvo) return;

    if (!model || model.total === 0) {
        alvo.innerHTML = `<div class="ixc-vazio">
            <p>Nenhuma OS marcada para hoje no IXC${model && model.capturadoEm ? "" : ", ou a tabela ainda não foi populada pelo robô"}.</p>
        </div>`;
        return;
    }

    const contar = cartao => model.grupos.reduce((s, g) => s + g.oss.filter(cartao.filtro).length, 0);
    const feitas = model.grupos.reduce((s, g) => s + g.feitas, 0);
    const quando = model.capturadoEm ? new Date(model.capturadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—";
    const icone = caminhos => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${caminhos}</svg>`;

    alvo.innerHTML = `
      <div class="escala-kpis ixc-cartoes" role="group" aria-label="Resumo da agenda do IXC">
        ${AGENDA_IXC_CARTOES.map(c => `
          <button type="button" class="escala-kpi kpi-ixc-${c.id}" data-cartao-ixc="${c.id}" title="${escaparHtml(c.titulo)} — clique para ver todas">
            <span class="escala-kpi-icone">${icone(c.icone)}</span>
            <span><span class="escala-kpi-rotulo">${c.rotulo}</span><span class="escala-kpi-valor">${contar(c)}</span></span>
          </button>`).join("")}
      </div>

      ${htmlCidadesIxc(model.grupos, true)}

      <div class="escala-legenda">
        <span><i class="ixc-amostra setor-instalador"></i>Instalação</span>
        <span><i class="ixc-amostra setor-manutencao"></i>Manutenção</span>
        <span>${feitas} de ${model.total} finalizadas</span>
        ${model.omitidas ? `<span>${model.omitidas} OS de técnicos fora da escala não aparecem</span>` : ""}
        <span class="escala-atualizada">Retrato do IXC às ${quando} (o robô atualiza de hora em hora)</span>
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
    alvo.innerHTML = `<div class="ixc-vazio"><p>Carregando a agenda do IXC…</p></div>`;
    try {
        const [linhas, techs] = await Promise.all([
            buscarOsPendentes(),
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
