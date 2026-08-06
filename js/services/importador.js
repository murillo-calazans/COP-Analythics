/**
 * ==========================================================
 * Serviço de Importação
 * ==========================================================
 * Fluxo em duas etapas encadeadas por gerarRelatorio():
 *  1. importarBase()   -> lê Base.xlsx, popula APP.referencias
 *  2. importarOrdens() -> lê Ordens.xlsx, popula APP.dados.ordens
 * Nenhuma outra camada acessa o Excel diretamente.
 *
 * A leitura/parse do Excel em si não muda nada (XLSX.read,
 * ReferenceEngine, DataEngine) — só o passo final de cada etapa, que
 * agora persiste no Supabase (js/services/armazenamento.js) em vez de
 * IndexedDB local, pra ficar compartilhado entre todo mundo que usa o
 * sistema. Só chega até aqui quem tem papel "admin" (botão escondido
 * pra "leitor" — ver js/ui/login.js -> aplicarGateDePapel), e a RLS
 * do banco recusaria a escrita de qualquer forma.
 */

async function importarBase() {

    const input = document.getElementById("arquivoBase");
    const status = document.getElementById("status");

    try {
        APP.status.carregando = true;
        status.textContent = "Carregando base de referência...";

        const arquivo = input.files[0];
        const buffer = await arquivo.arrayBuffer();
        const workbook = XLSX.read(buffer, { cellDates: true });

        const { operadores, eventos, diagnosticos } = ReferenceEngine.carregar(workbook);

        APP.referencias.operadores = operadores;
        APP.referencias.eventos = eventos;
        APP.referencias.diagnosticos = diagnosticos;
        APP.status.baseCarregada = true;

        status.textContent =
            `Base carregada: ${operadores.size} operadores, ${eventos.size} eventos, ${diagnosticos.size} diagnósticos. Salvando...`;

        console.log("APP.referencias:", APP.referencias);

        await persistirReferenciasNoSupabase({ operadores, eventos, diagnosticos });

        status.textContent =
            `Base carregada: ${operadores.size} operadores, ${eventos.size} eventos, ${diagnosticos.size} diagnósticos.`;

        return true;

    } catch (erro) {
        console.error(erro);
        status.textContent = `Erro ao carregar Base.xlsx: ${erro.message}`;
        return false;
    } finally {
        APP.status.carregando = false;
    }

}

async function importarOrdens() {

    const input = document.getElementById("arquivoOrdens");
    const status = document.getElementById("status");

    try {
        APP.status.carregando = true;
        status.textContent = "Processando ordens de serviço...";

        const arquivo = input.files[0];
        const buffer = await arquivo.arrayBuffer();
        const tipoArquivo = detectarTipoArquivo(buffer);

        const bytesIniciais = Array.from(new Uint8Array(buffer.slice(0, 16)))
            .map(b => b.toString(16).padStart(2, "0")).join(" ");
        console.log(`Arquivo: ${arquivo.name} (${buffer.byteLength} bytes). Tipo detectado: ${tipoArquivo}. Primeiros bytes: ${bytesIniciais}`);

        let nomeAba, linhas;

        if (tipoArquivo === "html") {
            // "Excel" gerado por sistema (ex.: IXC) que na verdade é uma
            // tabela HTML com extensão .xlsx — lida à parte do SheetJS.
            nomeAba = "(tabela HTML)";
            linhas = lerTabelaHtml(buffer);
        } else {
            const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
            ({ nomeAba, linhas } = lerPrimeiraAbaComDados(workbook));

            if (linhas.length === 0) {
                const diagnostico = workbook.SheetNames.map(nome => {
                    const s = workbook.Sheets[nome];
                    const totalCelulas = Object.keys(s).filter(k => k[0] !== "!").length;
                    return `${nome} (ref após correção: ${s["!ref"] ?? "ausente"}, células com valor: ${totalCelulas})`;
                }).join(" | ");

                throw new Error(
                    `Nenhuma aba com dados foi encontrada. Arquivo: ${buffer.byteLength} bytes, ` +
                    `tipo detectado: ${tipoArquivo}, primeiros bytes: ${bytesIniciais}. ` +
                    `Diagnóstico das abas: ${diagnostico}`
                );
            }
        }

        if (linhas.length === 0) {
            throw new Error("Não foi possível extrair nenhuma linha do arquivo.");
        }

        console.log(`Lendo "${nomeAba}" (${linhas.length} linhas, tipo detectado: ${tipoArquivo}).`);

        const { ordens, estatisticas } = DataEngine.processarOrdens(linhas);

        const totalOrdensAntes = APP.dados.ordens.size;
        DataEngine.mesclarOrdens(APP.dados.ordens, ordens);

        status.textContent = `Importação processada: ${estatisticas.ordens} ordens, ${estatisticas.movimentacoes} movimentações. Salvando no banco compartilhado...`;

        await persistirOrdensNoSupabase(ordens);

        const recorrentes = IndicatorEngine.calcularRecorrencia(FiltroEngine.ordensFiltradas());
        APP.indicadores.recorrencia = recorrentes;

        status.textContent =
            `Importação concluída: ${estatisticas.linhas} linhas → ` +
            `${estatisticas.ordens} ordens, ${estatisticas.movimentacoes} movimentações ` +
            `(${estatisticas.tempoMs} ms)` +
            (estatisticas.linhasIgnoradas > 0
                ? `. ${estatisticas.linhasIgnoradas} linha(s) ignorada(s) por não ter ID de OS.`
                : ".") +
            (totalOrdensAntes > 0
                ? ` Total acumulado: ${APP.dados.ordens.size} ordens.`
                : "") +
            (recorrentes.size > 0 ? ` ${recorrentes.size} cliente(s) recorrente(s) detectado(s).` : "");

        console.log("Estatísticas da importação:", estatisticas);
        console.log("APP.dados.ordens:", APP.dados.ordens);
        console.log("Clientes recorrentes:", recorrentes);

        renderizarAlertas();
        atualizarBadgeAlertas();

        return true;

    } catch (erro) {
        console.error(erro);
        status.textContent = `Erro ao processar Ordens.xlsx: ${erro.message}`;
        return false;
    } finally {
        APP.status.carregando = false;
    }

}

/**
 * Orquestra o fluxo completo do popup de importação: Base → Ordens →
 * fecha o modal e leva direto pro Dashboard já com os gráficos.
 */
async function gerarRelatorio() {
    const inputBase = document.getElementById("arquivoBase");
    const inputOrdens = document.getElementById("arquivoOrdens");
    const botao = document.getElementById("btnGerarRelatorio");

    if (inputBase.files.length === 0 || inputOrdens.files.length === 0) {
        alert("Selecione os dois arquivos (Base.xlsx e Ordens.xlsx) antes de gerar o relatório.");
        return;
    }

    if (botao) botao.disabled = true;

    const baseOk = await importarBase();

    if (!baseOk) {
        if (botao) botao.disabled = false;
        return;
    }

    const ordensOk = await importarOrdens();

    if (botao) botao.disabled = false;

    if (ordensOk) {
        fecharModal("modalImportar");
        mostrarSecao("dashboard");
    }
}

function lerPrimeiraAbaComDados(workbook) {
    for (const nomeAba of workbook.SheetNames) {
        const sheet = corrigirRangeSheet(workbook.Sheets[nomeAba]);
        const linhas = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        if (linhas.length > 0) {
            return { nomeAba, linhas };
        }
    }
    return { nomeAba: null, linhas: [] };
}
