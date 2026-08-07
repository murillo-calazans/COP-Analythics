/**
 * ==========================================================
 * UI do Dashboard
 * ==========================================================
 * Monta stat tiles + gráficos a partir do painel calculado
 * pelo IndicatorEngine. Não calcula nada aqui — só desenha o
 * que o Engine devolve.
 */

function renderizarDashboard() {
    const container = document.getElementById("dashboardConteudo");
    if (!container) return;

    if (!APP.status.baseCarregada || APP.dados.ordens.size === 0) {
        container.innerHTML = `
            <div class="placeholder-card">
                <h2>📊 Nenhum dado importado ainda</h2>
                <p>Clique em "Importar dados", no topo da página, pra carregar a Base e as Ordens de Serviço.</p>
            </div>
        `;
        return;
    }

    const ordensFiltradas = FiltroEngine.ordensFiltradas();

    if (ordensFiltradas.size === 0) {
        container.innerHTML = `
            <div class="placeholder-card">
                <h2>🔍 Nenhuma OS bate com o Filtro Global atual</h2>
                <p>Ajuste ou limpe o filtro (botão 🔍 no topo da página) pra ver os dados.</p>
            </div>
        `;
        return;
    }

    const painel = IndicatorEngine.calcularPainelDashboard(ordensFiltradas);
    const totalRecorrentes = APP.indicadores.recorrencia?.size ?? 0;

    container.innerHTML = `
        <div class="kpi-row">
            <div class="stat-tile">
                <div class="stat-label">Total de OS</div>
                <div class="stat-valor">${painel.totalOS.toLocaleString("pt-BR")}</div>
            </div>
            <div class="stat-tile">
                <div class="stat-label">OS finalizadas</div>
                <div class="stat-valor">${painel.totalFinalizadas.toLocaleString("pt-BR")}</div>
            </div>
            <div class="stat-tile">
                <div class="stat-label">TMS (tempo médio de solução)</div>
                <div class="stat-valor">${formatarDuracaoHoras(painel.tmsHoras)}</div>
            </div>
            <div class="stat-tile">
                <div class="stat-label">TMR (tempo médio de resposta)</div>
                <div class="stat-valor">${formatarDuracaoHoras(painel.tmrHoras)}</div>
            </div>
            <div class="stat-tile">
                <div class="stat-label">TME (tempo médio de espera)</div>
                <div class="stat-valor">${formatarDuracaoHoras(painel.tmeHoras)}</div>
            </div>
            <div class="stat-tile">
                <div class="stat-label">Índice de reabertura</div>
                <div class="stat-valor">${painel.indiceReabertura.percentual.toFixed(1)}%</div>
            </div>
            <div class="stat-tile">
                <div class="stat-label">Índice de reagendamento</div>
                <div class="stat-valor">${painel.indiceReagendamento.percentual.toFixed(1)}%</div>
            </div>
            <div class="stat-tile">
                <div class="stat-label">Deslocamentos abandonados</div>
                <div class="stat-valor">${painel.deslocamentosAbandonados.total.toLocaleString("pt-BR")}</div>
            </div>
            <div class="stat-tile">
                <div class="stat-label">Técnicos ativos</div>
                <div class="stat-valor">${painel.totalTecnicos.toLocaleString("pt-BR")}</div>
            </div>
            <div class="stat-tile">
                <div class="stat-label">Assuntos distintos</div>
                <div class="stat-valor">${painel.porAssunto.length.toLocaleString("pt-BR")}</div>
            </div>
            <div class="stat-tile">
                <div class="stat-label">Clientes recorrentes</div>
                <div class="stat-valor">${totalRecorrentes.toLocaleString("pt-BR")}</div>
            </div>
        </div>

        <div class="graficos-grid">

            <div class="grafico-card">
                <div class="grafico-cabecalho">
                    <div>
                        <div class="grafico-titulo">OS por Assunto</div>
                        <div class="grafico-subtitulo">Volume de atendimento por tipo de chamado</div>
                    </div>
                </div>
                <div id="graficoAssuntos"></div>
            </div>

            <div class="grafico-card">
                <div class="grafico-cabecalho">
                    <div>
                        <div class="grafico-titulo">Diagnósticos mais utilizados</div>
                        <div class="grafico-subtitulo">Contagem entre todas as movimentações</div>
                    </div>
                </div>
                <div id="graficoDiagnosticos"></div>
            </div>

            <div class="grafico-card">
                <div class="grafico-cabecalho">
                    <div>
                        <div class="grafico-titulo">Top 5 técnicos por volume</div>
                        <div class="grafico-subtitulo">OS finalizadas (evento Fechamento) — ranking de qualidade vem no Auditor IA</div>
                    </div>
                </div>
                <div id="graficoRankingTecnicos"></div>
            </div>

            <div class="grafico-card">
                <div class="grafico-cabecalho">
                    <div>
                        <div class="grafico-titulo">Recorrência por técnico</div>
                        <div class="grafico-subtitulo">Técnico do fechamento anterior quando o mesmo cliente reabre depois</div>
                    </div>
                </div>
                <div id="graficoRecorrenciaTecnicos"></div>
            </div>

        </div>
    `;

    const aoClicarTecnico = item => abrirModalTecnico(item.rotulo);

    renderizarGraficoBarras("graficoAssuntos", painel.porAssunto, { serie: "serie-1", limite: 5, titulo: "OS por Assunto" });
    renderizarGraficoBarras("graficoDiagnosticos", painel.diagnosticosMaisUsados, { serie: "serie-1", limite: 5, titulo: "Diagnósticos mais utilizados" });
    renderizarGraficoBarras("graficoRankingTecnicos", painel.rankingTecnicos, { serie: "serie-1", limite: 5, aoClicar: aoClicarTecnico, titulo: "Técnicos por volume" });
    renderizarGraficoBarras("graficoRecorrenciaTecnicos", painel.recorrenciaPorTecnico, { serie: "serie-2", limite: 5, aoClicar: aoClicarTecnico, titulo: "Recorrência por técnico" });
}
