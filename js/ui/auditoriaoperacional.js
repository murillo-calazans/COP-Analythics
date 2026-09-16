/**
 * ==========================================================
 * UI da Auditoria Operacional (aba Auditoria)
 * ==========================================================
 * Indicadores + lista de achados calculados pelo
 * AuditoriaOperacionalEngine — nenhuma regra vive aqui, só desenho.
 * Pra adicionar/ajustar uma regra, ver js/config/regrasauditoria.js.
 * Respeita o Filtro Global, igual Dashboard/Técnicos/Indicadores
 * (diferente de Alertas, que é independente dele).
 *
 * Coluna "Status": um achado já corrigido no sistema de origem (ex.:
 * reaberto e ajustado) continua aparecendo aqui — o 1º Fechamento, que
 * é o que a Auditoria audita, não muda — mas pode ser marcado como
 * "já corrigido" (qualquer usuário logado, inclusive leitor) pra não
 * confundir com pendência real; sai da contagem "Com erro"/
 * "Possíveis duplicidades" e entra em "Já corrigidos". Ver
 * js/services/auditoriacorrecoes.js.
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
                <div class="stat-label">Já corrigidos</div>
                <div class="stat-valor">${resumo.corrigidos.toLocaleString("pt-BR")}</div>
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
                        <th>Status</th>
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
                            <td>${celulaStatusAchado(achado)}</td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;

    container.querySelectorAll("tr[data-id]").forEach(tr => {
        tr.addEventListener("click", () => abrirModalOS(tr.dataset.id));
    });

    container.querySelectorAll("[data-acao-correcao]").forEach(botao => {
        botao.addEventListener("click", evento => {
            evento.stopPropagation(); // não abre o modal da OS ao clicar no botão
            alternarCorrecaoAchado(botao, botao.dataset.ordemId, botao.dataset.tipoAchado, botao.dataset.acaoCorrecao === "desfazer");
        });
    });
}

/** Etiqueta "Corrigido" (com quem/quando) + botão de desfazer, ou botão de marcar — ver js/services/auditoriacorrecoes.js. */
function celulaStatusAchado(achado) {
    if (!achado.corrigido) {
        return `
            <button type="button" class="botao-corrigir" data-acao-correcao="marcar"
                data-ordem-id="${escaparHtml(String(achado.ordemId))}" data-tipo-achado="${escaparHtml(achado.tipo)}">
                Marcar como corrigido
            </button>
        `;
    }

    const quemQuando = [achado.corrigidoPor, achado.corrigidoEm ? formatarDataHora(new Date(achado.corrigidoEm)) : null]
        .filter(Boolean)
        .join(" — ");

    return `
        <span class="tag-corrigido" title="${escaparHtml(quemQuando || "Corrigido")}">✓ Corrigido</span>
        <button type="button" class="botao-desfazer-correcao" data-acao-correcao="desfazer"
            data-ordem-id="${escaparHtml(String(achado.ordemId))}" data-tipo-achado="${escaparHtml(achado.tipo)}">
            Desfazer
        </button>
    `;
}

/** Marca/desmarca um achado como corrigido (qualquer usuário logado, ver patch-12) e recarrega a lista. */
async function alternarCorrecaoAchado(botao, ordemId, tipoAchado, desfazer) {
    botao.disabled = true;

    const ok = desfazer
        ? await desmarcarAchadoCorrigido(ordemId, tipoAchado)
        : await marcarAchadoCorrigido(ordemId, tipoAchado);

    if (!ok) {
        alert("Não foi possível salvar agora. Tenta de novo em instantes.");
        botao.disabled = false;
        return;
    }

    const termoAtual = document.getElementById("buscaAchadosAuditoria")?.value ?? "";
    renderizarPainelAuditoriaOperacional();

    const inputNovo = document.getElementById("buscaAchadosAuditoria");
    if (inputNovo && termoAtual) {
        inputNovo.value = termoAtual;
        renderizarListaAchadosAuditoria(termoAtual.trim());
    }
}
