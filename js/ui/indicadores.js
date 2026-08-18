/**
 * ==========================================================
 * UI da Seção Indicadores
 * ==========================================================
 * Tendências ao longo do tempo + comparativos que complementam
 * o Dashboard (que só mostra fotos estáticas, sem histórico).
 * Não calcula nada aqui — tudo vem pronto do IndicatorEngine.
 *
 * Duas partes:
 * - "Indicadores gerais": volume, reabertura, motivos de
 *   reagendamento, assuntos/diagnósticos mais usados, solo x dupla,
 *   abandono/reagendamento por técnico — tudo que não é um tempo
 *   médio (TMS/TMA/TMR/TME).
 * - "Indicadores de Tempo": uma coluna por métrica (TMS/TMA/TMR/TME),
 *   cada uma com a mesma bateria de quebras (mês, cidade, setor,
 *   técnico, assunto, diagnóstico) — ver METRICAS_TEMPO/
 *   FUNCOES_POR_DIMENSAO abaixo. TMR não tem quebra por técnico de
 *   propósito: mede a velocidade da empresa em agendar, não o
 *   trabalho do técnico em campo (por isso também nunca entrou na
 *   ficha individual dele — ver IndicatorEngine.calcularTMR).
 */

const ROTULOS_DIMENSAO_TEMPO = {
    mes: "por Mês",
    cidade: "por Cidade",
    setor: "por Setor",
    tecnico: "por Técnico",
    assunto: "por Assunto",
    diagnostico: "por Diagnóstico"
};

const SUBTITULOS_DIMENSAO_TEMPO = {
    mes: "Tendência mês a mês",
    cidade: `Top 5 — cidades com pelo menos ${IndicatorEngine.MINIMO_OS_RANKING_CIDADE} OS`,
    setor: `Top 5 — setores com pelo menos ${IndicatorEngine.MINIMO_OS_RANKING_CIDADE} OS`,
    tecnico: "Todos os técnicos com pelo menos 1 OS válida",
    assunto: `Top 5 — assuntos com pelo menos ${IndicatorEngine.MINIMO_OS_RANKING_CIDADE} OS`,
    diagnostico: `Top 5 — diagnósticos do fechamento com pelo menos ${IndicatorEngine.MINIMO_OS_RANKING_CIDADE} OS`
};

const METRICAS_TEMPO = [
    { chave: "tms", nome: "TMS", serie: "serie-1", descricao: "Deslocamento até finalização", temTecnico: true },
    { chave: "tma", nome: "TMA", serie: "serie-1", descricao: '"Em Execução" até finalização', temTecnico: true },
    { chave: "tmr", nome: "TMR", serie: "serie-2", descricao: "Abertura até 1º agendamento", temTecnico: false },
    { chave: "tme", nome: "TME", serie: "serie-2", descricao: "Abertura até fechamento, sem OS reaberta", temTecnico: true }
];

const FUNCOES_TEMPO_POR_DIMENSAO = {
    tms: {
        cidade: ordens => IndicatorEngine.calcularTmsPorCidade(ordens),
        setor: ordens => IndicatorEngine.calcularTmsPorSetor(ordens),
        tecnico: ordens => IndicatorEngine.calcularTmsPorTecnico(ordens),
        assunto: ordens => IndicatorEngine.calcularTmsPorAssunto(ordens),
        diagnostico: ordens => IndicatorEngine.calcularTmsPorDiagnostico(ordens)
    },
    tma: {
        cidade: ordens => IndicatorEngine.calcularTmaPorCidade(ordens),
        setor: ordens => IndicatorEngine.calcularTmaPorSetor(ordens),
        tecnico: ordens => IndicatorEngine.calcularTmaPorTecnico(ordens),
        assunto: ordens => IndicatorEngine.calcularTmaPorAssunto(ordens),
        diagnostico: ordens => IndicatorEngine.calcularTmaPorDiagnostico(ordens)
    },
    tmr: {
        cidade: ordens => IndicatorEngine.calcularTmrPorCidade(ordens),
        setor: ordens => IndicatorEngine.calcularTmrPorSetor(ordens),
        assunto: ordens => IndicatorEngine.calcularTmrPorAssunto(ordens),
        diagnostico: ordens => IndicatorEngine.calcularTmrPorDiagnostico(ordens)
    },
    tme: {
        cidade: ordens => IndicatorEngine.calcularTmePorCidade(ordens),
        setor: ordens => IndicatorEngine.calcularTmePorSetor(ordens),
        tecnico: ordens => IndicatorEngine.calcularTmePorTecnico(ordens),
        assunto: ordens => IndicatorEngine.calcularTmePorAssunto(ordens),
        diagnostico: ordens => IndicatorEngine.calcularTmePorDiagnostico(ordens)
    }
};

/** HTML de uma coluna (TMS/TMA/TMR/TME): título + um grafico-card por dimensão (mês + o que a métrica tiver). */
function construirColunaTempo(metrica) {
    const dimensoes = ["mes", "cidade", "setor", ...(metrica.temTecnico ? ["tecnico"] : []), "assunto", "diagnostico"];

    const cards = dimensoes.map(dim => `
        <div class="grafico-card">
            <div class="grafico-cabecalho">
                <div>
                    <div class="grafico-titulo">${metrica.nome} ${ROTULOS_DIMENSAO_TEMPO[dim]}</div>
                    <div class="grafico-subtitulo">${SUBTITULOS_DIMENSAO_TEMPO[dim]}</div>
                </div>
            </div>
            <div id="tempo-${metrica.chave}-${dim}"></div>
        </div>
    `).join("");

    return `
        <div class="indicadores-tempo-coluna">
            <div class="indicadores-tempo-coluna-titulo">
                ${metrica.nome}
                <span class="indicadores-tempo-coluna-desc">${metrica.descricao}</span>
            </div>
            ${cards}
        </div>
    `;
}

/** Desenha os gráficos de uma coluna depois do HTML já estar no DOM (mês vem de "meses", o resto do IndicatorEngine). */
function renderizarColunaTempo(metrica, ordensFiltradas, meses) {
    const dadosMes = meses
        .filter(m => m[`${metrica.chave}Horas`] !== null)
        .map(m => ({ rotulo: m.rotulo, valor: Math.round(m[`${metrica.chave}Horas`] * 10) / 10 }));

    renderizarGraficoBarras(`tempo-${metrica.chave}-mes`, dadosMes, {
        serie: metrica.serie,
        limite: meses.length,
        formatoValor: formatarDuracaoHoras,
        titulo: `${metrica.nome} por mês`
    });

    for (const [dimensao, obterDados] of Object.entries(FUNCOES_TEMPO_POR_DIMENSAO[metrica.chave])) {
        const dados = obterDados(ordensFiltradas);
        renderizarGraficoBarras(`tempo-${metrica.chave}-${dimensao}`, dados, {
            serie: metrica.serie,
            limite: dimensao === "tecnico" ? 5 : dados.length,
            formatoValor: formatarDuracaoHoras,
            titulo: `${metrica.nome} ${ROTULOS_DIMENSAO_TEMPO[dimensao]}`
        });
    }
}

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
    const meses = tendenciaMensal.meses;

    const periodoMensal = tendenciaMensal.ano
        ? `Jan–${meses[meses.length - 1].rotulo}/${tendenciaMensal.ano}`
        : "";

    container.innerHTML = `
        <div class="indicadores-secao-titulo">Indicadores gerais ${periodoMensal ? `(${periodoMensal})` : ""}</div>

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

            <div class="grafico-card">
                <div class="grafico-cabecalho">
                    <div>
                        <div class="grafico-titulo">Motivos mais frequentes de reagendamento</div>
                        <div class="grafico-subtitulo">Registrado na Resposta Padrão da movimentação de Reagendar</div>
                    </div>
                </div>
                <div id="graficoMotivosReagendamento"></div>
            </div>

            <div class="grafico-card">
                <div class="grafico-cabecalho">
                    <div>
                        <div class="grafico-titulo">Assuntos com maior volume</div>
                        <div class="grafico-subtitulo">Top 5 (o Dashboard também mostra os 5 primeiros)</div>
                    </div>
                </div>
                <div id="graficoAssuntosCompleto"></div>
            </div>

            <div class="grafico-card">
                <div class="grafico-cabecalho">
                    <div>
                        <div class="grafico-titulo">Diagnósticos mais utilizados</div>
                        <div class="grafico-subtitulo">Top 5</div>
                    </div>
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
                        <div class="grafico-subtitulo">Deslocamento/execução sem aviso, substituído por um Agendamento de outro operador</div>
                    </div>
                </div>
                <div id="graficoAbandonosTecnico"></div>
            </div>

            <div class="grafico-card">
                <div class="grafico-cabecalho">
                    <div>
                        <div class="grafico-titulo">Reagendamentos por técnico</div>
                        <div class="grafico-subtitulo">Quantidade de vezes que cada técnico executou a movimentação Reagendar</div>
                    </div>
                </div>
                <div id="graficoReagendamentosTecnico"></div>
            </div>

        </div>

        <div class="indicadores-secao-titulo">Indicadores de Tempo</div>

        <div class="indicadores-tempo-colunas">
            ${METRICAS_TEMPO.map(construirColunaTempo).join("")}
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

    renderizarGraficoBarras("mensalVolume",
        meses.map(m => ({ rotulo: m.rotulo, valor: m.totalFinalizadas })),
        { serie: "serie-1", limite: meses.length, formatoValor: v => v.toLocaleString("pt-BR") }
    );

    renderizarGraficoBarras("mensalReaberturas",
        meses.map(m => ({ rotulo: m.rotulo, valor: m.reabertas })),
        { serie: "serie-2", limite: meses.length, formatoValor: v => v.toLocaleString("pt-BR") }
    );

    renderizarGraficoBarras("mensalTecnicosAtivos",
        meses.map(m => ({ rotulo: m.rotulo, valor: m.tecnicosAtivos })),
        { serie: "serie-1", limite: meses.length, formatoValor: v => v.toLocaleString("pt-BR") }
    );

    renderizarGraficoBarras("graficoMotivosReagendamento", painel.motivosReagendamento, {
        serie: "serie-2",
        limite: 5,
        titulo: "Motivos mais frequentes de reagendamento"
    });

    renderizarGraficoBarras("graficoAssuntosCompleto", painel.porAssunto, {
        serie: "serie-1",
        limite: 5,
        titulo: "Assuntos com maior volume"
    });

    renderizarGraficoBarras("graficoDiagnosticosCompleto", painel.diagnosticosMaisUsados, {
        serie: "serie-1",
        limite: 5,
        titulo: "Diagnósticos mais utilizados"
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
        limite: 5,
        titulo: "Deslocamentos abandonados por técnico"
    });

    renderizarGraficoBarras("graficoReagendamentosTecnico", IndicatorEngine.calcularReagendamentosPorTecnico(ordensFiltradas), {
        serie: "serie-2",
        limite: 5,
        titulo: "Reagendamentos por técnico"
    });

    for (const metrica of METRICAS_TEMPO) {
        renderizarColunaTempo(metrica, ordensFiltradas, meses);
    }

    const botaoConfigurarFunil = document.getElementById("btnConfigurarFunilAssuntos");
    if (botaoConfigurarFunil) botaoConfigurarFunil.addEventListener("click", abrirModalFunilAssuntos);

    renderizarFunilAssuntosResultado();
}
