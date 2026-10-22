/**
 * ==========================================================
 * Tela Inicial
 * ==========================================================
 * Primeira tela depois do login: hero de saudação + stats do dia, o
 * painel de operação, o "Seu mês" (pelas OS — ver ProducaoEngine) e um
 * "hoje no COP" curto (escala, agenda, alertas) que leva pros módulos.
 * Visual moderno: cards com ícone/cor (.op-card, CSS em agendaixc.css).
 */

function saudacaoDoHorario(data = new Date()) {
    const hora = data.getHours();
    if (hora < 12) return "Bom dia";
    if (hora < 18) return "Boa tarde";
    return "Boa noite";
}

// Ícones (SVG paths) usados nos cards/títulos da tela inicial.
const ICONES_INICIO = {
    plus: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>',
    redo: '<path d="M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.2L3 16M3 21v-5h5"/>',
    ok: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5-6"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14a6 6 0 0 1 3.5 6"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
    warn: '<path d="M12 3 2 20h20zM12 10v4M12 17h.01"/>'
};
const svgIcone = n => `<svg viewBox="0 0 24 24" class="op-svg">${ICONES_INICIO[n] || ""}</svg>`;

/** Título de seção com ícone (visual novo). */
function secTitulo(texto, icone) {
    return `<div class="sec-titulo">${icone ? svgIcone(icone) : ""}<span>${escaparHtml(texto)}</span></div>`;
}

/** Card com ícone + cor. Clicável (vai pro módulo) se "secao" for passado. */
function cardInicio(rotulo, valor, cor, icone, secao) {
    const inner = `<span class="op-ic">${svgIcone(icone)}</span><span class="op-txt"><small>${rotulo}</small><strong>${valor}</strong></span>`;
    return secao
        ? `<button type="button" class="op-card" data-ir-secao="${secao}" style="--c:${cor}">${inner}</button>`
        : `<div class="op-card op-card-estatico" style="--c:${cor}">${inner}</div>`;
}

/** Nº de OS finalizadas hoje (pro stat do hero). */
function fechamentosDeHoje() {
    const ords = APP?.dados?.ordens;
    if (!ords) return 0;
    const h = hojeMeiaNoite().getTime(), a = h + 86400000;
    let n = 0;
    for (const o of ords.values()) {
        const df = o.dataFechamento;
        if (df && df.getTime() >= h && df.getTime() < a && String(o.statusAtual || "").toLowerCase() === "finalizada") n++;
    }
    return n;
}

function renderizarInicio() {
    const container = document.getElementById("inicioConteudo");
    if (!container) return;

    const agora = new Date();
    const nome = primeiroNomeUsuario();
    const mes = agora.toLocaleDateString("pt-BR", { month: "long" });
    const fechHoje = fechamentosDeHoje().toLocaleString("pt-BR");

    container.innerHTML = `
        <section class="inicio-hero">
            <div class="inicio-hero-txt">
                <h1>${saudacaoDoHorario(agora)}${nome ? `, ${escaparHtml(nome)}` : ""} 👋</h1>
                <p class="inicio-hero-resumo" id="inicioHeroResumo">${escaparHtml(formatarDataLonga(agora))}.</p>
            </div>
            <div class="inicio-hero-live">
                <div><b id="heroTecnicos">…</b><span>técnicos na escala</span></div>
                <div><b id="heroAgenda">…</b><span>OS na agenda</span></div>
                <div><b>${fechHoje}</b><span>fechamentos hoje</span></div>
            </div>
        </section>

        <div id="inicioPainelOperacao"></div>

        ${secTitulo(`Seu mês de ${mes}`, "users")}
        <div id="inicioMeuMes">${conteudoMeuMes()}</div>

        ${secTitulo("Hoje no COP", "list")}
        <div class="kpi-row" id="inicioHoje">
            ${cardInicio("Técnicos na escala", '<span id="inicioTecnicosHoje">…</span>', "#7c3aed", "users", "escala-hoje")}
            ${cardInicio("OS na agenda do dia", '<span id="inicioAgendaHoje">…</span>', "#2563eb", "list", "agenda-hoje")}
            ${cardInicio("Alertas de recorrência", (APP.indicadores.recorrenciaAlertas?.size ?? 0).toLocaleString("pt-BR"), "#dc2626", "repeat", "alertas")}
        </div>

        <div id="inicioAtrasadas"></div>
    `;

    container.querySelectorAll("[data-ir-secao]").forEach(botao =>
        botao.addEventListener("click", () => mostrarSecao(botao.dataset.irSecao)));

    preencherHojeNoCop();
    preencherAtrasadas();
    preencherResumoHero();
    if (typeof renderizarPainelOperacao === "function") renderizarPainelOperacao();
}

/**
 * Resumo do dia no hero: pendências de reagendamento (OS de dias anteriores
 * ainda em aberto) + equipes que já saíram pra campo (em deslocamento agora).
 * Dados reais; cada número é clicável e leva pra Gestão de Ordens.
 */
async function preencherResumoHero() {
    const alvo = document.getElementById("inicioHeroResumo");
    if (!alvo) return;
    try {
        const [pendRes, painel] = await Promise.all([
            typeof calcularAtrasadas === "function" ? calcularAtrasadas() : Promise.resolve(null),
            typeof calcularPainelOperacao === "function" ? calcularPainelOperacao() : Promise.resolve(null)
        ]);
        const pend = pendRes?.total || 0;
        const desl = painel?.inicioOperacao?.desloc?.length || 0;

        const link = (valor, rotulo) =>
            `<button type="button" class="inicio-hero-link" data-ir-secao="agenda-hoje"><b>${valor} ${rotulo}</b></button>`;
        const partes = [];
        if (pend > 0) partes.push(`${link(pend, "OS")} do dia anterior ${pend === 1 ? "ainda não foi reagendada" : "ainda não foram reagendadas"}`);
        if (desl > 0) partes.push(`${link(desl, desl === 1 ? "equipe" : "equipes")} ${desl === 1 ? "já está em deslocamento" : "já estão em deslocamento"}`);

        if (!partes.length) {
            alvo.textContent = "Tudo em dia por aqui. Tenha um ótimo dia de trabalho.";
            return;
        }
        const frase = partes.length > 1
            ? partes.slice(0, -1).join(", ") + " e " + partes[partes.length - 1]
            : partes[0];
        alvo.innerHTML = frase + ".";
        alvo.querySelectorAll("[data-ir-secao]").forEach(b =>
            b.addEventListener("click", () => mostrarSecao(b.dataset.irSecao)));
    } catch (e) {
        console.warn("Resumo do hero:", e);
    }
}

/**
 * Card do painel: técnicos que começaram o dia com OS de dias anteriores
 * ainda em aberto (ninguém reagendou). Visível a todos os logados (inclusive leitor).
 */
async function preencherAtrasadas() {
    const alvo = document.getElementById("inicioAtrasadas");
    if (!alvo || typeof calcularAtrasadas !== "function") return;
    try {
        const { total, itens } = await calcularAtrasadas();
        if (!total) { alvo.innerHTML = ""; return; }

        alvo.innerHTML = `
            <button type="button" class="inicio-alert" id="atrasadasCard">
                <span class="op-ic">${svgIcone("warn")}</span>
                <span class="inicio-alert-txt">
                    <strong>Pendências de reagendamento</strong>
                    <small>OS de dias anteriores marcadas e ainda em aberto</small>
                </span>
                <span class="inicio-alert-num">${total}</span>
            </button>`;

        const corpo = document.getElementById("modalAtrasadasCorpo");
        if (corpo) {
            corpo.innerHTML = `
                <p class="modal-resumo">${total} OS marcadas para dias anteriores e ainda em aberto:</p>
                <table class="atrasadas-tabela">
                    <thead><tr><th>OS</th><th>Assunto</th><th>Técnico (agenda)</th><th>Dia</th></tr></thead>
                    <tbody>${itens.map(i => `
                        <tr>
                            <td>#${escaparHtml(String(i.id))}</td>
                            <td>${escaparHtml(i.assunto || "—")}</td>
                            <td>${escaparHtml(i.tecnico || "—")}</td>
                            <td>${escaparHtml(i.dia)}</td>
                        </tr>`).join("")}</tbody>
                </table>`;
        }
        document.getElementById("atrasadasCard")?.addEventListener("click", () => abrirModal("modalAtrasadas"));
    } catch (e) {
        console.warn("Atrasadas:", e);
        alvo.innerHTML = "";
    }
}

function conteudoMeuMes() {
    if (!APP.status.baseCarregada || APP.dados.ordens.size === 0) {
        return '<p class="alerta-vazio">Carregando suas ordens...</p>';
    }

    const producao = ProducaoEngine.doMesAtual();
    const eu = ProducaoEngine.encontrarOperador(producao, APP.usuario?.nome);

    if (!eu) {
        return `<p class="alerta-vazio">Não achei "${escaparHtml(APP.usuario?.nome ?? "")}" entre os operadores das OS deste mês.
            Se o seu nome no sistema de OS for diferente, peça a um admin pra ajustar o nome do seu perfil.</p>`;
    }

    const n = v => v.toLocaleString("pt-BR");
    return `
        <div class="kpi-row">
            ${cardInicio("Aberturas", n(eu.aberturas), "#0891b2", "plus")}
            ${cardInicio("Agendamentos", n(eu.agendamentos), "#2563eb", "cal")}
            ${cardInicio("Reagendamentos", n(eu.reagendamentos), "#d97706", "redo")}
            ${cardInicio("Fechamentos", n(eu.fechamentos), "#059669", "ok")}
        </div>`;
}

async function preencherHojeNoCop() {
    const tecnicos = document.getElementById("inicioTecnicosHoje");
    const heroTec = document.getElementById("heroTecnicos");
    const agenda = document.getElementById("inicioAgendaHoje");
    const heroAg = document.getElementById("heroAgenda");

    carregarEscalaTecnicos()
        .then(techs => {
            const v = montarEscalaDoDia(techs, hojeMeiaNoite()).filter(d => d.trabalha).length;
            if (tecnicos) tecnicos.textContent = v;
            if (heroTec) heroTec.textContent = v;
        })
        .catch(() => { if (tecnicos) tecnicos.textContent = "—"; if (heroTec) heroTec.textContent = "—"; });

    const total = await totalAgendaDeHoje();
    const v = total === null ? "—" : total;
    if (agenda) agenda.textContent = v;
    if (heroAg) heroAg.textContent = v;
}
