/**
 * ==========================================================
 * UI de Ordens de Serviço (aba Ordens)
 * ==========================================================
 * Lista TODAS as OS (ID, Cliente/Login, Assunto, Diagnóstico, Próxima
 * Tarefa, Técnico, Data final) — Diagnóstico/Próxima Tarefa/Técnico são
 * sempre do fechamento EFETIVO (ver IndicatorEngine.analisarEventosOS
 * -> fechamentoEfetivo), mesmo critério usado no resto do sistema.
 *
 * De propósito INDEPENDENTE do Filtro Global — usa APP.dados.ordens
 * (tudo), só recortado pelo filtro PRÓPRIO desta aba (Diagnóstico +
 * busca livre), mesmo padrão da aba Alertas (ver js/ui/alertas.js).
 * Motivo do pedido original: poder escolher um Diagnóstico específico e
 * ver só as OS que caíram nele, sem depender do estado do Filtro Global.
 */

// Linhas já computadas (1x por render da aba — cálculo pesado, roda em
// cima de TODAS as OS) — o filtro/busca reaproveita esse cache em vez
// de recalcular tudo a cada tecla.
let _linhasOrdensCache = [];

// Lista de diagnósticos distintos (extraída de _linhasOrdensCache, não
// via FiltroEngine.coletarOpcoes de novo) — pro campo de busca do
// seletor de Diagnóstico, sem precisar reprocessar todas as OS a cada
// tecla digitada.
let _diagnosticosDistintosCache = [];

// Diagnóstico escolhido no seletor de busca desta aba ("" = todos).
let _ordensDiagnosticoSelecionado = "";

// Cap de linhas desenhadas de uma vez — sem isso um diagnóstico muito
// comum (ex.: TROCA DE EQUIPAMENTO, milhares de OS) travaria o
// navegador desenhando tudo de uma vez.
const LIMITE_LINHAS_ORDENS = 300;

function renderizarOrdens() {
    if (!APP.status.baseCarregada || APP.dados.ordens.size === 0) {
        document.getElementById("listaOrdens").innerHTML = '<p class="alerta-vazio">Importe dados pra ver as ordens.</p>';
        return;
    }

    calcularLinhasOrdens();
    registrarFiltroOrdens();
    aplicarFiltroOrdens();
}

/** Monta o cache de linhas — 1x, a partir de TODAS as OS (independente do Filtro Global). */
function calcularLinhasOrdens() {
    const ordens = APP.dados.ordens;
    const analise = IndicatorEngine.analisarEventosDeTodas(ordens);

    _linhasOrdensCache = [];
    const diagnosticosDistintos = new Set();

    for (const ordem of ordens.values()) {
        const fechamento = analise.get(ordem.id)?.fechamentoEfetivo ?? null;

        const diagnostico = fechamento
            ? AuditEngine.resolverReferencia(APP.referencias.diagnosticos, fechamento.diagnostico, CONFIG_BASE.diagnosticos.nome)
            : null;
        const proximaTarefa = fechamento?.proximaTarefa ? String(fechamento.proximaTarefa).trim() : null;
        const tecnico = fechamento ? IndicatorEngine.nomeResponsavelFechamento(fechamento) : null;

        if (diagnostico) diagnosticosDistintos.add(diagnostico);

        _linhasOrdensCache.push({
            id: ordem.id,
            cliente: ordem.cliente,
            login: ordem.login,
            assunto: ordem.assunto,
            diagnostico,
            proximaTarefa,
            tecnico,
            dataFinal: fechamento?.data ?? null
        });
    }

    // Mais recente primeiro — ordem sem fechamento (dataFinal null) vai pro fim.
    _linhasOrdensCache.sort((a, b) => (b.dataFinal?.getTime() ?? -1) - (a.dataFinal?.getTime() ?? -1));

    _diagnosticosDistintosCache = [...diagnosticosDistintos].sort((a, b) => a.localeCompare(b, "pt-BR"));

    // Diagnóstico escolhido antes de reimportar pode não existir mais.
    if (_ordensDiagnosticoSelecionado && !_diagnosticosDistintosCache.includes(_ordensDiagnosticoSelecionado)) {
        _ordensDiagnosticoSelecionado = "";
    }
    const busca = document.getElementById("buscaDiagnosticoOrdens");
    if (busca) busca.value = _ordensDiagnosticoSelecionado;
}

let _ordensFiltroRegistrado = false;

function registrarFiltroOrdens() {
    if (_ordensFiltroRegistrado) return; // elementos são fixos no HTML, só liga 1x
    _ordensFiltroRegistrado = true;

    const buscaDiagnostico = document.getElementById("buscaDiagnosticoOrdens");
    if (buscaDiagnostico) {
        buscaDiagnostico.addEventListener("focus", renderizarDropdownDiagnosticoOrdens);
        buscaDiagnostico.addEventListener("input", renderizarDropdownDiagnosticoOrdens);
        buscaDiagnostico.addEventListener("blur", () => {
            setTimeout(() => {
                const dropdown = document.getElementById("dropdownDiagnosticoOrdens");
                if (dropdown) dropdown.hidden = true;
            }, 150);
        });
    }

    document.getElementById("buscaOrdens")?.addEventListener("input", aplicarFiltroOrdens);

    document.getElementById("ordensDataInicio")?.addEventListener("change", aplicarFiltroOrdens);
    document.getElementById("ordensDataFim")?.addEventListener("change", aplicarFiltroOrdens);
    document.getElementById("btnLimparPeriodoOrdens")?.addEventListener("click", () => {
        const dataInicio = document.getElementById("ordensDataInicio");
        const dataFim = document.getElementById("ordensDataFim");
        if (dataInicio) dataInicio.value = "";
        if (dataFim) dataFim.value = "";
        aplicarFiltroOrdens();
    });
}

/** Dropdown de busca do Diagnóstico (mesmo padrão de busca+lista do Setor do COP, ver js/ui/setorescop.js) — não muda o filtro sozinho, só narra as opções até o clique. */
function renderizarDropdownDiagnosticoOrdens() {
    const dropdown = document.getElementById("dropdownDiagnosticoOrdens");
    const busca = document.getElementById("buscaDiagnosticoOrdens");
    if (!dropdown || !busca) return;

    const termoNormalizado = normalizarTexto(busca.value);
    const disponiveis = _diagnosticosDistintosCache.filter(
        opcao => !termoNormalizado || normalizarTexto(opcao).includes(termoNormalizado)
    );

    const opcaoTodos = `<div class="seletor-multiplo-opcao" data-valor="">Todos os diagnósticos</div>`;

    dropdown.innerHTML = _diagnosticosDistintosCache.length === 0
        ? '<div class="seletor-multiplo-vazio">Importe dados pra ver as opções.</div>'
        : opcaoTodos + (disponiveis.length > 0
            ? disponiveis.map(opcao => `<div class="seletor-multiplo-opcao" data-valor="${escaparHtml(opcao)}">${escaparHtml(opcao)}</div>`).join("")
            : '<div class="seletor-multiplo-vazio">Nenhum diagnóstico encontrado.</div>');

    dropdown.querySelectorAll("[data-valor]").forEach(item => {
        item.addEventListener("mousedown", evento => {
            evento.preventDefault(); // não deixa o blur do input rodar antes do clique
            selecionarDiagnosticoOrdens(item.dataset.valor);
        });
    });

    dropdown.hidden = false;
}

function selecionarDiagnosticoOrdens(valor) {
    _ordensDiagnosticoSelecionado = valor;

    const busca = document.getElementById("buscaDiagnosticoOrdens");
    if (busca) busca.value = valor;

    const dropdown = document.getElementById("dropdownDiagnosticoOrdens");
    if (dropdown) dropdown.hidden = true;

    aplicarFiltroOrdens();
}

/**
 * Linhas de _linhasOrdensCache que batem com o filtro PRÓPRIO desta aba
 * agora (Diagnóstico + período + busca) — separado de aplicarFiltroOrdens
 * pra também servir de base pro Relatório (ver gerarRelatorioOrdens em
 * js/services/relatorios.js), sem duplicar a lógica de filtro.
 */
function linhasOrdensFiltradas() {
    const termoNormalizado = normalizarTexto(document.getElementById("buscaOrdens")?.value ?? "");

    // Período PRÓPRIO desta aba (igual Alertas) — filtra pela Data final
    // (fechamento efetivo), não pela abertura da OS.
    const dataInicioBruta = document.getElementById("ordensDataInicio")?.value;
    const dataFimBruta = document.getElementById("ordensDataFim")?.value;
    const dataInicio = dataInicioBruta ? new Date(`${dataInicioBruta}T00:00:00`) : null;
    const dataFim = dataFimBruta ? new Date(`${dataFimBruta}T23:59:59`) : null;

    return _linhasOrdensCache.filter(linha => {
        if (_ordensDiagnosticoSelecionado && linha.diagnostico !== _ordensDiagnosticoSelecionado) return false;

        if (dataInicio || dataFim) {
            if (!linha.dataFinal) return false; // sem fechamento não tem como bater num período
            if (dataInicio && linha.dataFinal < dataInicio) return false;
            if (dataFim && linha.dataFinal > dataFim) return false;
        }

        if (termoNormalizado) {
            const bate = [linha.id, linha.cliente, linha.login, linha.assunto].some(
                campo => campo !== null && campo !== undefined && normalizarTexto(String(campo)).includes(termoNormalizado)
            );
            if (!bate) return false;
        }

        return true;
    });
}

function aplicarFiltroOrdens() {
    const filtradas = linhasOrdensFiltradas();
    renderizarResumoFiltroOrdens(filtradas.length);
    renderizarTabelaOrdens(filtradas);
}

function renderizarResumoFiltroOrdens(totalFiltrado) {
    const container = document.getElementById("resumoFiltroOrdens");
    if (!container) return;

    const totalGeral = _linhasOrdensCache.length.toLocaleString("pt-BR");
    const texto = totalFiltrado === _linhasOrdensCache.length
        ? `${totalGeral} OS no total.`
        : `${totalFiltrado.toLocaleString("pt-BR")} de ${totalGeral} OS bate com o filtro.`;

    container.textContent = totalFiltrado > LIMITE_LINHAS_ORDENS
        ? `${texto} Mostrando as ${LIMITE_LINHAS_ORDENS} mais recentes — refine o filtro/busca pra ver outras.`
        : texto;
}

function renderizarTabelaOrdens(linhas) {
    const container = document.getElementById("listaOrdens");
    if (!container) return;

    if (linhas.length === 0) {
        container.innerHTML = '<p class="alerta-vazio">Nenhuma OS bate com esse filtro.</p>';
        return;
    }

    const visiveis = linhas.slice(0, LIMITE_LINHAS_ORDENS);

    container.innerHTML = `
        <div class="tabela-scroll">
            <table class="tabela-alertas">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Cliente / Login</th>
                        <th>Assunto</th>
                        <th>Diagnóstico</th>
                        <th>Próxima Tarefa</th>
                        <th>Técnico</th>
                        <th>Data final</th>
                    </tr>
                </thead>
                <tbody>
                    ${visiveis.map(linha => `
                        <tr data-id="${escaparHtml(String(linha.id))}" class="linha-clicavel">
                            <td>${escaparHtml(String(linha.id))}</td>
                            <td>${escaparHtml(linha.cliente ?? "-")} (${escaparHtml(linha.login ?? "-")})</td>
                            <td>${textoFiltravel("assuntos", linha.assunto)}</td>
                            <td>${textoFiltravel("diagnosticos", linha.diagnostico)}</td>
                            <td>${escaparHtml(linha.proximaTarefa ?? "-")}</td>
                            <td>${textoFiltravel("operadores", linha.tecnico)}</td>
                            <td>${formatarDataHora(linha.dataFinal)}</td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;

    container.querySelectorAll("tr[data-id]").forEach(tr => {
        tr.addEventListener("click", () => abrirModalOS(tr.dataset.id));
    });
}
