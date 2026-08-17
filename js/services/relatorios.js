/**
 * ==========================================================
 * Relatórios HTML (Geral + Técnicos)
 * ==========================================================
 * Gera um arquivo .html autocontido (CSS + JS embutidos, sem
 * dependência externa nenhuma) a partir dos mesmos indicadores já
 * usados no Dashboard/Técnicos — nenhum cálculo novo aqui, só
 * formatação pra download. Respeita o Filtro Global ativo (a mesma
 * fatia de OS que a tela está mostrando na hora do clique).
 *
 * Tabelas de {rotulo, valor} viram tabelas ordenáveis (clique no
 * cabeçalho) com barra de proporção e, quando têm mais de
 * LIMIAR_ITENS_BUSCA itens, um campo de busca — tudo via um único
 * script embutido no final do documento (SCRIPT_RELATORIO), sem
 * nenhuma dependência de biblioteca externa.
 */

function baixarHtml(nomeArquivo, html) {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = nomeArquivo;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * ";" como separador (não ","): planilhas brasileiras usam vírgula como
 * separador decimal, então é o "," que confunde o Excel em pt-BR — ";"
 * é o que abre certinho, cada valor na própria coluna, sem configurar nada.
 */
function celulaCsv(valor) {
    const texto = valor === null || valor === undefined ? "" : String(valor);
    return /[;"\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/** linhas: array de arrays (cada array é uma linha, primeira linha = cabeçalho). */
function baixarCsv(nomeArquivo, linhas) {
    const conteudo = linhas.map(linha => linha.map(celulaCsv).join(";")).join("\r\n");
    const BOM = String.fromCharCode(0xFEFF); // força o Excel a ler como UTF-8 — sem isso, acento vira caractere estranho.
    const blob = new Blob([BOM + conteudo], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = nomeArquivo;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function carimboDataHora() {
    const d = new Date();
    const p = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

// Tabelas com mais itens que isso ganham campo de busca; abaixo disso
// (ex.: motivos de reagendamento, top 5 cidade/setor) a lista já é curta
// o bastante pra não precisar.
const LIMIAR_ITENS_BUSCA = 15;

const ESTILO_RELATORIO = `
    :root {
        color-scheme: light;
        --surface-1: #fcfcfb;
        --page-plane: #f4f5f7;
        --surface-card: #ffffff;
        --text-primary: #0b0b0b;
        --text-secondary: #52514e;
        --text-muted: #898781;
        --gridline: #e7e6e1;
        --border: #e2e2e2;
        --baseline: #c3c2b7;
        --seq-100: #cde2fb;
        --seq-150: #b7d3f6;
        --seq-250: #86b6ef;
        --seq-400: #3987e5;
        --seq-450: #2a78d6;
        --seq-500: #256abf;
        --status-warning: #fab219;
        --status-critical: #d03b3b;
        --radius: 10px;
        --shadow: 0 1px 2px rgba(11,11,11,0.04), 0 1px 8px rgba(11,11,11,0.03);
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
        font-family: system-ui, -apple-system, "Segoe UI", Arial, sans-serif;
        background: var(--page-plane); color: var(--text-primary);
        margin: 0; padding: 0 0 48px; font-variant-numeric: proportional-nums;
    }
    .relatorio { max-width: 1180px; margin: 0 auto; padding: 0 24px; }

    header.relatorio-cabecalho { padding: 28px 0 18px; }
    header.relatorio-cabecalho h1 { margin: 0 0 6px; font-size: 25px; letter-spacing: -0.01em; }
    header.relatorio-cabecalho p { margin: 2px 0; color: var(--text-secondary); font-size: 13px; }
    .relatorio-filtro {
        margin-top: 12px; padding: 10px 14px; background: #fff8e6;
        border: 1px solid #f5d98a; border-left: 4px solid var(--status-warning);
        border-radius: 8px; font-size: 13px; color: #6b4e05; display: flex; gap: 8px; align-items: flex-start;
    }

    nav.relatorio-nav {
        position: sticky; top: 0; z-index: 20;
        background: rgba(252,252,251,0.92); backdrop-filter: saturate(180%) blur(6px);
        border-bottom: 1px solid var(--border); margin: 0 -24px 24px; padding: 0 24px;
    }
    nav.relatorio-nav .nav-inner {
        max-width: 1180px; margin: 0 auto; display: flex; gap: 4px; overflow-x: auto; padding: 10px 0;
        scrollbar-width: thin;
    }
    nav.relatorio-nav a {
        white-space: nowrap; font-size: 12.5px; color: var(--text-secondary);
        text-decoration: none; padding: 6px 12px; border-radius: 999px; border: 1px solid transparent;
    }
    nav.relatorio-nav a:hover { background: var(--seq-100); color: var(--text-primary); }
    nav.relatorio-nav a.active { background: var(--seq-450); color: #fff; }

    section.bloco {
        background: var(--surface-card); border: 1px solid var(--border);
        border-radius: var(--radius); box-shadow: var(--shadow);
        padding: 22px; margin-bottom: 20px; scroll-margin-top: 64px;
    }
    section.bloco h2 { margin: 0 0 4px; font-size: 16px; }
    .section-head {
        display: flex; align-items: baseline; justify-content: space-between;
        border-bottom: 1px solid var(--gridline); padding-bottom: 10px; margin-bottom: 16px;
    }
    .section-head h2 { border: none; padding: 0; margin: 0; }
    .back-top { font-size: 11.5px; color: var(--text-muted); text-decoration: none; }
    .back-top:hover { color: var(--seq-450); }

    .kpi-group { margin-bottom: 18px; }
    .kpi-group:last-child { margin-bottom: 0; }
    .kpi-group-title {
        font-size: 11px; text-transform: uppercase; letter-spacing: .04em;
        color: var(--text-muted); font-weight: 600; margin: 0 0 8px;
    }
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
    .kpi-tile { padding: 14px 16px; background: var(--surface-1); border: 1px solid var(--gridline); border-radius: 8px; }
    .kpi-label { display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 6px; }
    .kpi-value { font-size: 22px; font-weight: 600; letter-spacing: -0.01em; }

    section.bloco-atencao { background: #fffaf0; }
    section.bloco-atencao .section-head { border-bottom-color: #f0e0b8; }
    section.bloco-atencao ul { margin: 0; padding-left: 20px; }
    section.bloco-atencao li { margin-bottom: 8px; font-size: 13px; line-height: 1.5; }
    section.bloco-atencao li:last-child { margin-bottom: 0; }

    .month-chart {
        display: flex; align-items: flex-end; gap: 14px; height: 160px;
        padding: 10px 4px 0; margin-bottom: 18px; border-bottom: 1px solid var(--baseline);
    }
    .month-bar-col { flex: 1 1 0; display: flex; flex-direction: column; align-items: center; height: 100%; }
    .month-bar-track { flex: 1; width: 100%; max-width: 40px; display: flex; align-items: flex-end; }
    .month-bar { width: 100%; background: var(--seq-450); border-radius: 4px 4px 0 0; position: relative; min-height: 2px; }
    .month-bar.bar-empty { background: var(--gridline); min-height: 2px; }
    .month-bar-val {
        position: absolute; top: -18px; left: 50%; transform: translateX(-50%);
        font-size: 11px; color: var(--text-secondary); white-space: nowrap; font-weight: 600;
    }
    .month-bar-label { margin-top: 8px; font-size: 12px; color: var(--text-secondary); }

    .duas-colunas { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    @media (max-width: 760px) { .duas-colunas { grid-template-columns: 1fr; } }
    .table-scroll { max-height: 420px; overflow-y: auto; border: 1px solid var(--gridline); border-radius: 8px; }
    .table-scroll.short { max-height: none; }
    table.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    table.data-table thead th {
        position: sticky; top: 0; background: var(--surface-1); color: var(--text-secondary);
        font-weight: 600; font-size: 11.5px; text-transform: uppercase; letter-spacing: .02em;
        text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--gridline);
        cursor: pointer; user-select: none; white-space: nowrap;
    }
    table.data-table thead th:hover { color: var(--text-primary); }
    table.data-table thead th .sort-ind { margin-left: 4px; font-size: 10px; color: var(--text-muted); }
    table.data-table thead th.sorted-asc .sort-ind::after { content: "▲"; }
    table.data-table thead th.sorted-desc .sort-ind::after { content: "▼"; }
    table.data-table td { text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--gridline); position: relative; }
    table.data-table tbody tr:last-child td { border-bottom: none; }
    table.data-table tbody tr:hover td { background: #f7f9fc; }
    table.data-table tbody tr.is-hidden { display: none; }
    td.qty-cell { font-variant-numeric: tabular-nums; }
    .databar { position: absolute; left: 0; top: 3px; bottom: 3px; z-index: 0; background: var(--seq-150); border-radius: 3px; }
    .qty-val { position: relative; z-index: 1; padding-left: 2px; }

    .table-tools { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; flex-wrap: wrap; }
    .table-search {
        flex: 1 1 220px; padding: 7px 10px; font-size: 13px; border: 1px solid var(--border);
        border-radius: 6px; background: var(--surface-1); color: var(--text-primary);
    }
    .table-search:focus { outline: 2px solid var(--seq-250); outline-offset: 1px; }
    .table-count { font-size: 11.5px; color: var(--text-muted); white-space: nowrap; }

    .subtable-title { font-size: 13px; font-weight: 600; margin: 0 0 8px; color: var(--text-primary); }
    .subtable { margin-bottom: 18px; }
    .subtable:last-child { margin-bottom: 0; }

    footer.relatorio-rodape { text-align: center; color: var(--text-muted); font-size: 12px; margin-top: 24px; }

    @media print {
        body { background: #fff; padding: 0; }
        nav.relatorio-nav { position: static; backdrop-filter: none; }
        section.bloco { border: none; box-shadow: none; break-inside: avoid; }
        .table-scroll { max-height: none; overflow: visible; }
        .table-tools { display: none; }
    }
`;

/** Ordenação por clique no cabeçalho + busca com campo de texto + link ativo no menu ao rolar — tudo num script só, reaproveitado nos dois relatórios. */
const SCRIPT_RELATORIO = `
(function () {
    "use strict";

    function stripAccents(s) { return s.normalize("NFD").replace(/[\\u0300-\\u036f]/g, ""); }

    document.querySelectorAll("table.data-table").forEach(function (table) {
        var thead = table.querySelector("thead");
        if (!thead) return;
        var ths = Array.prototype.slice.call(thead.querySelectorAll("th"));
        ths.forEach(function (th, colIndex) {
            th.addEventListener("click", function () {
                var tbody = table.querySelector("tbody");
                var rows = Array.prototype.slice.call(tbody.querySelectorAll("tr"));
                var currentDir = th.classList.contains("sorted-asc") ? "asc" : th.classList.contains("sorted-desc") ? "desc" : null;
                var nextDir = currentDir === "asc" ? "desc" : "asc";
                ths.forEach(function (t) { t.classList.remove("sorted-asc", "sorted-desc"); });
                th.classList.add(nextDir === "asc" ? "sorted-asc" : "sorted-desc");

                rows.sort(function (a, b) {
                    var ca = a.children[colIndex], cb = b.children[colIndex];
                    var va = ca ? ca.getAttribute("data-sort") : null;
                    var vb = cb ? cb.getAttribute("data-sort") : null;
                    var na = parseFloat(va), nb = parseFloat(vb);
                    var isNum = !isNaN(na) && !isNaN(nb) && /^-?\\d/.test(va || "");
                    var cmp = isNum ? (na - nb) : (va || "").localeCompare(vb || "", "pt-BR");
                    return nextDir === "asc" ? cmp : -cmp;
                });
                rows.forEach(function (r) { tbody.appendChild(r); });
            });
        });
    });

    document.querySelectorAll(".table-search").forEach(function (input) {
        var tools = input.closest(".table-tools");
        var wrapper = tools ? tools.nextElementSibling : null;
        var table = wrapper ? wrapper.querySelector("table.data-table") : null;
        if (!table) return;
        var countEl = tools.querySelector(".table-count");
        var totalRows = table.querySelectorAll("tbody tr").length;
        input.addEventListener("input", function () {
            var q = stripAccents(input.value.trim().toLowerCase());
            var visible = 0;
            table.querySelectorAll("tbody tr").forEach(function (tr) {
                var text = stripAccents(tr.textContent.toLowerCase());
                var match = q === "" || text.indexOf(q) !== -1;
                tr.classList.toggle("is-hidden", !match);
                if (match) visible++;
            });
            if (countEl) {
                countEl.textContent = q === "" ? (totalRows + " itens · clique no cabeçalho para ordenar") : (visible + " de " + totalRows + " itens");
            }
        });
    });

    var sections = Array.prototype.slice.call(document.querySelectorAll("section.bloco[id]"));
    var navLinks = Array.prototype.slice.call(document.querySelectorAll("nav.relatorio-nav a"));
    function onScroll() {
        var pos = window.scrollY + 90;
        var current = sections[0];
        sections.forEach(function (s) { if (s.offsetTop <= pos) current = s; });
        navLinks.forEach(function (a) { a.classList.toggle("active", current && a.getAttribute("href") === "#" + current.id); });
    }
    document.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
})();
`;

function resumoFiltroGlobalTexto() {
    const f = APP.filtrosGlobais ?? {};
    const partes = [];
    if (f.dataInicio) partes.push(`de ${formatarDataHora(f.dataInicio)}`);
    if (f.dataFim) partes.push(`até ${formatarDataHora(f.dataFim)}`);
    if (f.assuntos?.length) partes.push(`assuntos: ${f.assuntos.join(", ")}`);
    if (f.cidades?.length) partes.push(`cidades: ${f.cidades.join(", ")}`);
    if (f.bairros?.length) partes.push(`bairros: ${f.bairros.join(", ")}`);
    if (f.eventos?.length) partes.push(`eventos: ${f.eventos.join(", ")}`);
    if (f.operadores?.length) partes.push(`operadores: ${f.operadores.join(", ")}`);
    if (f.setores?.length) partes.push(`setores: ${f.setores.join(", ")}`);
    if (f.diagnosticosOcultos?.length) partes.push(`diagnósticos ocultos: ${f.diagnosticosOcultos.join(", ")}`);
    return partes.join(" · ");
}

function cabecalhoRelatorioHtml(titulo, totalOSConsiderado) {
    const filtroTexto = resumoFiltroGlobalTexto();
    return `
        <header class="relatorio-cabecalho" id="top">
            <h1>${escaparHtml(titulo)}</h1>
            <p>COP Analytics · Gerado em ${formatarDataHora(new Date())} por ${escaparHtml(APP.usuario?.email ?? "-")}</p>
            <p>${totalOSConsiderado} ordem(ns) de serviço consideradas</p>
            ${filtroTexto ? `<div class="relatorio-filtro">⚠ <span><strong>Filtro Global ativo</strong> — este relatório reflete só o recorte filtrado: ${escaparHtml(filtroTexto)}</span></div>` : ""}
        </header>
    `;
}

function navRelatorio(itens) {
    return `
        <nav class="relatorio-nav" aria-label="Índice do relatório">
            <div class="nav-inner">
                ${itens.map(([id, rotulo]) => `<a href="#${id}">${escaparHtml(rotulo)}</a>`).join("")}
            </div>
        </nav>
    `;
}

function secaoAbre(id, titulo, primeira = false) {
    return `
    <section class="bloco" id="${id}">
        <div class="section-head"><h2>${escaparHtml(titulo)}</h2>${primeira ? "" : '<a class="back-top" href="#top">↑ topo</a>'}</div>
    `;
}

/** Linha de uma tabela ordenável a partir de {rotulo, valor}. */
function linhaTabelaOrdenavel(item, formatarValor, maxValor) {
    const valorNum = Number(item.valor) || 0;
    const larguraPct = maxValor > 0 ? (valorNum / maxValor) * 100 : 0;
    const chaveTexto = normalizarTexto(String(item.rotulo ?? ""));
    return `
        <tr>
            <td data-sort="${escaparHtml(chaveTexto)}">${escaparHtml(String(item.rotulo))}</td>
            <td class="qty-cell" data-sort="${valorNum.toFixed(4)}">
                <span class="databar" style="width:${larguraPct.toFixed(1)}%"></span>
                <span class="qty-val">${escaparHtml(String(formatarValor(item.valor)))}</span>
            </td>
        </tr>
    `;
}

/**
 * Tabela ordenável (clique no cabeçalho) a partir de uma lista
 * {rotulo, valor} — com barra de proporção e, acima de
 * LIMIAR_ITENS_BUSCA itens, campo de busca. Usada pra toda lista
 * simples de duas colunas do relatório (motivos, assuntos,
 * diagnósticos, ranking de técnico, top cidade/setor etc.).
 */
function tabelaOrdenavel(idTabela, titulo, itens, rotuloColuna = "Item", valorColuna = "Quantidade", formatarValor = v => v) {
    if (!itens || itens.length === 0) {
        return `<p class="subtable-title">${escaparHtml(titulo)} (0)</p><p style="color:var(--text-muted);font-size:13px;">Sem dados.</p>`;
    }

    const maxValor = Math.max(...itens.map(i => Number(i.valor) || 0));
    const mostrarBusca = itens.length > LIMIAR_ITENS_BUSCA;
    const linhas = itens.map(item => linhaTabelaOrdenavel(item, formatarValor, maxValor)).join("");

    return `
        <p class="subtable-title">${escaparHtml(titulo)} (${itens.length})</p>
        ${mostrarBusca ? `
        <div class="table-tools">
            <input type="search" class="table-search" placeholder="Buscar em ${itens.length} itens…" aria-label="Buscar em ${idTabela}">
            <span class="table-count">${itens.length} itens · clique no cabeçalho para ordenar</span>
        </div>` : ""}
        <div class="table-scroll${mostrarBusca ? "" : " short"}">
            <table class="data-table" id="${idTabela}">
                <thead>
                    <tr>
                        <th data-col="0">${escaparHtml(rotuloColuna)}<span class="sort-ind"></span></th>
                        <th data-col="1">${escaparHtml(valorColuna)}<span class="sort-ind"></span></th>
                    </tr>
                </thead>
                <tbody>${linhas}</tbody>
            </table>
        </div>
    `;
}

/** Gráfico de barras simples (CSS puro) de OS finalizadas por mês. */
function graficoMensal(meses) {
    if (!meses || meses.length === 0) return "";
    const max = Math.max(...meses.map(m => m.totalFinalizadas), 1);

    return `
        <div class="month-chart" role="img" aria-label="Ordens de serviço finalizadas por mês">
            ${meses.map(m => {
                const vazio = m.totalFinalizadas === 0;
                const pct = (m.totalFinalizadas / max) * 100;
                return `
                    <div class="month-bar-col">
                        <div class="month-bar-track">
                            <div class="month-bar${vazio ? " bar-empty" : ""}" style="height:${pct.toFixed(1)}%">
                                <span class="month-bar-val">${vazio ? "" : m.totalFinalizadas}</span>
                            </div>
                        </div>
                        <div class="month-bar-label">${escaparHtml(m.rotulo)}</div>
                    </div>
                `;
            }).join("")}
        </div>
    `;
}

/** Tabela (não-ordenável, é uma série temporal — a ordem natural já é a única que faz sentido) da visão mensal. */
function tabelaMensal(meses, horas) {
    return `
        <table class="data-table">
            <thead><tr><th>Mês</th><th>Finalizadas</th><th>TMS</th><th>TMA</th><th>TMR</th><th>TME</th><th>Reabertas</th><th>Técnicos ativos</th></tr></thead>
            <tbody>
                ${meses.map(m => `
                    <tr>
                        <td>${escaparHtml(m.rotulo)}</td>
                        <td>${m.totalFinalizadas}</td>
                        <td>${horas(m.tmsHoras)}</td>
                        <td>${horas(m.tmaHoras)}</td>
                        <td>${horas(m.tmrHoras)}</td>
                        <td>${horas(m.tmeHoras)}</td>
                        <td>${m.reabertas}</td>
                        <td>${m.tecnicosAtivos}</td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
    `;
}

// Limiares que definem o que vira "Ponto de Atenção" no Relatório Geral —
// arbitrários (sem benchmark oficial do setor), ajustáveis aqui se a
// realidade operacional pedir outro corte.
const LIMIAR_REABERTURA_PERCENTUAL = 10;
const LIMIAR_REAGENDAMENTO_PERCENTUAL = 15;
const FATOR_TMS_TECNICO_ATENCAO = 1.5; // técnico "lento" = TMS acima de 1,5x a média geral
const MINIMO_FINALIZADAS_TECNICO_ATENCAO = 3; // ignora quem tem poucas OS (amostra pequena demais pra significar algo)

/**
 * Achados automáticos a partir dos mesmos números já calculados pro
 * resto do relatório — nenhuma OS é lida de novo aqui, só aplica
 * limiares (ver constantes acima) em cima do que "painel"/"fichas" já
 * trazem. Sempre um texto pronto, pra não exigir que quem lê saiba o
 * que é "normal" pra cada indicador.
 */
function calcularPontosDeAtencao(ordens, painel, fichas, totalCancelados) {
    const pontos = [];

    if (painel.indiceReabertura.percentual > LIMIAR_REABERTURA_PERCENTUAL) {
        pontos.push(
            `Reabertura em ${painel.indiceReabertura.percentual.toFixed(1)}% das OS finalizadas ` +
            `(${painel.indiceReabertura.totalReabertas} de ${painel.indiceReabertura.totalFinalizadas}) — ` +
            `acima do limite de referência (${LIMIAR_REABERTURA_PERCENTUAL}%).`
        );
    }

    if (painel.indiceReagendamento.percentual > LIMIAR_REAGENDAMENTO_PERCENTUAL) {
        pontos.push(
            `Reagendamento em ${painel.indiceReagendamento.percentual.toFixed(1)}% das OS — ` +
            `acima do limite de referência (${LIMIAR_REAGENDAMENTO_PERCENTUAL}%).`
        );
    }

    if (painel.deslocamentosAbandonados.total > 0) {
        const piores = painel.deslocamentosAbandonados.porTecnico
            .slice(0, 3)
            .map(t => `${t.rotulo} (${t.valor})`)
            .join(", ");
        pontos.push(
            `${painel.deslocamentosAbandonados.total} deslocamento(s)/execução(ões) abandonados — o técnico ` +
            `começou o atendimento mas outro operador reagendou por cima antes dele concluir. Mais frequente: ${piores}.`
        );
    }

    if (totalCancelados > 0) {
        pontos.push(
            `${totalCancelados} cliente(s) recorrente(s) cancelaram após várias OS em pouco tempo — ` +
            `ver aba "Clientes Cancelados" em Alertas pra identificar quem e o que motivou.`
        );
    }

    if (painel.tmsHoras) {
        const lentos = fichas.filter(f =>
            f.totalFinalizadas >= MINIMO_FINALIZADAS_TECNICO_ATENCAO &&
            f.tmsHoras !== null &&
            f.tmsHoras > painel.tmsHoras * FATOR_TMS_TECNICO_ATENCAO
        );
        if (lentos.length > 0) {
            const lista = lentos.slice(0, 5).map(f => `${f.nome} (${formatarDuracaoHoras(f.tmsHoras)})`).join(", ");
            pontos.push(
                `${lentos.length} técnico(s) com TMS bem acima da média geral (${formatarDuracaoHoras(painel.tmsHoras)}): ${lista}.`
            );
        }
    }

    const tmrCidadePior = IndicatorEngine.calcularTmrPorCidade(ordens, 3, true);
    if (tmrCidadePior.length > 0) {
        const lista = tmrCidadePior.map(c => `${c.rotulo} (${formatarDuracaoHoras(c.valor)})`).join(", ");
        pontos.push(`Cidades com o pior TMR (mais demora até o 1º agendamento): ${lista}.`);
    }

    const tmsSetorPior = IndicatorEngine.calcularTmsPorSetor(ordens, 3, true);
    if (tmsSetorPior.length > 0) {
        const lista = tmsSetorPior.map(s => `${s.rotulo} (${formatarDuracaoHoras(s.valor)})`).join(", ");
        pontos.push(`Setores com o pior TMS (mais tempo de solução em campo): ${lista}.`);
    }

    return pontos;
}

/** Uma linha por técnico: Nome, Finalizadas, Reagendadas, TMS, Deslocamento abandonado, Reabertura, Recorrência gerada. */
function tabelaTecnicosPorLinha(fichas) {
    if (fichas.length === 0) return `<p class="subtable-title">Técnicos (0)</p><p style="color:var(--text-muted);font-size:13px;">Sem dados.</p>`;

    const mostrarBusca = fichas.length > LIMIAR_ITENS_BUSCA;
    const linhas = fichas.map(f => `
        <tr>
            <td data-sort="${f.ranking}">${f.ranking}</td>
            <td data-sort="${escaparHtml(normalizarTexto(f.nome))}">${escaparHtml(f.nome)}</td>
            <td class="qty-cell" data-sort="${f.totalFinalizadas}"><span class="qty-val">${f.totalFinalizadas}</span></td>
            <td class="qty-cell" data-sort="${f.reagendamentosAcertos + f.reagendamentosErros}">
                <span class="qty-val">${f.reagendamentosAcertos + f.reagendamentosErros} (${f.reagendamentosAcertos} ok / ${f.reagendamentosErros} errado)</span>
            </td>
            <td class="qty-cell" data-sort="${f.tmsHoras ?? -1}"><span class="qty-val">${formatarDuracaoHoras(f.tmsHoras)}</span></td>
            <td class="qty-cell" data-sort="${f.deslocamentosAbandonados}"><span class="qty-val">${f.deslocamentosAbandonados}</span></td>
            <td class="qty-cell" data-sort="${f.reaberturas}"><span class="qty-val">${f.reaberturas} (${f.indiceReaberturaPercentual.toFixed(1)}%)</span></td>
            <td class="qty-cell" data-sort="${f.recorrenciasGeradas}"><span class="qty-val">${f.recorrenciasGeradas} (${f.percentualRecorrenciaSobreFinalizadas.toFixed(1)}%)</span></td>
        </tr>
    `).join("");

    return `
        <p class="subtable-title">Técnicos (${fichas.length})</p>
        ${mostrarBusca ? `
        <div class="table-tools">
            <input type="search" class="table-search" placeholder="Buscar em ${fichas.length} técnicos…" aria-label="Buscar em tbl-tecnicos">
            <span class="table-count">${fichas.length} itens · clique no cabeçalho para ordenar</span>
        </div>` : ""}
        <div class="table-scroll${mostrarBusca ? "" : " short"}">
            <table class="data-table" id="tbl-tecnicos">
                <thead>
                    <tr>
                        <th data-col="0">#<span class="sort-ind"></span></th>
                        <th data-col="1">Nome<span class="sort-ind"></span></th>
                        <th data-col="2">Finalizadas<span class="sort-ind"></span></th>
                        <th data-col="3">Reagendadas<span class="sort-ind"></span></th>
                        <th data-col="4">TMS<span class="sort-ind"></span></th>
                        <th data-col="5">Deslocamento abandonado<span class="sort-ind"></span></th>
                        <th data-col="6">Reabertura<span class="sort-ind"></span></th>
                        <th data-col="7">Recorrência gerada<span class="sort-ind"></span></th>
                    </tr>
                </thead>
                <tbody>${linhas}</tbody>
            </table>
        </div>
    `;
}

/**
 * Uma OS -> um registro plano (id, cliente, login, cidade, bairro, assunto,
 * técnico e diagnóstico do fechamento, datas, status) — reaproveitado tanto
 * pela tabela HTML (tabelaDetalheOS) quanto pelo CSV (gerarPlanilhaDetalheOS).
 */
function coletarLinhasDetalheOS(ordens) {
    const analise = IndicatorEngine.analisarEventosDeTodas(ordens);

    return [...ordens.values()].map(ordem => {
        const info = analise.get(ordem.id);
        const tecnico = info?.ultimoFechamento?.operador !== null && info?.ultimoFechamento?.operador !== undefined
            ? AuditEngine.resolverReferencia(APP.referencias.operadores, info.ultimoFechamento.operador, CONFIG_BASE.operadores.nome)
            : null;
        const diagnostico = info?.ultimoFechamento?.diagnostico
            ? AuditEngine.resolverReferencia(APP.referencias.diagnosticos, info.ultimoFechamento.diagnostico, CONFIG_BASE.diagnosticos.nome)
            : null;

        return {
            id: ordem.id,
            cliente: ordem.cliente,
            login: ordem.login,
            cidade: ordem.cidade,
            bairro: ordem.bairro,
            assunto: ordem.assunto,
            tecnico,
            diagnostico,
            dataAbertura: ordem.dataAbertura,
            dataFechamento: ordem.dataFechamento,
            status: ordem.statusAtual
        };
    });
}

/** Uma linha por OS: assunto, técnico e diagnóstico do fechamento, datas, status — ordenável e com busca, igual ao resto do relatório. */
function tabelaDetalheOS(ordens) {
    const registros = coletarLinhasDetalheOS(ordens);

    const linhas = registros.map(d => `
        <tr>
            <td data-sort="${Number(d.id) || 0}">${escaparHtml(String(d.id))}</td>
            <td data-sort="${escaparHtml(normalizarTexto(d.cliente ?? ""))}">${escaparHtml(d.cliente ?? "-")}</td>
            <td data-sort="${escaparHtml(normalizarTexto(d.login ?? ""))}">${escaparHtml(d.login ?? "-")}</td>
            <td data-sort="${escaparHtml(normalizarTexto(d.cidade ?? ""))}">${escaparHtml(d.cidade ?? "-")}</td>
            <td data-sort="${escaparHtml(normalizarTexto(d.bairro ?? ""))}">${escaparHtml(d.bairro ?? "-")}</td>
            <td data-sort="${escaparHtml(normalizarTexto(d.assunto ?? ""))}">${escaparHtml(d.assunto ?? "-")}</td>
            <td data-sort="${escaparHtml(normalizarTexto(d.tecnico ?? ""))}">${escaparHtml(d.tecnico ?? "-")}</td>
            <td data-sort="${escaparHtml(normalizarTexto(d.diagnostico ?? ""))}">${escaparHtml(d.diagnostico ?? "-")}</td>
            <td data-sort="${d.dataAbertura ? d.dataAbertura.getTime() : 0}">${formatarDataHora(d.dataAbertura)}</td>
            <td data-sort="${d.dataFechamento ? d.dataFechamento.getTime() : 0}">${formatarDataHora(d.dataFechamento)}</td>
            <td data-sort="${escaparHtml(normalizarTexto(d.status ?? ""))}">${escaparHtml(d.status ?? "-")}</td>
        </tr>
    `).join("");

    return `
        <p class="subtable-title">Detalhamento por OS (${registros.length})</p>
        <div class="table-tools">
            <input type="search" class="table-search" placeholder="Buscar em ${registros.length} OS (cliente, assunto, técnico, diagnóstico...)" aria-label="Buscar em tbl-detalhe-os">
            <span class="table-count">${registros.length} itens · clique no cabeçalho para ordenar</span>
        </div>
        <div class="table-scroll">
            <table class="data-table" id="tbl-detalhe-os">
                <thead>
                    <tr>
                        <th data-col="0">ID OS<span class="sort-ind"></span></th>
                        <th data-col="1">Cliente<span class="sort-ind"></span></th>
                        <th data-col="2">Login<span class="sort-ind"></span></th>
                        <th data-col="3">Cidade<span class="sort-ind"></span></th>
                        <th data-col="4">Bairro<span class="sort-ind"></span></th>
                        <th data-col="5">Assunto<span class="sort-ind"></span></th>
                        <th data-col="6">Técnico<span class="sort-ind"></span></th>
                        <th data-col="7">Diagnóstico<span class="sort-ind"></span></th>
                        <th data-col="8">Abertura<span class="sort-ind"></span></th>
                        <th data-col="9">Fechamento<span class="sort-ind"></span></th>
                        <th data-col="10">Status<span class="sort-ind"></span></th>
                    </tr>
                </thead>
                <tbody>${linhas}</tbody>
            </table>
        </div>
    `;
}

/** Botão "Baixar planilha (.csv)" (Dashboard) — só o detalhamento por OS, sem passar pelo relatório em HTML. */
function gerarPlanilhaDetalheOS() {
    const ordens = FiltroEngine.ordensFiltradas();
    const cabecalho = ["ID OS", "Cliente", "Login", "Cidade", "Bairro", "Assunto", "Técnico", "Diagnóstico", "Abertura", "Fechamento", "Status"];

    const linhas = coletarLinhasDetalheOS(ordens).map(d => [
        d.id,
        d.cliente ?? "",
        d.login ?? "",
        d.cidade ?? "",
        d.bairro ?? "",
        d.assunto ?? "",
        d.tecnico ?? "",
        d.diagnostico ?? "",
        formatarDataHora(d.dataAbertura),
        formatarDataHora(d.dataFechamento),
        d.status ?? ""
    ]);

    baixarCsv(`detalhamento-os-${carimboDataHora()}.csv`, [cabecalho, ...linhas]);
}

/** Botão "Relatório geral" (Dashboard). */
function gerarRelatorioGeral() {
    const ordens = FiltroEngine.ordensFiltradas();
    const painel = IndicatorEngine.calcularPainelDashboard(ordens);
    const tendencia = IndicatorEngine.calcularTendenciaMensal(ordens);
    const tmsCidade = IndicatorEngine.calcularTmsPorCidade(ordens);
    const tmaCidade = IndicatorEngine.calcularTmaPorCidade(ordens);
    const tmrCidade = IndicatorEngine.calcularTmrPorCidade(ordens);
    const tmsSetor = IndicatorEngine.calcularTmsPorSetor(ordens);
    const tmaSetor = IndicatorEngine.calcularTmaPorSetor(ordens);
    const tmrSetor = IndicatorEngine.calcularTmrPorSetor(ordens);

    const recorrentes = [...(APP.indicadores.recorrencia ?? new Map()).values()];
    const cancelados = recorrentes.filter(r => r.cancelado).length;
    const ativos = recorrentes.length - cancelados;

    const fichas = IndicatorEngine.calcularFichasTecnicos(ordens);
    const pontosDeAtencao = calcularPontosDeAtencao(ordens, painel, fichas, cancelados);

    const horas = v => formatarDuracaoHoras(v);

    const nav = navRelatorio([
        ["visao-geral", "Visão geral"],
        ["pontos-atencao", "Pontos de atenção"],
        ["visao-mensal", "Visão mensal"],
        ["motivos-assuntos", "Motivos & assuntos"],
        ["diagnosticos", "Diagnósticos"],
        ["tecnicos", "Técnicos"],
        ["melhores-tempos", "Melhores tempos"],
        ["detalhe-os", "Detalhamento por OS"]
    ]);

    const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Relatório Geral — COP Analytics</title>
<style>${ESTILO_RELATORIO}</style>
</head>
<body>
<div class="relatorio">
    ${cabecalhoRelatorioHtml("Relatório Geral", painel.totalOS)}
    ${nav}

    <section class="bloco" id="visao-geral">
        <div class="section-head"><h2>Visão geral</h2></div>
        <div class="kpi-group">
            <h3 class="kpi-group-title">Volume e equipe</h3>
            <div class="kpi-grid">
                <div class="kpi-tile"><span class="kpi-label">Total de OS</span><strong class="kpi-value">${painel.totalOS}</strong></div>
                <div class="kpi-tile"><span class="kpi-label">OS finalizadas</span><strong class="kpi-value">${painel.totalFinalizadas}</strong></div>
                <div class="kpi-tile"><span class="kpi-label">Técnicos ativos</span><strong class="kpi-value">${painel.totalTecnicos}</strong></div>
                <div class="kpi-tile"><span class="kpi-label">Solo / Dupla</span><strong class="kpi-value">${painel.soloVsDupla.solo} / ${painel.soloVsDupla.dupla}</strong></div>
            </div>
        </div>
        <div class="kpi-group">
            <h3 class="kpi-group-title">Tempos médios</h3>
            <div class="kpi-grid">
                <div class="kpi-tile"><span class="kpi-label">TMS</span><strong class="kpi-value">${horas(painel.tmsHoras)}</strong></div>
                <div class="kpi-tile"><span class="kpi-label">TMA</span><strong class="kpi-value">${horas(painel.tmaHoras)}</strong></div>
                <div class="kpi-tile"><span class="kpi-label">TMR</span><strong class="kpi-value">${horas(painel.tmrHoras)}</strong></div>
                <div class="kpi-tile"><span class="kpi-label">TME</span><strong class="kpi-value">${horas(painel.tmeHoras)}</strong></div>
            </div>
        </div>
        <div class="kpi-group">
            <h3 class="kpi-group-title">Qualidade do atendimento</h3>
            <div class="kpi-grid">
                <div class="kpi-tile"><span class="kpi-label">Reabertura</span><strong class="kpi-value">${painel.indiceReabertura.percentual.toFixed(1)}%</strong></div>
                <div class="kpi-tile"><span class="kpi-label">Reagendamento</span><strong class="kpi-value">${painel.indiceReagendamento.percentual.toFixed(1)}%</strong></div>
                <div class="kpi-tile"><span class="kpi-label">Deslocamentos abandonados</span><strong class="kpi-value">${painel.deslocamentosAbandonados.total}</strong></div>
            </div>
        </div>
        <div class="kpi-group">
            <h3 class="kpi-group-title">Clientes recorrentes</h3>
            <div class="kpi-grid">
                <div class="kpi-tile"><span class="kpi-label">Ativos</span><strong class="kpi-value">${ativos}</strong></div>
                <div class="kpi-tile"><span class="kpi-label">Cancelados</span><strong class="kpi-value">${cancelados}</strong></div>
            </div>
        </div>
    </section>

    <section class="bloco bloco-atencao" id="pontos-atencao">
        <div class="section-head"><h2>⚠ Pontos de atenção</h2><a class="back-top" href="#top">↑ topo</a></div>
        ${pontosDeAtencao.length > 0
            ? `<ul>${pontosDeAtencao.map(p => `<li>${escaparHtml(p)}</li>`).join("")}</ul>`
            : `<p style="color:var(--text-muted);font-size:13px;">Nenhum ponto fora dos limites de referência configurados — operação dentro do esperado.</p>`}
    </section>

    ${tendencia.meses.length > 0 ? `
    <section class="bloco" id="visao-mensal">
        <div class="section-head"><h2>Visão mensal ${tendencia.ano ?? ""}</h2><a class="back-top" href="#top">↑ topo</a></div>
        ${graficoMensal(tendencia.meses)}
        <div class="table-scroll short">${tabelaMensal(tendencia.meses, horas)}</div>
    </section>` : ""}

    <section class="bloco" id="motivos-assuntos">
        <div class="section-head"><h2>Motivos de reagendamento &amp; OS por assunto</h2><a class="back-top" href="#top">↑ topo</a></div>
        <div class="duas-colunas">
            <div>${tabelaOrdenavel("tbl-motivos", "Motivos de reagendamento", painel.motivosReagendamento)}</div>
            <div>${tabelaOrdenavel("tbl-assuntos", "OS por assunto", painel.porAssunto)}</div>
        </div>
    </section>

    <section class="bloco" id="diagnosticos">
        <div class="section-head"><h2>Diagnósticos mais usados &amp; ranking de técnicos</h2><a class="back-top" href="#top">↑ topo</a></div>
        <div class="duas-colunas">
            <div>${tabelaOrdenavel("tbl-diagnosticos", "Diagnósticos mais usados", painel.diagnosticosMaisUsados)}</div>
            <div>${tabelaOrdenavel("tbl-ranking", "Ranking de técnicos — finalizadas", painel.rankingTecnicos, "Técnico", "Finalizadas")}</div>
        </div>
    </section>

    <section class="bloco" id="tecnicos">
        <div class="section-head"><h2>Recorrência, reagendamento e deslocamentos por técnico</h2><a class="back-top" href="#top">↑ topo</a></div>
        <div class="duas-colunas">
            <div>${tabelaOrdenavel("tbl-recorrencia", "Recorrência gerada por técnico", painel.recorrenciaPorTecnico, "Técnico", "Recorrências")}</div>
            <div>${tabelaOrdenavel("tbl-reagend-tec", "Reagendamentos por técnico", IndicatorEngine.calcularReagendamentosPorTecnico(ordens), "Técnico", "Reagendamentos")}</div>
        </div>
        <div class="duas-colunas" style="margin-top:20px;">
            <div>${tabelaOrdenavel("tbl-deslocamentos", "Deslocamentos abandonados por técnico", painel.deslocamentosAbandonados.porTecnico, "Técnico", "Ocorrências")}</div>
            <div></div>
        </div>
        <p style="margin:16px 0 0;color:var(--text-muted);font-size:12px;">
            TMR não entra por técnico — mede a empresa como um todo em agendar, não a atuação de um técnico específico (ver TMR geral e por cidade/setor abaixo).
        </p>
        ${tabelaTecnicosPorLinha(fichas)}
    </section>

    <section class="bloco" id="melhores-tempos">
        <div class="section-head"><h2>Melhores tempos por cidade / setor <span style="font-weight:400;color:var(--text-muted);font-size:12px;">(mínimo ${IndicatorEngine.MINIMO_OS_RANKING_CIDADE} OS no período)</span></h2><a class="back-top" href="#top">↑ topo</a></div>
        <div class="duas-colunas">
            <div>
                <div class="subtable">${tabelaOrdenavel("tbl-cidade-tms", "Top 5 cidades — melhor TMS", tmsCidade, "Cidade", "TMS", horas)}</div>
                <div class="subtable">${tabelaOrdenavel("tbl-cidade-tma", "Top 5 cidades — melhor TMA", tmaCidade, "Cidade", "TMA", horas)}</div>
                <div class="subtable">${tabelaOrdenavel("tbl-cidade-tmr", "Top 5 cidades — melhor TMR", tmrCidade, "Cidade", "TMR", horas)}</div>
            </div>
            <div>
                <div class="subtable">${tabelaOrdenavel("tbl-setor-tms", "Top setores — melhor TMS", tmsSetor, "Setor", "TMS", horas)}</div>
                <div class="subtable">${tabelaOrdenavel("tbl-setor-tma", "Top setores — melhor TMA", tmaSetor, "Setor", "TMA", horas)}</div>
                <div class="subtable">${tabelaOrdenavel("tbl-setor-tmr", "Top setores — melhor TMR", tmrSetor, "Setor", "TMR", horas)}</div>
            </div>
        </div>
    </section>

    <section class="bloco" id="detalhe-os">
        <div class="section-head"><h2>Detalhamento por OS</h2><a class="back-top" href="#top">↑ topo</a></div>
        ${tabelaDetalheOS(ordens)}
    </section>

    <footer class="relatorio-rodape">COP Analytics · Inteligência Operacional</footer>
</div>
<script>${SCRIPT_RELATORIO}<\/script>
</body>
</html>`;

    baixarHtml(`relatorio-geral-${carimboDataHora()}.html`, html);
}

/** Botão "Relatório de técnicos" (seção Técnicos). */
function gerarRelatorioTecnicos() {
    const ordens = FiltroEngine.ordensFiltradas();
    const fichas = IndicatorEngine.calcularFichasTecnicos(ordens);

    const mostrarBusca = fichas.length > LIMIAR_ITENS_BUSCA;
    const linhas = fichas.map(f => `
        <tr>
            <td data-sort="${f.ranking}">${f.ranking}</td>
            <td data-sort="${escaparHtml(normalizarTexto(f.nome))}">${escaparHtml(f.nome)}</td>
            <td class="qty-cell" data-sort="${f.totalFinalizadas}"><span class="qty-val">${f.totalFinalizadas}</span></td>
            <td class="qty-cell" data-sort="${f.tmsHoras ?? -1}"><span class="qty-val">${formatarDuracaoHoras(f.tmsHoras)}</span></td>
            <td class="qty-cell" data-sort="${f.tmaHoras ?? -1}"><span class="qty-val">${formatarDuracaoHoras(f.tmaHoras)}</span></td>
            <td class="qty-cell" data-sort="${f.reaberturas}"><span class="qty-val">${f.reaberturas} (${f.indiceReaberturaPercentual.toFixed(1)}%)</span></td>
            <td class="qty-cell" data-sort="${f.reagendamentosAcertos + f.reagendamentosErros}"><span class="qty-val">${f.reagendamentosAcertos + f.reagendamentosErros} (${f.reagendamentosAcertos} ok / ${f.reagendamentosErros} errado)</span></td>
            <td class="qty-cell" data-sort="${f.recorrenciasGeradas}"><span class="qty-val">${f.recorrenciasGeradas} (${f.percentualRecorrenciaSobreFinalizadas.toFixed(1)}%)</span></td>
            <td data-sort="${f.trabalhosSolo}">${f.trabalhosSolo} solo / ${f.trabalhosDupla} dupla</td>
            <td class="qty-cell" data-sort="${f.deslocamentosAbandonados}"><span class="qty-val">${f.deslocamentosAbandonados}</span></td>
        </tr>
    `).join("");

    const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Relatório de Técnicos — COP Analytics</title>
<style>${ESTILO_RELATORIO}</style>
</head>
<body>
<div class="relatorio">
    ${cabecalhoRelatorioHtml("Relatório de Técnicos", ordens.size)}

    <section class="bloco" id="tecnicos">
        <p style="margin-top:0;color:var(--text-muted);font-size:12px;">
            TMS e TMA aqui são segmentados — só o tempo em que o técnico esteve de fato atuando (deslocamento/execução até o
            fechamento/reagendamento daquele ciclo), não o tempo corrido total da OS. TMR (tempo até o 1º agendamento) mede a
            velocidade da empresa como um todo em agendar, não a atuação de um técnico específico — por isso não entra na ficha
            individual (ver Relatório Geral).
        </p>
        <p class="subtable-title">Técnicos (${fichas.length})</p>
        ${mostrarBusca ? `
        <div class="table-tools">
            <input type="search" class="table-search" placeholder="Buscar em ${fichas.length} técnicos…" aria-label="Buscar em tbl-tecnicos-full">
            <span class="table-count">${fichas.length} itens · clique no cabeçalho para ordenar</span>
        </div>` : ""}
        <div class="table-scroll${mostrarBusca ? "" : " short"}">
            <table class="data-table" id="tbl-tecnicos-full">
                <thead>
                    <tr>
                        <th data-col="0">#<span class="sort-ind"></span></th>
                        <th data-col="1">Técnico<span class="sort-ind"></span></th>
                        <th data-col="2">Finalizadas<span class="sort-ind"></span></th>
                        <th data-col="3">TMS<span class="sort-ind"></span></th>
                        <th data-col="4">TMA<span class="sort-ind"></span></th>
                        <th data-col="5">Reaberturas<span class="sort-ind"></span></th>
                        <th data-col="6">Reagendamentos<span class="sort-ind"></span></th>
                        <th data-col="7">Recorrências geradas<span class="sort-ind"></span></th>
                        <th data-col="8">Solo / Dupla<span class="sort-ind"></span></th>
                        <th data-col="9">Deslocamentos abandonados<span class="sort-ind"></span></th>
                    </tr>
                </thead>
                <tbody>${linhas}</tbody>
            </table>
        </div>
    </section>

    <footer class="relatorio-rodape">COP Analytics · Inteligência Operacional</footer>
</div>
<script>${SCRIPT_RELATORIO}<\/script>
</body>
</html>`;

    baixarHtml(`relatorio-tecnicos-${carimboDataHora()}.html`, html);
}
