/**
 * ==========================================================
 * Escala de Hoje (módulo Escala)
 * ==========================================================
 * Só leitura: mostra quem trabalha no dia, a partir da mesma
 * linha do Supabase que a escala.html edita
 * (escala_tecnicos_dados, ver database/patch-14).
 *
 * As regras de "como fica o técnico nesse dia" são uma cópia das
 * de escala.html (getResumoDiaMensal, getDiaData, horarioEfetivo,
 * ehFolgaPadraoNaoEditado, getTempCidadeEfetiva, getSetorEfetivo,
 * getDuplaInfo) — lá elas vivem presas dentro de um IIFE. Mudou
 * uma regra lá? Muda aqui também.
 *
 * Editar continua sendo na escala.html, numa guia nova, e o botão
 * só aparece pra admin/editor.
 */

const ESCALA_FERIADOS = {
    "2026-01-01": "Confraternização Universal",
    "2026-02-16": "Carnaval",
    "2026-02-17": "Carnaval",
    "2026-04-03": "Sexta-feira Santa",
    "2026-04-21": "Tiradentes",
    "2026-05-01": "Dia do Trabalho",
    "2026-06-04": "Corpus Christi",
    "2026-09-07": "Independência do Brasil",
    "2026-10-12": "Nossa Senhora Aparecida",
    "2026-11-02": "Finados",
    "2026-11-15": "Proclamação da República",
    "2026-12-25": "Natal"
};

const ESCALA_DIAS_JS = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];

const ESCALA_SITUACOES = {
    instalador: "Instalação",
    manutencao: "Manutenção",
    folga: "Folga",
    ferias: "Férias",
    atestado: "Atestado",
    outras: "Outras atividades"
};

let escalaTecnicosCache = null; // { techs, carregadoEm }
let escalaHojeData = null;      // dia exibido (Date à meia-noite)

function isoDataLocal(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function hojeMeiaNoite() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Lê a escala do Supabase uma vez por sessão de tela (forcar = relê). */
async function carregarEscalaTecnicos(forcar = false) {
    if (escalaTecnicosCache && !forcar) return escalaTecnicosCache.techs;

    const { data, error } = await supabaseClient
        .from("escala_tecnicos_dados")
        .select("dados")
        .eq("id", "default")
        .maybeSingle();

    if (error) throw error;

    const techs = Array.isArray(data?.dados) ? data.dados : [];
    escalaTecnicosCache = { techs, carregadoEm: new Date() };
    return techs;
}

const EscalaRegras = {
    dentroDoPeriodo(data, inicioIso, fimIso) {
        if (!inicioIso || !fimIso) return false;
        return data >= new Date(`${inicioIso}T00:00:00`) && data <= new Date(`${fimIso}T00:00:00`);
    },

    diaData(tech, diaKey, dataIso) {
        return tech.excecoes?.[dataIso] || tech.horarios?.[diaKey] || {};
    },

    horario(tech, dia) {
        if (dia.custom) return { inicio: dia.inicio, fim: dia.fim };
        return { inicio: tech.horarioPadrao?.inicio ?? "07:00", fim: tech.horarioPadrao?.fim ?? "15:00" };
    },

    folgaPadrao(tech, diaKey, dataIso, dia) {
        const temExcecao = !!tech.excecoes?.[dataIso];
        const intocado = !dia.custom && !dia.folga && !dia.atestado && !dia.outras;
        return !temExcecao && intocado && (diaKey === "sab" || diaKey === "dom" || !!ESCALA_FERIADOS[dataIso]);
    },

    cidadeTemporaria(tech, diaKey, dataIso) {
        const exc = tech.excecoes?.[dataIso];
        if (exc && Object.prototype.hasOwnProperty.call(exc, "tempCidadeOverride")) return exc.tempCidadeOverride || null;
        return (tech.alocacoesTemporarias || []).find(a => a.dias.includes(diaKey))?.cidade ?? null;
    },

    setor(tech, dataIso) {
        return tech.excecoes?.[dataIso]?.setorOverride || tech.setor;
    },

    temDuplaOverride(tech, dataIso) {
        const exc = tech.excecoes?.[dataIso];
        return !!(exc && Object.prototype.hasOwnProperty.call(exc, "duplaOverride"));
    },

    // Mesma precedência de getDuplaInfo na escala.html.
    parceiro(tech, techs, dataIso) {
        const porId = id => techs.find(t => t.id === id);
        const exc = tech.excecoes?.[dataIso];

        if (this.temDuplaOverride(tech, dataIso)) return exc.duplaOverride ? porId(exc.duplaOverride) ?? null : null;

        const escolheu = techs.find(o => o.id !== tech.id && this.temDuplaOverride(o, dataIso) && o.excecoes[dataIso].duplaOverride === tech.id);
        if (escolheu) return escolheu;

        if (tech.dupla) {
            const fixo = porId(tech.dupla);
            return fixo && !this.temDuplaOverride(fixo, dataIso) ? fixo : null;
        }
        return techs.find(o => o.id !== tech.id && o.dupla === tech.id && !this.temDuplaOverride(o, dataIso)) ?? null;
    },

    /** { situacao, cidade, temporaria, inicio, fim } do técnico na data. */
    resumo(tech, data) {
        const diaKey = ESCALA_DIAS_JS[data.getDay()];
        const dataIso = isoDataLocal(data);

        if (tech.status === "ferias" && this.dentroDoPeriodo(data, tech.feriasInicio, tech.feriasFim)) return { situacao: "ferias" };

        const dia = this.diaData(tech, diaKey, dataIso);
        if (this.folgaPadrao(tech, diaKey, dataIso, dia) || dia.folga) return { situacao: "folga" };
        if (dia.atestado) return { situacao: "atestado" };
        if (dia.outras) return { situacao: "outras" };

        const { inicio, fim } = this.horario(tech, dia);
        if (!inicio || !fim) return { situacao: "folga" };

        const temporaria = this.cidadeTemporaria(tech, diaKey, dataIso);
        return {
            situacao: this.setor(tech, dataIso) === "Manutenção" ? "manutencao" : "instalador",
            cidade: temporaria || tech.cidade,
            temporaria: !!temporaria,
            inicio,
            fim
        };
    }
};

/** Lista { tech, resumo, parceiro } de todos os técnicos na data. */
function montarEscalaDoDia(techs, data) {
    const dataIso = isoDataLocal(data);
    return techs.map(tech => {
        const resumo = EscalaRegras.resumo(tech, data);
        const trabalha = resumo.situacao === "instalador" || resumo.situacao === "manutencao";
        let parceiro = trabalha ? EscalaRegras.parceiro(tech, techs, dataIso) : null;
        if (parceiro && !["instalador", "manutencao"].includes(EscalaRegras.resumo(parceiro, data).situacao)) parceiro = null;
        return { tech, resumo, trabalha, parceiro };
    });
}

function formatarDataLonga(data) {
    const texto = data.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
    return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// ---------- Desenho ----------

let escalaHojeFiltro = "todos"; // todos | instalador | manutencao | fora
const escalaCidadesAbertas = new Set(); // cidades com "Ver mais" aberto
const ESCALA_LINHAS_VISIVEIS = 5;

// Terceirizada vem como sufixo do nome ("Alex Cardoso - VELOZ"); sem sufixo = interno.
const ESCALA_TERCEIRAS = { VELOZ: "Veloz", AZUL: "Azul", TECHNOMAIS: "Technomais" };

function separarTerceira(nome) {
    const m = String(nome ?? "").match(/^(.*?)\s*-\s*([A-Za-zÀ-ÿ]+)\s*$/);
    const equipe = m && ESCALA_TERCEIRAS[m[2].toUpperCase()];
    return equipe ? { nome: m[1].trim(), terceira: equipe } : { nome: String(nome ?? "").trim(), terceira: null };
}

/** "Edson Gomes" -> "Edson G." (parceiro da dupla, pra caber na linha). */
function nomeCurto(nome) {
    const partes = separarTerceira(nome).nome.split(/\s+/).filter(Boolean);
    return partes.length > 1 ? `${partes[0]} ${partes[partes.length - 1].charAt(0)}.` : (partes[0] ?? "");
}

/** "08:00","17:00" -> "08–17h"; "08:30","17:00" -> "08:30–17h". */
function faixaHorario(inicio, fim) {
    const curto = h => String(h ?? "").replace(/:00$/, "");
    return `${curto(inicio)}–${curto(fim)}h`;
}

const ESCALA_ICONES = {
    todos: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    instalador: '<path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a6 6 0 0 1-12 0V8z"/>',
    manutencao: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    fora: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" y1="8" x2="23" y2="14"/><line x1="23" y1="8" x2="17" y2="14"/>'
};

function iconeEscala(id) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ESCALA_ICONES[id]}</svg>`;
}

async function renderizarEscalaHoje() {
    const container = document.getElementById("escalaHojeConteudo");
    if (!container) return;

    const botaoEditar = document.getElementById("btnEditarEscala");
    if (botaoEditar) botaoEditar.hidden = !podeEditarOperacao();

    escalaHojeData ??= hojeMeiaNoite();
    const data = escalaHojeData;
    const ehHoje = ehMesmoDia(data, hojeMeiaNoite());
    document.getElementById("escalaHojeTitulo").textContent = ehHoje ? "Escala de hoje" : "Escala do dia";
    document.getElementById("escalaHojeData").textContent = formatarDataLonga(data);
    document.getElementById("btnEscalaHoje")?.classList.toggle("ativo", ehHoje);

    if (!escalaTecnicosCache) container.innerHTML = '<p class="alerta-vazio">Carregando a escala...</p>';

    let techs;
    try {
        techs = await carregarEscalaTecnicos();
    } catch (erro) {
        container.innerHTML = `<p class="alerta-vazio">Não deu pra carregar a escala: ${escaparHtml(erro.message ?? String(erro))}</p>`;
        return;
    }
    if (escalaHojeData !== data) return; // trocou de dia enquanto carregava

    if (techs.length === 0) {
        container.innerHTML = '<p class="alerta-vazio">Nenhum técnico cadastrado na escala ainda.</p>';
        return;
    }

    const dia = montarEscalaDoDia(techs, data);
    const trabalhando = dia.filter(d => d.trabalha);
    const fora = dia.filter(d => !d.trabalha);
    const feriado = ESCALA_FERIADOS[isoDataLocal(data)];
    const contar = situacao => trabalhando.filter(d => d.resumo.situacao === situacao).length;

    const tiles = [
        { id: "todos", rotulo: "Trabalhando", valor: trabalhando.length },
        { id: "instalador", rotulo: "Instalação", valor: contar("instalador") },
        { id: "manutencao", rotulo: "Manutenção", valor: contar("manutencao") },
        { id: "fora", rotulo: "Fora hoje", valor: fora.length }
    ];

    container.innerHTML = `
        ${feriado ? `<div class="aviso-modulo">🎉 Feriado: ${escaparHtml(feriado)}</div>` : ""}
        <div class="escala-kpis" role="group" aria-label="Filtrar a escala">
            ${tiles.map(t => `
                <button type="button" class="escala-kpi kpi-${t.id}${escalaHojeFiltro === t.id ? " ativo" : ""}" data-filtro-escala="${t.id}" aria-pressed="${escalaHojeFiltro === t.id}">
                    <span class="escala-kpi-icone">${iconeEscala(t.id)}</span>
                    <span><span class="escala-kpi-rotulo">${t.rotulo}</span><span class="escala-kpi-valor">${t.valor}</span></span>
                </button>`).join("")}
        </div>

        ${escalaHojeFiltro === "fora" ? htmlForaHoje(fora) : htmlCidadesEscala(trabalhando)}

        <div class="escala-legenda">
            <span><i class="escala-ponto ponto-instalador"></i>Instalação</span>
            <span><i class="escala-ponto ponto-manutencao"></i>Manutenção</span>
            <span><strong class="escala-horario-fora">11–20h</strong>Horário fora do padrão</span>
            <span class="escala-atualizada">Atualizada às ${escalaTecnicosCache.carregadoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
    `;

    container.querySelectorAll("[data-filtro-escala]").forEach(botao => botao.addEventListener("click", () => {
        escalaHojeFiltro = escalaHojeFiltro === botao.dataset.filtroEscala ? "todos" : botao.dataset.filtroEscala;
        renderizarEscalaHoje();
    }));
    container.querySelectorAll("[data-ver-mais]").forEach(botao => botao.addEventListener("click", () => {
        const cidade = botao.dataset.verMais;
        if (escalaCidadesAbertas.has(cidade)) escalaCidadesAbertas.delete(cidade);
        else escalaCidadesAbertas.add(cidade);
        renderizarEscalaHoje();
    }));
}

function htmlCidadesEscala(trabalhando) {
    const filtrados = escalaHojeFiltro === "todos" ? trabalhando : trabalhando.filter(d => d.resumo.situacao === escalaHojeFiltro);

    // Dupla vira uma linha só (no primeiro dos dois em ordem alfabética).
    const jaListados = new Set();
    const porCidade = new Map();
    for (const item of [...filtrados].sort((a, b) => a.tech.nome.localeCompare(b.tech.nome, "pt-BR"))) {
        if (jaListados.has(item.tech.id)) continue;
        jaListados.add(item.tech.id);
        if (item.parceiro) jaListados.add(item.parceiro.id);
        const cidade = item.resumo.cidade || "Sem cidade";
        if (!porCidade.has(cidade)) porCidade.set(cidade, []);
        porCidade.get(cidade).push(item);
    }

    if (porCidade.size === 0) return '<p class="alerta-vazio">Ninguém nesse filtro neste dia.</p>';

    const cidades = [...porCidade.keys()].sort((a, b) => porCidade.get(b).length - porCidade.get(a).length || a.localeCompare(b, "pt-BR"));

    return `<div class="escala-cidades">${cidades.map(cidade => {
        const linhas = porCidade.get(cidade);
        const aberta = escalaCidadesAbertas.has(cidade);
        const visiveis = aberta ? linhas : linhas.slice(0, ESCALA_LINHAS_VISIVEIS);
        const escondidas = linhas.length - ESCALA_LINHAS_VISIVEIS;
        return `
            <div class="escala-cidade">
                <div class="escala-cidade-topo">
                    <h3>${escaparHtml(cidade)}</h3>
                    <span class="escala-pilula">${linhas.length} ${linhas.length === 1 ? "equipe" : "equipes"}</span>
                </div>
                <ul class="escala-lista">${visiveis.map(linhaEscala).join("")}</ul>
                ${escondidas > 0 ? `<button type="button" class="escala-ver-mais" data-ver-mais="${escaparHtml(cidade)}">${aberta ? "Ver menos" : `Ver mais ${escondidas}`}</button>` : ""}
            </div>`;
    }).join("")}</div>`;
}

function linhaEscala(item) {
    const { tech, resumo, parceiro } = item;
    const { nome, terceira } = separarTerceira(tech.nome);
    const padrao = { inicio: tech.horarioPadrao?.inicio ?? "07:00", fim: tech.horarioPadrao?.fim ?? "15:00" };
    const foraDoPadrao = resumo.inicio !== padrao.inicio || resumo.fim !== padrao.fim;

    return `
        <li>
            <i class="escala-ponto ponto-${resumo.situacao}" title="${ESCALA_SITUACOES[resumo.situacao]}"></i>
            <span class="escala-nome">
                <strong>${escaparHtml(nome)}</strong>${parceiro ? `<span class="escala-dupla"> + ${escaparHtml(nomeCurto(parceiro.nome))}</span>` : ""}
                ${terceira ? `<span class="escala-tag">${terceira}</span>` : ""}
                ${resumo.temporaria ? '<span class="escala-tag escala-tag-temp" title="Atuando fora da cidade de cadastro">temp.</span>' : ""}
            </span>
            <span class="escala-horario${foraDoPadrao ? " escala-horario-fora" : ""}"${foraDoPadrao ? ` title="Padrão: ${escaparHtml(faixaHorario(padrao.inicio, padrao.fim))}"` : ""}>${escaparHtml(faixaHorario(resumo.inicio, resumo.fim))}</span>
        </li>`;
}

function htmlForaHoje(fora) {
    if (fora.length === 0) return '<p class="alerta-vazio">Ninguém fora neste dia.</p>';

    const grupos = ["folga", "ferias", "atestado", "outras"]
        .map(situacao => ({ situacao, itens: fora.filter(d => d.resumo.situacao === situacao) }))
        .filter(g => g.itens.length);

    return `<div class="escala-cidades">${grupos.map(g => `
        <div class="escala-cidade">
            <div class="escala-cidade-topo">
                <h3>${ESCALA_SITUACOES[g.situacao]}</h3>
                <span class="escala-pilula">${g.itens.length}</span>
            </div>
            <ul class="escala-lista">
                ${g.itens.sort((a, b) => a.tech.nome.localeCompare(b.tech.nome, "pt-BR")).map(d => {
                    const { nome, terceira } = separarTerceira(d.tech.nome);
                    return `<li>
                        <i class="escala-ponto ponto-${g.situacao}"></i>
                        <span class="escala-nome"><strong>${escaparHtml(nome)}</strong>${terceira ? `<span class="escala-tag">${terceira}</span>` : ""}</span>
                        <span class="escala-horario">${escaparHtml(d.tech.cidade ?? "")}</span>
                    </li>`;
                }).join("")}
            </ul>
        </div>`).join("")}</div>`;
}

function ehMesmoDia(a, b) {
    return isoDataLocal(a) === isoDataLocal(b);
}

function registrarEscalaHoje() {
    const mudarDia = delta => {
        escalaHojeData = new Date((escalaHojeData ?? hojeMeiaNoite()).getTime());
        escalaHojeData.setDate(escalaHojeData.getDate() + delta);
        renderizarEscalaHoje();
    };
    document.getElementById("btnEscalaDiaAnterior")?.addEventListener("click", () => mudarDia(-1));
    document.getElementById("btnEscalaProximoDia")?.addEventListener("click", () => mudarDia(1));
    document.getElementById("btnEscalaHoje")?.addEventListener("click", () => { escalaHojeData = hojeMeiaNoite(); renderizarEscalaHoje(); });
    document.getElementById("btnAtualizarEscala")?.addEventListener("click", () => {
        escalaTecnicosCache = null;
        renderizarEscalaHoje();
    });
}
