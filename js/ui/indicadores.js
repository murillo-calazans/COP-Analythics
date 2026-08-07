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

    const tendenciaMensal = IndicatorEngine.calcularTendenciaMensal(ordensFiltradas);
    const painel = IndicatorEngine.calcularPainelDashboard(ordensFiltradas);
    const tmsPorTecnico = IndicatorEngine.calcularTmsPorTecnico(ordensFiltradas);
    const tmaPorTecnico = IndicatorEngine.calcularTmaPorTecnico(ordensFiltradas);

    const periodoMensal = tendenciaMensal.ano
        ? `Jan–${tendenciaMensal.meses[tendenciaMensal.meses.length - 1].rotulo}/${tendenciaMensal.ano}`
        : "";

    container.innerHTML = `
        <div class="indicadores-secao-titulo">Visão mensal ${periodoMensal ? `(${periodoMensal})` : ""}</div>

        <div class="graficos-grid">

            <div class="grafico-card">
                <div class="grafico-cabecalho">
                    <div>
                        <div class="grafico-titulo">OS finalizadas</div>
                        <div class="grafico-subtitulo">Volume de fechamentos por mês</div>
                    </div>
                </div>
                <div id="mensalVolume"></div>
            </div>

            <div class="grafico-card">
                <div class="grafico-cabecalho">
                    <div>
                        <div class="grafico-titulo">TMS por mês</div>
                        <div class="grafico-subtitulo">Tempo médio de solução (visão da OS, tempo corrido)</div>
                    </div>
                </div>
                <div id="mensalTms"></div>
            </div>

            <div class="grafico-card">
                <div class="grafico-cabecalho">
                    <div>
                        <div class="grafico-titulo">TMA por mês</div>
                        <div class="grafico-subtitulo">"Em Execução" até finalização, sem espera de reagendamento</div>
                    </div>
                </div>
                <div id="mensalTma"></div>
            </div>

            <div class="grafico-card">
                <div class="grafico-cabecalho">
                    <div>
                        <div class="grafico-titulo">TMR por mês</div>
                        <div class="grafico-subtitulo">Tempo médio de resposta (abertura até 1º agendamento)</div>
                    </div>
                </div>
                <div id="mensalTmr"></div>
            </div>

            <div class="grafico-card">
                <div class="grafico-cabecalho">
                    <div>
                        <div class="grafico-titulo">TME por mês</div>
                        <div class="grafico-subtitulo">Tempo médio de espera do cliente (abertura até fechamento)</div>
                    </div>
                </div>
                <div id="mensalTme"></div>
            </div>

            <div class="grafico-card">
                <div class="grafico-cabecalho">
                    <div>
                        <div class="grafico-titulo">Reaberturas por mês</div>
                        <div class="grafico-subtitulo">Quantidade de OS finalizadas que voltaram a abrir</div>
                    </div>
                </div>
                <div id="mensalReaberturas"></div>
            </div>

            <div class="grafico-card">
                <div class="grafico-cabecalho">
                    <div>
                        <div class="grafico-titulo">Técnicos ativos por mês</div>
                        <div class="grafico-subtitulo">Técnicos distintos que finalizaram ao menos 1 OS no mês</div>
                    </div>
                </div>
                <div id="mensalTecnicosAtivos"></div>
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

    const meses = tendenciaMensal.meses;

    renderizarGraficoBarras("mensalVolume",
        meses.map(m => ({ rotulo: m.rotulo, valor: m.totalFinalizadas })),
        { serie: "serie-1", limite: meses.length, formatoValor: v => v.toLocaleString("pt-BR") }
    );

    renderizarGraficoBarras("mensalTms",
        meses.filter(m => m.tmsHoras !== null).map(m => ({ rotulo: m.rotulo, valor: Math.round(m.tmsHoras * 10) / 10 })),
        { serie: "serie-1", limite: meses.length, formatoValor: formatarDuracaoHoras }
    );

    renderizarGraficoBarras("mensalTma",
        meses.filter(m => m.tmaHoras !== null).map(m => ({ rotulo: m.rotulo, valor: Math.round(m.tmaHoras * 10) / 10 })),
        { serie: "serie-1", limite: meses.length, formatoValor: formatarDuracaoHoras }
    );

    renderizarGraficoBarras("mensalTmr",
        meses.filter(m => m.tmrHoras !== null).map(m => ({ rotulo: m.rotulo, valor: Math.round(m.tmrHoras * 10) / 10 })),
        { serie: "serie-2", limite: meses.length, formatoValor: formatarDuracaoHoras }
    );

    renderizarGraficoBarras("mensalTme",
        meses.filter(m => m.tmeHoras !== null).map(m => ({ rotulo: m.rotulo, valor: Math.round(m.tmeHoras * 10) / 10 })),
        { serie: "serie-2", limite: meses.length, formatoValor: formatarDuracaoHoras }
    );

    renderizarGraficoBarras("mensalReaberturas",
        meses.map(m => ({ rotulo: m.rotulo, valor: m.reabertas })),
        { serie: "serie-2", limite: meses.length, formatoValor: v => v.toLocaleString("pt-BR") }
    );

    renderizarGraficoBarras("mensalTecnicosAtivos",
        meses.map(m => ({ rotulo: m.rotulo, valor: m.tecnicosAtivos })),
        { serie: "serie-1", limite: meses.length, formatoValor: v => v.toLocaleString("pt-BR") }
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
