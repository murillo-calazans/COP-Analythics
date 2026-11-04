let _linhasOrdensCache = [];

let _diagnosticosDistintosCache = [];

let _ordensDiagnosticoSelecionado = "";

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

    _linhasOrdensCache.sort((a, b) => (b.dataFinal?.getTime() ?? -1) - (a.dataFinal?.getTime() ?? -1));

    _diagnosticosDistintosCache = [...diagnosticosDistintos].sort((a, b) => a.localeCompare(b, "pt-BR"));

    if (_ordensDiagnosticoSelecionado && !_diagnosticosDistintosCache.includes(_ordensDiagnosticoSelecionado)) {
        _ordensDiagnosticoSelecionado = "";
    }
    const busca = document.getElementById("buscaDiagnosticoOrdens");
    if (busca) busca.value = _ordensDiagnosticoSelecionado;
}

let _ordensFiltroRegistrado = false;

function registrarFiltroOrdens() {
    if (_ordensFiltroRegistrado) return;
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
            evento.preventDefault();
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

function linhasOrdensFiltradas() {
    const termoNormalizado = normalizarTexto(document.getElementById("buscaOrdens")?.value ?? "");

    const dataInicioBruta = document.getElementById("ordensDataInicio")?.value;
    const dataFimBruta = document.getElementById("ordensDataFim")?.value;
    const dataInicio = dataInicioBruta ? new Date(`${dataInicioBruta}T00:00:00`) : null;
    const dataFim = dataFimBruta ? new Date(`${dataFimBruta}T23:59:59`) : null;

    return _linhasOrdensCache.filter(linha => {
        if (_ordensDiagnosticoSelecionado && linha.diagnostico !== _ordensDiagnosticoSelecionado) return false;

        if (dataInicio || dataFim) {
            if (!linha.dataFinal) return false;
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
