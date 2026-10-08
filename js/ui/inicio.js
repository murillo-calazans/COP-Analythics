/**
 * ==========================================================
 * Tela Inicial
 * ==========================================================
 * Primeira tela depois do login: saudação com o nome do usuário,
 * o que ele já fez no mês (pelas OS — ver ProducaoEngine) e um
 * "hoje no COP" curto (escala, agenda, alertas) que leva pros
 * módulos. Sem abas no topo: os módulos ficam no menu lateral.
 */

function saudacaoDoHorario(data = new Date()) {
    const hora = data.getHours();
    if (hora < 12) return "Bom dia";
    if (hora < 18) return "Boa tarde";
    return "Boa noite";
}

function tileInicio(rotulo, valor, secao) {
    const conteudo = `<div class="stat-label">${rotulo}</div><div class="stat-valor">${valor}</div>`;
    return secao
        ? `<button type="button" class="stat-tile stat-tile-link" data-ir-secao="${secao}">${conteudo}</button>`
        : `<div class="stat-tile">${conteudo}</div>`;
}

function renderizarInicio() {
    const container = document.getElementById("inicioConteudo");
    if (!container) return;

    const agora = new Date();
    const nome = primeiroNomeUsuario();
    const mes = agora.toLocaleDateString("pt-BR", { month: "long" });

    container.innerHTML = `
        <div class="inicio-saudacao">
            <h2>${saudacaoDoHorario(agora)}${nome ? `, ${escaparHtml(nome)}` : ""}! 👋</h2>
            <p>Tenha um ótimo dia de trabalho. Hoje é ${formatarDataLonga(agora).toLowerCase()}.</p>
        </div>

        <div class="indicadores-secao-titulo">Seu mês de ${mes}</div>
        <div id="inicioMeuMes">${conteudoMeuMes()}</div>

        <div class="indicadores-secao-titulo">Hoje no COP</div>
        <div class="kpi-row" id="inicioHoje">
            ${tileInicio("Técnicos na escala", '<span id="inicioTecnicosHoje">…</span>', "escala-hoje")}
            ${tileInicio("OS na agenda do dia", '<span id="inicioAgendaHoje">…</span>', "agenda-hoje")}
            ${tileInicio("Alertas de recorrência", (APP.indicadores.recorrenciaAlertas?.size ?? 0).toLocaleString("pt-BR"), "alertas")}
        </div>
    `;

    container.querySelectorAll("[data-ir-secao]").forEach(botao =>
        botao.addEventListener("click", () => mostrarSecao(botao.dataset.irSecao)));

    preencherHojeNoCop();
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
            ${tileInicio("Aberturas", n(eu.aberturas))}
            ${tileInicio("Agendamentos", n(eu.agendamentos))}
            ${tileInicio("Reagendamentos", n(eu.reagendamentos))}
            ${tileInicio("Fechamentos", n(eu.fechamentos))}
        </div>`;
}

async function preencherHojeNoCop() {
    const tecnicos = document.getElementById("inicioTecnicosHoje");
    const agenda = document.getElementById("inicioAgendaHoje");

    carregarEscalaTecnicos()
        .then(techs => {
            if (tecnicos) tecnicos.textContent = montarEscalaDoDia(techs, hojeMeiaNoite()).filter(d => d.trabalha).length;
        })
        .catch(() => { if (tecnicos) tecnicos.textContent = "—"; });

    const total = await totalAgendaDeHoje();
    if (agenda) agenda.textContent = total === null ? "—" : total;
}
