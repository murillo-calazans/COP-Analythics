/**
 * ==========================================================
 * UI de Logs (Importação + Login)
 * ==========================================================
 * Duas exibições:
 * 1. Dentro do popup de Importar Dados, quais arquivos já foram
 *    carregados no banco compartilhado — nome, quem, quando, resumo.
 * 2. Popup dedicado de Logs (botão no cabeçalho, admin-only), com
 *    abas "Logins" e "Arquivos" — a de Arquivos reaproveita a mesma
 *    renderizarLogsImportacao() acima, só que num container diferente.
 * Só leitura aqui; quem grava cada log é js/services/importador.js
 * (arquivos) e js/ui/login.js (logins), na hora que acontece.
 */

/** Abre o popup de Importar Dados já com a lista de logs atualizada. */
function abrirModalImportar() {
    abrirModal("modalImportar");
    renderizarLogsImportacao();
}

async function renderizarLogsImportacao(idContainer = "listaLogsImportacao") {
    const container = document.getElementById(idContainer);
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

/** Abre o popup dedicado de Logs, sempre começando na aba Logins. */
function abrirModalLogs() {
    abrirModal("modalLogs");
    alternarAbaLogs("logins");
}

function registrarAbasLogs() {
    const botaoLogins = document.getElementById("abaLogsLogins");
    const botaoArquivos = document.getElementById("abaLogsArquivos");

    if (botaoLogins) botaoLogins.addEventListener("click", () => alternarAbaLogs("logins"));
    if (botaoArquivos) botaoArquivos.addEventListener("click", () => alternarAbaLogs("arquivos"));
}

function alternarAbaLogs(aba) {
    const botaoLogins = document.getElementById("abaLogsLogins");
    const botaoArquivos = document.getElementById("abaLogsArquivos");
    const painelLogins = document.getElementById("painelLogsLogins");
    const painelArquivos = document.getElementById("painelLogsArquivos");
    if (!botaoLogins || !botaoArquivos || !painelLogins || !painelArquivos) return;

    const ehLogins = aba === "logins";
    botaoLogins.classList.toggle("ativo", ehLogins);
    botaoArquivos.classList.toggle("ativo", !ehLogins);
    painelLogins.hidden = !ehLogins;
    painelArquivos.hidden = ehLogins;

    if (ehLogins) renderizarLogsLogin();
    else renderizarLogsImportacao("listaLogsArquivosModal");
}

async function renderizarLogsLogin() {
    const container = document.getElementById("listaLogsLogin");
    if (!container) return;

    if (!APP.status.autenticado) {
        container.innerHTML = "";
        return;
    }

    container.innerHTML = '<p class="alerta-vazio">Carregando...</p>';

    const logs = await buscarLogsLogin();

    if (logs.length === 0) {
        container.innerHTML = '<p class="alerta-vazio">Nenhum login registrado ainda.</p>';
        return;
    }

    container.innerHTML = `
        <table class="tabela-alertas">
            <thead>
                <tr>
                    <th>Usuário</th>
                    <th>Quando</th>
                </tr>
            </thead>
            <tbody>
                ${logs.map(log => `
                    <tr>
                        <td>${escaparHtml(log.usuario_email)}</td>
                        <td>${formatarDataHora(log.logado_em ? new Date(log.logado_em) : null)}</td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
    `;
}
