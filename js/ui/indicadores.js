/**
 * ==========================================================
 * UI da Seção Indicadores
 * ==========================================================
 * Tendências ao longo do tempo + comparativos que complementam
 * o Dashboard (que só mostra fotos estáticas, sem histórico).
 * Não calcula nada aqui — tudo vem pronto do IndicatorEngine.
 */

function renderizarSecaoIndicadores() {
    const container = document.getElementById("indicadoresConteudo");
    if (!container) return;

    if (!APP.status.baseCarregada || APP.dados.ordens.size === 0) {
        container.innerHTML = '<p class="alerta-vazio">Importe dados pra ver os indicadores.</p>';
        return;
    }

    const ordensFiltradas = FiltroEngine.ordensFiltradas();

    if (ordensFiltradas.size === 0) {
        container.innerHTML = '<p class="alerta-vazio">Nenhuma OS bate com o Filtro Global atual.</p>';
        return;
    }

    const tendencias = IndicatorEngine.calcularTendencias(ordensFiltradas);
    const painel = IndicatorEngine.calcularPainelDashboard(ordensFiltradas);
    const tmsPorTecnico = IndicatorEngine.calcularTmsPorTecnico(ordensFiltradas);
    const tmaPorTecnico = IndicatorEngine.calcularTmaPorTecnico(ordensFiltradas);

    const rotuloGranularidade = { dia: "por dia", semana: "por semana", mes: "por mês" }[tendencias.granularidade];

    container.innerHTML = `
        <div class="indicadores-secao-titulo">Tendência ${rotuloGranularidade}</div>

        <div class="graficos-grid">

            <div class="grafico-card">
                <div class="grafico-cabecalho">
                    <div>
                        <div class="grafico-titulo">OS finalizadas</div>
                        <div class="grafico-subtitulo">Volume de fechamentos ao longo do tempo</div>
                    </div>
                </div>
                <div id="tendenciaVolume"></div>
            </div>

            <div class="grafico-card">
                <div class="grafico-cabecalho">
                    <div>
                        <div class="grafico-titulo">TMS</div>
                        <div class="grafico-subtitulo">Tempo médio de solução ao longo do tempo (visão da OS, tempo corrido)</div>
                    </div>
                </div>
                <div id="tendenciaTms"></div>
            </div>

            <div class="grafico-card">
                <div class="grafico-cabecalho">
                    <div>
                        <div class="grafico-titulo">Índice de reabertura</div>
                        <div class="grafico-subtitulo">% de OS finalizadas que voltaram a abrir</div>
                    </div>
                </div>
                <div id="tendenciaReabertura"></div>
            </div>

            <div class="grafico-card">
                <div class="grafico-cabecalho">
                    <div>
                        <div class="grafico-titulo">Índice de reagendamento</div>
                        <div class="grafico-subtitulo">% de OS encerradas que passaram por Reagendamento</div>
                    </div>
                </div>
                <div id="tendenciaReagendamento"></div>
            </div>

        </div>

        <div class="indicadores-secao-titulo">Comparativos</div>

        <div class="graficos-grid">

            <div class="grafico-card">
                <div class="grafico-cabecalho">
                    <div>
                        <div class="grafico-titulo">TMS por técnico</div>
                        <div class="grafico-subtitulo">Deslocamento até finalização, sem contar espera de reagendamento — do mais rápido pro mais lento</div>
                    </div>
                    <button type="button" class="grafico-toggle-tabela" onclick="alternarVisualizacaoGrafico('graficoTmsTecnico')">Ver como tabela</button>
                </div>
                <div id="graficoTmsTecnico"></div>
            </div>

            <div class="grafico-card">
                <div class="grafico-cabecalho">
                    <div>
                        <div class="grafico-titulo">TMA por técnico</div>
                        <div class="grafico-subtitulo">Só "Em Execução" até finalização, sem contar deslocamento nem espera de reagendamento</div>
                    </div>
                    <button type="button" class="grafico-toggle-tabela" onclick="alternarVisualizacaoGrafico('graficoTmaTecnico')">Ver como tabela</button>
                </div>
                <div id="graficoTmaTecnico"></div>
            </div>

            <div class="grafico-card">
                <div class="grafico-cabecalho">
                    <div>
                        <div class="grafico-titulo">Motivos mais frequentes de reagendamento</div>
                        <div class="grafico-subtitulo">Registrado na Resposta Padrão da movimentação de Reagendar</div>
                    </div>
                    <button type="button" class="grafico-toggle-tabela" onclick="alternarVisualizacaoGrafico('graficoMotivosReagendamento')">Ver como tabela</button>
                </div>
                <div id="graficoMotivosReagendamento"></div>
            </div>

            <div class="grafico-card">
                <div class="grafico-cabecalho">
                    <div>
                        <div class="grafico-titulo">Assuntos com maior volume</div>
                        <div class="grafico-subtitulo">Lista completa (o Dashboard mostra só os 8 primeiros)</div>
                    </div>
                    <button type="button" class="grafico-toggle-tabela" onclick="alternarVisualizacaoGrafico('graficoAssuntosCompleto')">Ver como tabela</button>
                </div>
                <div id="graficoAssuntosCompleto"></div>
            </div>

            <div class="grafico-card">
                <div class="grafico-cabecalho">
                    <div>
                        <div class="grafico-titulo">Diagnósticos mais utilizados</div>
                        <div class="grafico-subtitulo">Lista completa</div>
                    </div>
                    <button type="button" class="grafico-toggle-tabela" onclick="alternarVisualizacaoGrafico('graficoDiagnosticosCompleto')">Ver como tabela</button>
                </div>
                <div id="graficoDiagnosticosCompleto"></div>
            </div>

            <div class="grafico-card">
                <div class="grafico-cabecalho">
                    <div>
                        <div class="grafico-titulo">Trabalho sozinho x em dupla</div>
                        <div class="grafico-subtitulo">Coluna "Equipe" comparada ao operador no fechamento</div>
                    </div>
                </div>
                <div id="graficoSoloVsDupla"></div>
            </div>

            <div class="grafico-card">
                <div class="grafico-cabecalho">
                    <div>
                        <div class="grafico-titulo">Deslocamentos abandonados por técnico</div>
                        <div class="grafico-subtitulo">Início de atendimento substituído por um Agendamento de outro operador, sem reagendar nem executar</div>
                    </div>
                    <button type="button" class="grafico-toggle-tabela" onclick="alternarVisualizacaoGrafico('graficoAbandonosTecnico')">Ver como tabela</button>
                </div>
                <div id="graficoAbandonosTecnico"></div>
            </div>

        </div>

        <div class="indicadores-secao-titulo">Funil de Assuntos</div>

        <div class="grafico-card">
            <div class="grafico-cabecalho">
                <div>
                    <div class="grafico-titulo">Clientes com problema após instalação/transferência</div>
                    <div class="grafico-subtitulo" id="funilAssuntosSubtitulo">Configure os assuntos de origem e destino</div>
                </div>
                <button type="button" class="grafico-toggle-tabela" id="btnConfigurarFunilAssuntos">Configurar</button>
            </div>
            <div id="funilAssuntosConteudo"></div>
        </div>
    `;

    renderizarGraficoLinha(
        "tendenciaVolume",
        tendencias.pontos.map(p => ({ rotulo: p.rotulo, valor: p.totalFinalizadas })),
        { cor: "var(--grafico-serie-1)", formatoValor: v => v.toLocaleString("pt-BR") }
    );

    renderizarGraficoLinha(
        "tendenciaTms",
        tendencias.pontos.map(p => ({
            rotulo: p.rotulo,
            valor: p.tmsHoras !== null ? Math.round(p.tmsHoras * 10) / 10 : null
        })),
        { cor: "var(--grafico-serie-1)", formatoValor: formatarDuracaoHoras }
    );

    renderizarGraficoLinha(
        "tendenciaReabertura",
        tendencias.pontos.map(p => ({ rotulo: p.rotulo, valor: Math.round(p.indiceReaberturaPercentual * 10) / 10 })),
        { cor: "var(--grafico-serie-2)", formatoValor: v => `${v}%` }
    );

    renderizarGraficoLinha(
        "tendenciaReagendamento",
        tendencias.pontos.map(p => ({ rotulo: p.rotulo, valor: Math.round(p.indiceReagendamentoPercentual * 10) / 10 })),
        { cor: "var(--grafico-serie-2)", formatoValor: v => `${v}%` }
    );

    renderizarGraficoBarras("graficoTmsTecnico", tmsPorTecnico, {
        serie: "serie-1",
        limite: tmsPorTecnico.length,
        formatoValor: formatarDuracaoHoras
    });

    renderizarGraficoBarras("graficoTmaTecnico", tmaPorTecnico, {
        serie: "serie-1",
        limite: tmaPorTecnico.length,
        formatoValor: formatarDuracaoHoras
    });

    renderizarGraficoBarras("graficoMotivosReagendamento", painel.motivosReagendamento, {
        serie: "serie-2",
        limite: painel.motivosReagendamento.length
    });

    renderizarGraficoBarras("graficoAssuntosCompleto", painel.porAssunto, {
        serie: "serie-1",
        limite: painel.porAssunto.length
    });

    renderizarGraficoBarras("graficoDiagnosticosCompleto", painel.diagnosticosMaisUsados, {
        serie: "serie-1",
        limite: painel.diagnosticosMaisUsados.length
    });

    renderizarGraficoBarras("graficoSoloVsDupla", [
        { rotulo: "Sozinho", valor: painel.soloVsDupla.solo },
        { rotulo: "Em dupla", valor: painel.soloVsDupla.dupla }
    ], {
        serie: "serie-1",
        limite: 2
    });

    renderizarGraficoBarras("graficoAbandonosTecnico", painel.deslocamentosAbandonados.porTecnico, {
        serie: "serie-2",
        limite: painel.deslocamentosAbandonados.porTecnico.length
    });

    const botaoConfigurarFunil = document.getElementById("btnConfigurarFunilAssuntos");
    if (botaoConfigurarFunil) botaoConfigurarFunil.addEventListener("click", abrirModalFunilAssuntos);

    renderizarFunilAssuntosResultado();
}
