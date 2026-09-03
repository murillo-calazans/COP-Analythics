/**
 * ==========================================================
 * UI da Auditoria Operacional (aba Auditoria)
 * ==========================================================
 * Indicadores + lista de achados calculados pelo
 * AuditoriaOperacionalEngine — nenhuma regra vive aqui, só desenho.
 * Pra adicionar/ajustar uma regra, ver js/config/regrasauditoria.js.
 * Respeita o Filtro Global, igual Dashboard/Técnicos/Indicadores
 * (diferente de Alertas, que é independente dele).
 */

const ROTULOS_TIPO_ACHADO_AUDITORIA = {
    "inconsistencia": "Diagnóstico × Próxima Tarefa incompatível",
    "proxima-tarefa-ausente": "Próxima Tarefa não informada",
    "diagnostico-ausente": "Diagnóstico não informado",
    "duplicidade": "Possível duplicidade (mesmo login/assunto/diagnóstico)"
};

let _achadosAuditoriaOperacionalCache = [];

function renderizarPainelAuditoriaOperacional() {
    const container = document.getElementById("auditoriaOperacionalConteudo");
    if (!container) return;

    if (!APP.status.baseCarregada || APP.dados.ordens.size === 0) {
        container.innerHTML = '<p class="alerta-vazio">Importe dados pra ver a auditoria operacional.</p>';
        return;
    }

    const ordensFiltradas = FiltroEngine.ordensFiltradas();

    if (ordensFiltradas.size === 0) {
        container.innerHTML = '<p class="alerta-vazio">Nenhuma OS bate com o Filtro Global atual.</p>';
        return;
    }

    const resultado = AuditoriaOperacionalEngine.auditar(ordensFiltradas);
    _achadosAuditoriaOperacionalCache = resultado.achados;

    const { resumo } = resultado;

    container.innerHTML = `
        <div class="kpi-row">
            <div class="stat-tile">
                <div class="stat-label">OS auditadas</div>
                <div class="stat-valor">${resumo.totalAuditadas.toLocaleString("pt-BR")}</div>
            </div>
            <div class="stat-tile">
                <div class="stat-label">Sem erro</div>
                <div class="stat-valor">${resumo.semErro.toLocaleString("pt-BR")}</div>
            </div>
            <div class="stat-tile">
                <div class="stat-label">Com erro</div>
                <div class="stat-valor">${resumo.comErro.toLocaleString("pt-BR")}</div>
            </div>
            <div class="stat-tile">
                <div class="stat-label">Possíveis duplicidades</div>
                <div class="stat-valor">${resumo.duplicidades.toLocaleString("pt-BR")}</div>
            </div>
            <div class="stat-tile">
                <div class="stat-label">Sem regra mapeada</div>
                <div class="stat-valor">${resumo.semRegraMapeada.toLocaleString("pt-BR")}</div>
            </div>
            <div class="stat-tile">
                <div class="stat-label">Ainda não finalizadas</div>
                <div class="stat-valor">${resumo.semFechamento.toLocaleString("pt-BR")}</div>
            </div>
        </div>

        ${(resultado.porTipoErro.length > 0 || resultado.semRegraDiagnosticos.length > 0) ? `
            <div class="graficos-grid">
                ${resultado.porTipoErro.length > 0 ? `
                    <div class="grafico-card">
                        <div class="grafico-cabecalho">
                            <div>
                                <div class="grafico-titulo">Tipos de erro encontrados</div>
                                <div class="grafico-subtitulo">Quantidade de achados por tipo</div>
                            </div>
                        </div>
                        <div id="graficoTiposErroAuditoria"></div>
                    </div>
                ` : ""}

                ${resultado.semRegraDiagnosticos.length > 0 ? `
                    <div class="grafico-card">
                        <div class="grafico-cabecalho">
                            <div>
                                <div class="grafico-titulo">Diagnósticos sem regra mapeada</div>
                                <div class="grafico-subtitulo">Ainda não têm Próxima Tarefa esperada definida — ver js/config/regrasauditoria.js</div>
                            </div>
                        </div>
                        <div id="graficoSemRegraAuditoria"></div>
                    </div>
                ` : ""}
            </div>
        ` : ""}

        <div>
            <p class="resultados-contagem">Achados (${_achadosAuditoriaOperacionalCache.length})</p>
            <form class="form-busca" id="formBuscaAchadosAuditoria">
                <input type="text" id="buscaAchadosAuditoria" placeholder="Buscar achado por OS, cliente ou login...">
            </form>
            <div id="listaAchadosAuditoria"></div>
        </div>
    `;

    if (resultado.porTipoErro.length > 0) {
        renderizarGraficoBarras(
            "graficoTiposErroAuditoria",
            resultado.porTipoErro.map(item => ({
                rotulo: ROTULOS_TIPO_ACHADO_AUDITORIA[item.rotulo] ?? item.rotulo,
                valor: item.valor
            })),
            { serie: "serie-2", limite: resultado.porTipoErro.length, titulo: "Tipos de erro encontrados" }
        );
    }

    if (resultado.semRegraDiagnosticos.length > 0) {
        renderizarGraficoBarras("graficoSemRegraAuditoria", resultado.semRegraDiagnosticos, {
            serie: "serie-1",
            limite: 10,
            titulo: "Diagnósticos sem regra mapeada"
        });
    }

    const form = document.getElementById("formBuscaAchadosAuditoria");
    const inputBusca = document.getElementById("buscaAchadosAuditoria");

    if (form) form.addEventListener("submit", evento => evento.preventDefault());
    if (inputBusca) {
        inputBusca.addEventListener("input", () => renderizarListaAchadosAuditoria(inputBusca.value.trim()));
    }

    renderizarListaAchadosAuditoria("");
}

function renderizarListaAchadosAuditoria(termo) {
    const container = document.getElementById("listaAchadosAuditoria");
    if (!container) return;

    const termoNormalizado = normalizarTexto(termo ?? "");
    const filtrados = termoNormalizado
        ? _achadosAuditoriaOperacionalCache.filter(achado =>
            normalizarTexto(String(achado.ordemId)).includes(termoNormalizado) ||
            normalizarTexto(achado.cliente ?? "").includes(termoNormalizado) ||
            normalizarTexto(achado.login ?? "").includes(termoNormalizado)
        )
        : _achadosAuditoriaOperacionalCache;

    if (filtrados.length === 0) {
        container.innerHTML = _achadosAuditoriaOperacionalCache.length === 0
            ? '<p class="alerta-vazio">Nenhuma inconsistência encontrada nas OS auditadas.</p>'
            : '<p class="alerta-vazio">Nenhum achado bate com esse termo.</p>';
        return;
    }

    container.innerHTML = `
        <div class="tabela-scroll">
            <table class="tabela-alertas">
                <thead>
                    <tr>
                        <th>OS</th>
                        <th>Cliente / Login</th>
                        <th>Tipo</th>
                        <th>Diagnóstico</th>
                        <th>Próxima Tarefa</th>
                        <th>Esperado</th>
                        <th>Motivo</th>
                    </tr>
                </thead>
                <tbody>
                    ${filtrados.map(achado => `
                        <tr data-id="${escaparHtml(String(achado.ordemId))}" class="linha-clicavel">
                            <td>${escaparHtml(String(achado.ordemId))}</td>
                            <td>${escaparHtml(achado.cliente ?? "-")} (${escaparHtml(achado.login ?? "-")})</td>
                            <td>${escaparHtml(ROTULOS_TIPO_ACHADO_AUDITORIA[achado.tipo] ?? achado.tipo)}</td>
                            <td>${escaparHtml(achado.diagnostico ?? "-")}</td>
                            <td>${escaparHtml(achado.proximaTarefa ?? "-")}</td>
                            <td>${escaparHtml((achado.proximaTarefaEsperada ?? []).join(" ou ") || "-")}</td>
                            <td>${escaparHtml(achado.motivo ?? "-")}</td>
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
