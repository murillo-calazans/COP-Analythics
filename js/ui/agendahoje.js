/**
 * ==========================================================
 * Agenda do Dia (módulo Agendador IA)
 * ==========================================================
 * Só leitura: mostra o plano que um admin/editor publicou pelo
 * pré-agendamento (agendador.html -> botão "Publicar agenda"),
 * guardado em agenda_publicada (database/patch-15). Uma linha por
 * dia, com uma lista de paradas: técnico, horário, OS, cliente...
 * Cada parada leva também os dados da rota (jornada, ocupação e se
 * passa do fim da jornada) — agendas publicadas antes disso não têm,
 * e a barra cai numa estimativa pelo nº de OS.
 *
 * Visual compartilhado com a Escala de hoje (classes escala-*).
 * O pré-agendamento em si abre numa guia nova e só admin/editor vê o botão.
 */

let agendaHojeData = null;       // dia exibido (Date à meia-noite)
let agendaCache = null;          // { iso, linha } — pra trocar filtro sem buscar de novo
let agendaFiltro = "todos";      // todos | instalador | manutencao | jornada | sem
const agendaTecnicosAbertos = new Set();
const AGENDA_PARADAS_VISIVEIS = 5;

// Limites de OS por técnico do pré-agendamento (07/10) — só pra estimar a barra de agendas antigas.
const AGENDA_LIMITE_OS = { instalador: 5, manutencao: 8 };

async function buscarAgendaPublicada(data) {
    const { data: linha, error } = await supabaseClient
        .from("agenda_publicada")
        .select("data, itens, resumo, publicado_por, atualizado_em")
        .eq("data", isoDataLocal(data))
        .maybeSingle();
    if (error) throw error;
    return linha;
}

/** Quantas OS a agenda de hoje tem — pra tela inicial. null = sem agenda/erro. */
async function totalAgendaDeHoje() {
    try {
        const linha = await buscarAgendaPublicada(hojeMeiaNoite());
        return linha ? (linha.itens ?? []).filter(i => i.tecnico).length : 0;
    } catch {
        return null;
    }
}

const SIGLAS_ASSUNTO = new Set(["LOS", "ONU", "ONT", "CTO", "OLT", "FTTH", "IP", "PPPOE", "TV", "IPTV", "VOIP"]);

/** "INSTALAÇÃO NOVO CLIENTE (70)" -> "Instalação novo cliente"; siglas (LOS, ONU...) continuam maiúsculas. */
function rotuloAssunto(assunto) {
    const texto = String(assunto ?? "").replace(/\([^)]*\)/g, "").replace(/-\s*TERCEIRIZAD[OA]\s*$/i, "").replace(/\s+/g, " ").trim()
        .split(" ").map(p => SIGLAS_ASSUNTO.has(normalizarTexto(p)) ? p.toUpperCase() : p.toLowerCase()).join(" ");
    return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Cor da etiqueta: instalação (azul), troca/mudança (laranja), resto (neutra). */
function tipoAssunto(assunto) {
    const a = normalizarTexto(assunto ?? "");
    if (/INSTALA|ULTIMA MILHA|NOVO CLIENTE|TRANSFERENCIA/.test(a)) return "inst";
    if (/TROCA|MUDANCA/.test(a)) return "troca";
    return "neutro";
}

function setorDaRota(item) {
    return item.setor === "instalador" ? "instalador" : "manutencao";
}

/** Agrupa as paradas por técnico, com os dados da rota. */
function montarRotasAgenda(itens) {
    const porTecnico = new Map();
    for (const item of itens.filter(i => i.tecnico)) {
        if (!porTecnico.has(item.tecnico)) porTecnico.set(item.tecnico, []);
        porTecnico.get(item.tecnico).push(item);
    }
    return [...porTecnico].map(([tecnico, paradas]) => {
        paradas.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
        const primeira = paradas[0];
        const setor = setorDaRota(primeira);
        const carga = primeira.cargaPct ?? Math.min(100, Math.round(paradas.length / AGENDA_LIMITE_OS[setor] * 100));
        return {
            tecnico,
            dupla: primeira.dupla,
            grupo: primeira.grupo,
            setor,
            paradas,
            carga,
            cargaEstimada: primeira.cargaPct == null,
            passaJornada: primeira.passaJornada === true,
            jornada: primeira.jornada,
            termino: primeira.termino
        };
    }).sort((a, b) => a.tecnico.localeCompare(b.tecnico, "pt-BR"));
}

/** usarCache: troca de filtro/"ver mais" não busca de novo; abrir a tela ou trocar o dia busca. */
async function renderizarAgendaHoje(usarCache = false) {
    const container = document.getElementById("agendaHojeConteudo");
    if (!container) return;

    const botaoPre = document.getElementById("btnAbrirPreAgendamento");
    if (botaoPre) botaoPre.hidden = !podeEditarOperacao();

    agendaHojeData ??= hojeMeiaNoite();
    const data = agendaHojeData;
    const iso = isoDataLocal(data);
    const ehHoje = ehMesmoDia(data, hojeMeiaNoite());
    document.getElementById("agendaHojeTitulo").textContent = ehHoje ? "Agenda do dia" : "Agenda";
    document.getElementById("btnAgendaHoje")?.classList.toggle("ativo", ehHoje);
    const subtitulo = document.getElementById("agendaHojeData");

    let linha;
    if (usarCache && agendaCache?.iso === iso) {
        linha = agendaCache.linha;
    } else {
        if (subtitulo) subtitulo.textContent = formatarDataLonga(data);
        container.innerHTML = '<p class="alerta-vazio">Carregando a agenda...</p>';
        try {
            linha = await buscarAgendaPublicada(data);
        } catch (erro) {
            const faltaTabela = /agenda_publicada/.test(erro.message ?? "") || erro.code === "42P01" || erro.code === "PGRST205";
            container.innerHTML = faltaTabela
                ? '<p class="alerta-vazio">A tabela da agenda ainda não existe no banco — falta rodar o database/patch-15-inicio-e-agenda.sql no Supabase.</p>'
                : `<p class="alerta-vazio">Não deu pra carregar a agenda: ${escaparHtml(erro.message ?? String(erro))}</p>`;
            return;
        }
        if (agendaHojeData !== data) return; // trocou de dia enquanto carregava
        agendaCache = { iso, linha };
    }

    if (subtitulo) subtitulo.textContent = `${formatarDataLonga(data)}${linha ? " · publicado pelo pré-agendamento" : ""}`;

    if (!linha || !(linha.itens ?? []).length) {
        container.innerHTML = `
            <div class="placeholder-card">
                <h2>📭 Nenhuma agenda publicada para este dia</h2>
                <p>${podeEditarOperacao()
                    ? 'Gere o plano no Pré-agendamento e clique em "Publicar agenda" para ela aparecer aqui.'
                    : "Assim que o pré-agendamento do dia for publicado, ele aparece aqui."}</p>
            </div>`;
        return;
    }

    const rotas = montarRotasAgenda(linha.itens);
    const semTecnico = linha.itens.filter(i => !i.tecnico);
    const totalAgendadas = rotas.reduce((s, r) => s + r.paradas.length, 0);
    const passam = rotas.filter(r => r.passaJornada).length;

    const kpi = (id, rotulo, valor, icone, classe = "") => `
        <button type="button" class="escala-kpi ${classe}${agendaFiltro === id ? " ativo" : ""}" data-filtro-agenda="${id}" aria-pressed="${agendaFiltro === id}">
            <span class="escala-kpi-icone">${icone}</span>
            <span><span class="escala-kpi-rotulo">${rotulo}</span><span class="escala-kpi-valor">${valor}</span></span>
        </button>`;
    const svg = caminho => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${caminho}</svg>`;

    const chip = (id, conteudo) => `<button type="button" class="agenda-chip${agendaFiltro === id ? " ativo" : ""}" data-filtro-agenda="${id}" aria-pressed="${agendaFiltro === id}">${conteudo}</button>`;

    let corpo;
    if (agendaFiltro === "sem") {
        corpo = htmlSemTecnicoAgenda(semTecnico);
    } else {
        const filtradas = rotas.filter(r =>
            agendaFiltro === "todos" ? true :
            agendaFiltro === "jornada" ? r.passaJornada :
            r.setor === agendaFiltro);
        corpo = filtradas.length
            ? `<div class="escala-cidades">${filtradas.map(cartaoRotaAgenda).join("")}</div>`
            : '<p class="alerta-vazio">Nenhum técnico nesse filtro.</p>';
    }

    const publicadoEm = new Date(linha.atualizado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

    container.innerHTML = `
        <div class="escala-kpis agenda-kpis" role="group" aria-label="Resumo e filtros da agenda">
            ${kpi("todos", "OS agendadas", totalAgendadas, svg('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="m9 16 2 2 4-4"/>'), "kpi-todos")}
            ${kpi("todos", "Técnicos com rota", rotas.length, svg(ESCALA_ICONES.todos), "kpi-todos agenda-kpi-tecnicos")}
            ${kpi("sem", "Não couberam no dia", semTecnico.length, svg('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'), semTecnico.length ? "kpi-alerta" : "kpi-todos")}
        </div>

        <div class="agenda-chips" role="group" aria-label="Filtrar técnicos">
            ${chip("todos", "Todos")}
            ${chip("instalador", '<span class="agenda-tag tag-inst">Instalação</span>')}
            ${chip("manutencao", '<span class="agenda-tag tag-troca">Manutenção</span>')}
            ${chip("jornada", `<i class="agenda-quadrado"></i>Passa da jornada · ${passam}`)}
        </div>

        ${corpo}

        <p class="rodape-modulo">Publicada em ${publicadoEm}${linha.publicado_por ? ` por ${escaparHtml(linha.publicado_por)}` : ""}.</p>
    `;

    container.querySelectorAll("[data-filtro-agenda]").forEach(botao => botao.addEventListener("click", () => {
        const alvo = botao.dataset.filtroAgenda;
        agendaFiltro = agendaFiltro === alvo && alvo !== "todos" ? "todos" : alvo;
        renderizarAgendaHoje(true);
    }));
    container.querySelectorAll("[data-problema-agenda]").forEach(botao => botao.addEventListener("click", () => {
        const id = botao.dataset.problemaAgenda || null;
        agendaProblema = agendaProblema === id ? null : id;
        renderizarAgendaHoje(true);
    }));
    container.querySelectorAll("[data-ver-mais-agenda]").forEach(botao => botao.addEventListener("click", () => {
        const tecnico = botao.dataset.verMaisAgenda;
        if (agendaTecnicosAbertos.has(tecnico)) agendaTecnicosAbertos.delete(tecnico);
        else agendaTecnicosAbertos.add(tecnico);
        renderizarAgendaHoje(true);
    }));
}

function cartaoRotaAgenda(rota) {
    const { nome, terceira } = separarTerceira(rota.tecnico);
    const aberta = agendaTecnicosAbertos.has(rota.tecnico);
    const visiveis = aberta ? rota.paradas : rota.paradas.slice(0, AGENDA_PARADAS_VISIVEIS);
    const escondidas = rota.paradas.length - AGENDA_PARADAS_VISIVEIS;
    const tituloBarra = rota.cargaEstimada
        ? `Estimativa: ${rota.paradas.length} de ${AGENDA_LIMITE_OS[rota.setor]} OS do limite`
        : `${rota.carga}% da jornada em serviço${rota.jornada ? ` (${rota.jornada})` : ""}${rota.termino ? ` · termina ~${rota.termino}` : ""}`;

    return `
        <div class="escala-cidade agenda-rota">
            <div class="agenda-rota-nome">
                <h3>${escaparHtml(nome)}${rota.dupla ? `<span class="escala-dupla"> + ${escaparHtml(nomeCurto(rota.dupla))}</span>` : ""}</h3>
                ${terceira ? `<span class="escala-tag">${terceira}</span>` : ""}
            </div>
            <p class="agenda-rota-sub">${escaparHtml([rota.grupo, rota.setor === "instalador" ? "instalador" : "manutenção", `${rota.paradas.length} OS`].filter(Boolean).join(" · "))}${rota.passaJornada ? ` · <span class="agenda-passa">termina ~${escaparHtml(rota.termino ?? "")}, passa da jornada</span>` : ""}</p>
            <div class="agenda-barra${rota.passaJornada ? " passa" : ""}" title="${escaparHtml(tituloBarra)}"><i style="width:${rota.carga}%"></i></div>
            <ul class="agenda-paradas">
                ${visiveis.map(p => `
                    <li>
                        <span class="agenda-hora">${escaparHtml(p.chegada ?? "")}</span>
                        <div>
                            <div class="agenda-os"><strong>OS ${escaparHtml(String(p.os ?? ""))}</strong> · ${escaparHtml(p.cliente ?? "")}</div>
                            <div class="agenda-detalhe">
                                <span>${escaparHtml(p.bairro || p.cidade || "")}</span>
                                ${p.assunto ? `<span class="agenda-tag tag-${tipoAssunto(p.assunto)}" title="${escaparHtml(p.assunto)}">${escaparHtml(rotuloAssunto(p.assunto))}</span>` : ""}
                            </div>
                            ${p.observacao ? `<div class="agenda-alerta">${escaparHtml(p.observacao)}</div>` : ""}
                        </div>
                    </li>`).join("")}
            </ul>
            ${escondidas > 0 ? `<button type="button" class="escala-ver-mais" data-ver-mais-agenda="${escaparHtml(rota.tecnico)}">${aberta ? "Ver menos" : `Ver mais ${escondidas} OS`}</button>` : ""}
        </div>`;
}

/**
 * Motivos do pré-agendamento (js/agendador/motor.js, semTecnico[].motivo)
 * agrupados em problemas — o texto original traz cidade e números
 * ("Técnicos já estão com 8 OS em Nova Friburgo"), aqui vira uma causa
 * só com contagem e o que dá pra fazer. Motivo novo que não bater com
 * nenhum padrão aparece com o próprio texto.
 */
const PROBLEMAS_AGENDA = [
    { id: "capacidade", padrao: /^Técnicos já estão com/i, titulo: "Técnicos no limite de OS", acao: "Falta técnico nessas cidades: escalar mais gente ou remanejar de outra cidade.", tipo: "falta" },
    { id: "dupla-cheia", padrao: /exige dupla e as duplas já estão/i, titulo: "LOS exige dupla e as duplas estão cheias", acao: "Formar mais duplas de manutenção na escala do dia.", tipo: "falta" },
    { id: "sem-dupla", padrao: /exige dupla e não há/i, titulo: "LOS exige dupla e não há dupla na cidade", acao: "Montar uma dupla de manutenção na escala dessa cidade.", tipo: "falta" },
    { id: "jornada", padrao: /^Não coube na jornada/i, titulo: "Não coube na jornada / janela do cliente", acao: "Horário pedido pelo cliente não encaixa na rota: rever janela ou estender jornada.", tipo: "falta" },
    { id: "longe", padrao: /^Longe das rotas/i, titulo: "Longe das rotas do dia", acao: "OS isolada: agendar junto com outra visita na região ou num dia com rota por lá.", tipo: "rota" },
    { id: "cidade-sem-equipe", padrao: /^Cidade sem equipe na escala/i, titulo: "Cidade sem equipe na escala", acao: "Escalar alguém nessa cidade ou atender por remanejamento.", tipo: "falta" },
    { id: "grupo-sem-tecnico", padrao: /^Nenhum técnico escalado/i, titulo: "Nenhum técnico escalado no grupo de cidades", acao: "Conferir a escala do dia para esse grupo de cidades.", tipo: "falta" },
    { id: "sem-local", padrao: /^Sem coordenada/i, titulo: "OS sem localização", acao: "Corrigir o bairro ou a coordenada do cliente na OS.", tipo: "cadastro" },
    { id: "fim-de-semana", padrao: /fim de semana/i, titulo: "Cliente só recebe no fim de semana", acao: "Não é problema: agendar para sábado/domingo.", tipo: "cliente" },
    { id: "dia-pedido", padrao: /^Cliente pediu o dia/i, titulo: "Cliente pediu outro dia", acao: "Não é problema: agendar no dia pedido.", tipo: "cliente" }
];

let agendaProblema = null; // id do problema aberto na lista de "Não couberam"

function problemaDoMotivo(motivo) {
    const texto = String(motivo ?? "").trim();
    const conhecido = PROBLEMAS_AGENDA.find(p => p.padrao.test(texto));
    if (conhecido) return conhecido;
    const titulo = texto || "Sem motivo informado";
    return { id: `outro:${titulo}`, titulo, acao: "", tipo: "outro" };
}

function htmlSemTecnicoAgenda(semTecnico) {
    if (!semTecnico.length) return '<p class="alerta-vazio">Todas as OS couberam no dia. 🎉</p>';

    // Agrupa por problema.
    const problemas = new Map();
    for (const item of semTecnico) {
        const problema = problemaDoMotivo(item.observacao);
        if (!problemas.has(problema.id)) problemas.set(problema.id, { ...problema, itens: [] });
        problemas.get(problema.id).itens.push(item);
    }
    const lista = [...problemas.values()].sort((a, b) => b.itens.length - a.itens.length);
    if (agendaProblema && !problemas.has(agendaProblema)) agendaProblema = null;

    const selecionados = agendaProblema ? problemas.get(agendaProblema).itens : semTecnico;

    const porCidade = new Map();
    for (const item of selecionados) {
        const cidade = item.cidade || "Sem cidade";
        if (!porCidade.has(cidade)) porCidade.set(cidade, []);
        porCidade.get(cidade).push(item);
    }
    const cidades = [...porCidade.keys()].sort((a, b) => porCidade.get(b).length - porCidade.get(a).length);

    return `
        <div class="agenda-problemas" role="group" aria-label="Por que não couberam">
            ${lista.map(p => `
                <button type="button" class="agenda-problema problema-${p.tipo}${agendaProblema === p.id ? " ativo" : ""}" data-problema-agenda="${escaparHtml(p.id)}" aria-pressed="${agendaProblema === p.id}">
                    <span class="agenda-problema-qtd">${p.itens.length}</span>
                    <span class="agenda-problema-texto">
                        <strong>${escaparHtml(p.titulo)}</strong>
                        ${p.acao ? `<span>${escaparHtml(p.acao)}</span>` : ""}
                        <em>${escaparHtml(resumoCidades(p.itens))}</em>
                    </span>
                </button>`).join("")}
        </div>

        <div class="agenda-problemas-lista-topo">
            <h3>${agendaProblema ? escaparHtml(problemas.get(agendaProblema).titulo) : "Todas as OS que não couberam"} <span class="escala-pilula">${selecionados.length} OS</span></h3>
            ${agendaProblema ? '<button type="button" class="escala-ver-mais" data-problema-agenda="">Ver todas</button>' : '<span class="admin-dica">Clique num problema acima para ver só as OS dele.</span>'}
        </div>

        <div class="escala-cidades">${cidades.map(cidade => `
            <div class="escala-cidade agenda-rota">
                <div class="escala-cidade-topo">
                    <h3>${escaparHtml(cidade)}</h3>
                    <span class="escala-pilula">${porCidade.get(cidade).length} OS</span>
                </div>
                <ul class="agenda-paradas agenda-sem">
                    ${porCidade.get(cidade).map(p => `
                        <li>
                            <div>
                                <div class="agenda-os"><strong>OS ${escaparHtml(String(p.os ?? ""))}</strong> · ${escaparHtml(p.cliente ?? "")}</div>
                                <div class="agenda-detalhe">
                                    <span>${escaparHtml(p.bairro || "")}</span>
                                    ${p.assunto ? `<span class="agenda-tag tag-${tipoAssunto(p.assunto)}" title="${escaparHtml(p.assunto)}">${escaparHtml(rotuloAssunto(p.assunto))}</span>` : ""}
                                </div>
                                ${p.observacao ? `<div class="agenda-alerta">${escaparHtml(p.observacao)}</div>` : ""}
                            </div>
                        </li>`).join("")}
                </ul>
            </div>`).join("")}</div>`;
}

/** "Nova Friburgo (12), Cabo Frio (5) e mais 3 cidades". */
function resumoCidades(itens) {
    const contagem = new Map();
    for (const item of itens) contagem.set(item.cidade || "Sem cidade", (contagem.get(item.cidade || "Sem cidade") ?? 0) + 1);
    const ordenadas = [...contagem].sort((a, b) => b[1] - a[1]);
    const texto = ordenadas.slice(0, 3).map(([c, n]) => `${c} (${n})`).join(", ");
    return ordenadas.length > 3 ? `${texto} e mais ${ordenadas.length - 3} cidade(s)` : texto;
}

function registrarAgendaHoje() {
    const mudarDia = delta => {
        agendaHojeData = new Date((agendaHojeData ?? hojeMeiaNoite()).getTime());
        agendaHojeData.setDate(agendaHojeData.getDate() + delta);
        renderizarAgendaHoje();
    };
    document.getElementById("btnAgendaDiaAnterior")?.addEventListener("click", () => mudarDia(-1));
    document.getElementById("btnAgendaProximoDia")?.addEventListener("click", () => mudarDia(1));
    document.getElementById("btnAgendaHoje")?.addEventListener("click", () => { agendaHojeData = hojeMeiaNoite(); renderizarAgendaHoje(); });
}
