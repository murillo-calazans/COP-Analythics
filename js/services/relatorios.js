/**
 * ==========================================================
 * Relatórios HTML (Geral + Técnicos)
 * ==========================================================
 * Gera um arquivo .html autocontido (CSS embutido, sem dependência
 * externa nenhuma) a partir dos mesmos indicadores já usados no
 * Dashboard/Técnicos — nenhum cálculo novo aqui, só formatação pra
 * download. Respeita o Filtro Global ativo (a mesma fatia de OS que
 * a tela está mostrando na hora do clique).
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

const ESTILO_RELATORIO = `
    * { box-sizing: border-box; }
    body { font-family: -apple-system, "Segoe UI", Arial, sans-serif; background: #f4f5f7; color: #1a1a1a; margin: 0; padding: 32px; }
    .relatorio { max-width: 1100px; margin: 0 auto; }
    header.relatorio-cabecalho { margin-bottom: 24px; }
    header.relatorio-cabecalho h1 { margin: 0 0 4px; font-size: 24px; }
    header.relatorio-cabecalho p { margin: 2px 0; color: #555; font-size: 13px; }
    .relatorio-filtro { margin-top: 10px; padding: 10px 14px; background: #fff3cd; border: 1px solid #ffe69c; border-radius: 8px; font-size: 13px; color: #664d03; }
    section.bloco { background: #fff; border: 1px solid #e2e2e2; border-radius: 10px; padding: 20px; margin-bottom: 20px; }
    section.bloco h2 { margin: 0 0 14px; font-size: 16px; border-bottom: 1px solid #eee; padding-bottom: 8px; }
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px; }
    .kpi { padding: 14px; background: #f8f9fb; border-radius: 8px; }
    .kpi span { display: block; font-size: 12px; color: #666; margin-bottom: 4px; }
    .kpi strong { font-size: 20px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid #eee; }
    th { color: #666; font-weight: 600; font-size: 12px; text-transform: uppercase; }
    tr:last-child td { border-bottom: none; }
    .duas-colunas { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    @media (max-width: 700px) { .duas-colunas { grid-template-columns: 1fr; } }
    .input-filtro-relatorio { width: 100%; padding: 9px 12px; margin-bottom: 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 13px; }
    footer.relatorio-rodape { text-align: center; color: #999; font-size: 12px; margin-top: 24px; }
    @media print { body { background: #fff; padding: 0; } section.bloco { border: none; box-shadow: none; break-inside: avoid; } }
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
        <header class="relatorio-cabecalho">
            <h1>${escaparHtml(titulo)}</h1>
            <p>COP Analytics · Gerado em ${formatarDataHora(new Date())} por ${escaparHtml(APP.usuario?.email ?? "-")}</p>
            <p>${totalOSConsiderado} ordem(ns) de serviço consideradas</p>
            ${filtroTexto ? `<div class="relatorio-filtro">⚠ Filtro Global ativo — este relatório reflete só o recorte filtrado: ${escaparHtml(filtroTexto)}</div>` : ""}
        </header>
    `;
}

/** Tabela genérica de duas colunas a partir de uma lista {rotulo, valor}. */
function tabelaRotuloValor(titulo, itens, rotuloColuna = "Item", valorColuna = "Quantidade", formatarValor = v => v) {
    if (!itens || itens.length === 0) return `<h2>${escaparHtml(titulo)}</h2><p>Sem dados.</p>`;
    return `
        <h2>${escaparHtml(titulo)}</h2>
        <table>
            <thead><tr><th>${escaparHtml(rotuloColuna)}</th><th>${escaparHtml(valorColuna)}</th></tr></thead>
            <tbody>
                ${itens.map(i => `<tr><td>${escaparHtml(String(i.rotulo))}</td><td>${formatarValor(i.valor)}</td></tr>`).join("")}
            </tbody>
        </table>
    `;
}

/** Uma linha por técnico: Nome, Finalizadas, Reagendadas, TMS, Deslocamento abandonado, Reabertura, Recorrência gerada. */
function tabelaTecnicosPorLinha(ordens) {
    const fichas = IndicatorEngine.calcularFichasTecnicos(ordens);
    if (fichas.length === 0) return "<h2>Técnicos</h2><p>Sem dados.</p>";

    return `
        <h2>Técnicos</h2>
        <table>
            <thead>
                <tr>
                    <th>#</th><th>Nome</th><th>Finalizadas</th><th>Reagendadas</th><th>TMS</th>
                    <th>Deslocamento abandonado</th><th>Reabertura</th><th>Recorrência gerada</th>
                </tr>
            </thead>
            <tbody>
                ${fichas.map(f => `
                    <tr>
                        <td>${f.ranking}</td>
                        <td>${escaparHtml(f.nome)}</td>
                        <td>${f.totalFinalizadas}</td>
                        <td>${f.reagendamentosAcertos + f.reagendamentosErros} (${f.reagendamentosAcertos} ok / ${f.reagendamentosErros} errado)</td>
                        <td>${formatarDuracaoHoras(f.tmsHoras)}</td>
                        <td>${f.deslocamentosAbandonados}</td>
                        <td>${f.reaberturas} (${f.indiceReaberturaPercentual.toFixed(1)}%)</td>
                        <td>${f.recorrenciasGeradas} (${f.percentualRecorrenciaSobreFinalizadas.toFixed(1)}%)</td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
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

/** Uma linha por OS: assunto, técnico e diagnóstico do fechamento, datas, status. */
function tabelaDetalheOS(ordens) {
    const linhas = coletarLinhasDetalheOS(ordens).map(d => `
            <tr>
                <td>${escaparHtml(String(d.id))}</td>
                <td>${escaparHtml(d.cliente ?? "-")}</td>
                <td>${escaparHtml(d.login ?? "-")}</td>
                <td>${escaparHtml(d.cidade ?? "-")}</td>
                <td>${escaparHtml(d.bairro ?? "-")}</td>
                <td>${escaparHtml(d.assunto ?? "-")}</td>
                <td>${escaparHtml(d.tecnico ?? "-")}</td>
                <td>${escaparHtml(d.diagnostico ?? "-")}</td>
                <td>${formatarDataHora(d.dataAbertura)}</td>
                <td>${formatarDataHora(d.dataFechamento)}</td>
                <td>${escaparHtml(d.status ?? "-")}</td>
            </tr>
        `).join("");

    return `
        <h2>Detalhamento por OS (${ordens.size})</h2>
        <input type="text" id="filtroDetalheOS" class="input-filtro-relatorio" placeholder="Filtrar por qualquer coluna (cliente, assunto, técnico, diagnóstico...)">
        <div style="overflow-x:auto;">
            <table id="tabelaDetalheOS">
                <thead>
                    <tr>
                        <th>ID OS</th><th>Cliente</th><th>Login</th><th>Cidade</th><th>Bairro</th>
                        <th>Assunto</th><th>Técnico</th><th>Diagnóstico</th><th>Abertura</th><th>Fechamento</th><th>Status</th>
                    </tr>
                </thead>
                <tbody>${linhas}</tbody>
            </table>
        </div>
        <script>
        (function() {
            var input = document.getElementById("filtroDetalheOS");
            var tbody = document.querySelector("#tabelaDetalheOS tbody");
            if (!input || !tbody) return;
            var linhas = Array.prototype.slice.call(tbody.rows);
            input.addEventListener("input", function() {
                var termo = input.value.toLowerCase();
                linhas.forEach(function(tr) {
                    tr.style.display = tr.textContent.toLowerCase().indexOf(termo) === -1 ? "none" : "";
                });
            });
        })();
        <\/script>
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

    const horas = v => formatarDuracaoHoras(v);

    const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Relatório Geral — COP Analytics</title>
<style>${ESTILO_RELATORIO}</style>
</head>
<body>
<div class="relatorio">
    ${cabecalhoRelatorioHtml("Relatório Geral", painel.totalOS)}

    <section class="bloco">
        <h2>Visão geral</h2>
        <div class="kpi-grid">
            <div class="kpi"><span>Total de OS</span><strong>${painel.totalOS}</strong></div>
            <div class="kpi"><span>Técnicos ativos</span><strong>${painel.totalTecnicos}</strong></div>
            <div class="kpi"><span>OS finalizadas</span><strong>${painel.totalFinalizadas}</strong></div>
            <div class="kpi"><span>TMS</span><strong>${horas(painel.tmsHoras)}</strong></div>
            <div class="kpi"><span>TMR</span><strong>${horas(painel.tmrHoras)}</strong></div>
            <div class="kpi"><span>TME</span><strong>${horas(painel.tmeHoras)}</strong></div>
            <div class="kpi"><span>Reabertura</span><strong>${painel.indiceReabertura.percentual.toFixed(1)}%</strong></div>
            <div class="kpi"><span>Reagendamento</span><strong>${painel.indiceReagendamento.percentual.toFixed(1)}%</strong></div>
            <div class="kpi"><span>Solo / Dupla</span><strong>${painel.soloVsDupla.solo} / ${painel.soloVsDupla.dupla}</strong></div>
            <div class="kpi"><span>Deslocamentos abandonados</span><strong>${painel.deslocamentosAbandonados.total}</strong></div>
            <div class="kpi"><span>Clientes recorrentes ativos</span><strong>${ativos}</strong></div>
            <div class="kpi"><span>Clientes recorrentes cancelados</span><strong>${cancelados}</strong></div>
        </div>
    </section>

    ${tendencia.meses.length > 0 ? `
    <section class="bloco">
        <h2>Visão mensal ${tendencia.ano ?? ""}</h2>
        <table>
            <thead><tr><th>Mês</th><th>Finalizadas</th><th>TMS</th><th>TMA</th><th>TMR</th><th>TME</th><th>Reabertas</th><th>Técnicos ativos</th></tr></thead>
            <tbody>
                ${tendencia.meses.map(m => `
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
    </section>` : ""}

    <section class="bloco">
        <div class="duas-colunas">
            <div>${tabelaRotuloValor("Motivos de reagendamento", painel.motivosReagendamento)}</div>
            <div>${tabelaRotuloValor("OS por assunto", painel.porAssunto)}</div>
        </div>
    </section>

    <section class="bloco">
        ${tabelaRotuloValor("Diagnósticos mais usados", painel.diagnosticosMaisUsados)}
    </section>

    <section class="bloco">
        <h2>Melhores tempos por cidade / setor (mínimo ${IndicatorEngine.MINIMO_OS_RANKING_CIDADE} OS no período)</h2>
        <div class="duas-colunas">
            <div>
                ${tabelaRotuloValor("Top 5 cidades — melhor TMS", tmsCidade, "Cidade", "TMS", horas)}
                ${tabelaRotuloValor("Top 5 cidades — melhor TMA", tmaCidade, "Cidade", "TMA", horas)}
                ${tabelaRotuloValor("Top 5 cidades — melhor TMR", tmrCidade, "Cidade", "TMR", horas)}
            </div>
            <div>
                ${tabelaRotuloValor("Top 5 setores — melhor TMS", tmsSetor, "Setor", "TMS", horas)}
                ${tabelaRotuloValor("Top 5 setores — melhor TMA", tmaSetor, "Setor", "TMA", horas)}
                ${tabelaRotuloValor("Top 5 setores — melhor TMR", tmrSetor, "Setor", "TMR", horas)}
            </div>
        </div>
    </section>

    <section class="bloco">
        <p style="margin-top:0;color:#666;font-size:12px;">
            TMS aqui é segmentado (só o tempo em que o técnico esteve de fato atuando). TMR não entra por
            técnico — mede a empresa como um todo em agendar, não a atuação de um técnico específico
            (ver TMR geral e por cidade/setor acima).
        </p>
        ${tabelaTecnicosPorLinha(ordens)}
    </section>

    <section class="bloco">
        ${tabelaDetalheOS(ordens)}
    </section>

    <footer class="relatorio-rodape">COP Analytics · Inteligência Operacional</footer>
</div>
</body>
</html>`;

    baixarHtml(`relatorio-geral-${carimboDataHora()}.html`, html);
}

/** Botão "Relatório de técnicos" (seção Técnicos). */
function gerarRelatorioTecnicos() {
    const ordens = FiltroEngine.ordensFiltradas();
    const fichas = IndicatorEngine.calcularFichasTecnicos(ordens);

    const linhas = fichas.map(f => `
        <tr>
            <td>${f.ranking}</td>
            <td>${escaparHtml(f.nome)}</td>
            <td>${f.totalFinalizadas}</td>
            <td>${formatarDuracaoHoras(f.tmsHoras)}</td>
            <td>${formatarDuracaoHoras(f.tmaHoras)}</td>
            <td>${f.reaberturas} (${f.indiceReaberturaPercentual.toFixed(1)}%)</td>
            <td>${f.reagendamentosAcertos + f.reagendamentosErros} (${f.reagendamentosAcertos} ok / ${f.reagendamentosErros} errado)</td>
            <td>${f.recorrenciasGeradas} (${f.percentualRecorrenciaSobreFinalizadas.toFixed(1)}%)</td>
            <td>${f.trabalhosSolo} solo / ${f.trabalhosDupla} dupla</td>
            <td>${f.deslocamentosAbandonados}</td>
        </tr>
    `).join("");

    const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Relatório de Técnicos — COP Analytics</title>
<style>${ESTILO_RELATORIO}</style>
</head>
<body>
<div class="relatorio">
    ${cabecalhoRelatorioHtml("Relatório de Técnicos", ordens.size)}

    <section class="bloco">
        <p style="margin-top:0;color:#666;font-size:12px;">
            TMS e TMA aqui são segmentados — só o tempo em que o técnico esteve de fato atuando (deslocamento/execução até o
            fechamento/reagendamento daquele ciclo), não o tempo corrido total da OS. TMR (tempo até o 1º agendamento) mede a
            velocidade da empresa como um todo em agendar, não a atuação de um técnico específico — por isso não entra na ficha
            individual (ver Relatório Geral).
        </p>
        <table>
            <thead>
                <tr>
                    <th>#</th><th>Técnico</th><th>Finalizadas</th><th>TMS</th><th>TMA</th>
                    <th>Reaberturas</th><th>Reagendamentos</th><th>Recorrências geradas</th><th>Solo / Dupla</th><th>Deslocamentos abandonados</th>
                </tr>
            </thead>
            <tbody>${linhas}</tbody>
        </table>
    </section>

    <footer class="relatorio-rodape">COP Analytics · Inteligência Operacional</footer>
</div>
</body>
</html>`;

    baixarHtml(`relatorio-tecnicos-${carimboDataHora()}.html`, html);
}
