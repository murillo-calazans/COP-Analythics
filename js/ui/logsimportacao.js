/**
 * ==========================================================
 * UI de Logs de Importação
 * ==========================================================
 * Mostra, dentro do popup de Importar Dados, quais arquivos já
 * foram carregados no banco compartilhado — nome, quem, quando,
 * resumo. Só leitura aqui; quem grava o log é
 * js/services/importador.js logo depois de cada importação.
 */

/** Abre o popup de Importar Dados já com a lista de logs atualizada. */
function abrirModalImportar() {
    abrirModal("modalImportar");
    renderizarLogsImportacao();
}

async function renderizarLogsImportacao() {
    const container = document.getElementById("listaLogsImportacao");
    if (!container) return;

    if (!APP.status.autenticado) {
        container.innerHTML = "";
        return;
    }

    container.innerHTML = '<p class="alerta-vazio">Carregando...</p>';

    const logs = await buscarLogsImportacao();

    if (logs.length === 0) {
        container.innerHTML = '<p class="alerta-vazio">Nenhum arquivo importado ainda.</p>';
        return;
    }

    container.innerHTML = `
        <table class="tabela-alertas">
            <thead>
                <tr>
                    <th>Arquivo</th>
                    <th>Tipo</th>
                    <th>Resumo</th>
                    <th>Quem</th>
                    <th>Quando</th>
                </tr>
            </thead>
            <tbody>
                ${logs.map(log => `
                    <tr>
                        <td>${escaparHtml(log.nome_arquivo)}</td>
                        <td>${log.tipo === "base" ? "Base" : "Ordens"}</td>
                        <td>${escaparHtml(resumoLogImportacao(log))}</td>
                        <td>${escaparHtml(log.importado_por ?? "-")}</td>
                        <td>${formatarDataHora(log.importado_em ? new Date(log.importado_em) : null)}</td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
    `;
}

function resumoLogImportacao(log) {
    const e = log.estatisticas;
    if (!e) return "-";

    if (log.tipo === "base") {
        return `${e.operadores ?? 0} operadores, ${e.eventos ?? 0} eventos, ${e.diagnosticos ?? 0} diagnósticos`;
    }

    return `${e.ordens ?? 0} ordens, ${e.movimentacoes ?? 0} movimentações` +
        (e.movimentacoesIgnoradas > 0 ? ` (+${e.movimentacoesIgnoradas} já existente(s))` : "") +
        (e.linhasIgnoradas > 0 ? ` (${e.linhasIgnoradas} linha(s) ignorada(s) sem ID)` : "");
}
