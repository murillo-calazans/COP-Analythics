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
 * Coluna "Status": um achado de Diagnóstico x Próxima Tarefa é
 * considerado corrigido de DUAS formas, que se somam (ver
 * AuditoriaOperacionalEngine.auditar):
 * - AUTOMATICAMENTE: a OS foi reaberta e o fechamento mais recente (o
 *   que está valendo hoje no sistema de origem) já resolve o mesmo
 *   Diagnóstico x Próxima Tarefa — comum quando o dado é reimportado
 *   depois de já ter sido corrigido lá, antes de alguém marcar por
 *   aqui. Não precisa de ação nenhuma, nem tem "Desfazer" (não tem o
 *   que desfazer, é reflexo direto do dado).
 * - MANUALMENTE: qualquer usuário logado (inclusive leitor) marca "já
 *   corrigido" (ex.: soube por fora que foi ajustado, ou julgou que não
 *   precisa de ação) — ver js/services/auditoriacorrecoes.js. Tem
 *   "Desfazer".
 * Duplicidade e Reabertura por outro colaborador só usam a marcação
 * MANUAL — são fatos históricos que não "se resolvem sozinhos" só por
 * reabrir de novo. Em qualquer um dos casos, o achado sai da contagem
 * "Com erro"/"Possíveis duplicidades" e entra em "Já corrigidos".
 *
 * Os cards de indicador (Reaberturas, Com erro, Possíveis duplicidades,
 * Já corrigidos) são clicáveis — abrem um popup com a lista daquela
 * categoria em duas colunas (operador de fechamento correto/incorreto,
 * cruzando com a categoria de reabertura por outro colaborador — ver
 * abrirCategoriaAuditoria), reaproveitando o modal genérico de "lista
 * completa" (js/ui/graficos.js) e o mesmo item visual usado na ficha do
 * cliente recorrente (.item-recorrencia, ver js/ui/alertas.js).
 */

const ROTULOS_TIPO_ACHADO_AUDITORIA = {
    "inconsistencia": "Diagnóstico × Próxima Tarefa incompatível",
    "proxima-tarefa-ausente": "Próxima Tarefa não informada",
    "diagnostico-ausente": "Diagnóstico não informado",
    "duplicidade": "Possível duplicidade (mesmo login/assunto/diagnóstico)",
    "reabertura-outro-colaborador": "Reaberta e fechada por outro colaborador"
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
            <div class="stat-tile stat-tile-destaque stat-tile-clicavel" data-categoria-auditoria="reaberturas">
                <div class="stat-label">⚠ Reabertas e fechadas por outro colaborador</div>
                <div class="stat-valor">${resumo.reaberturasOutroColaborador.toLocaleString("pt-BR")}</div>
            </div>
            <div class="stat-tile">
                <div class="stat-label">OS auditadas</div>
                <div class="stat-valor">${resumo.totalAuditadas.toLocaleString("pt-BR")}</div>
            </div>
            <div class="stat-tile">
                <div class="stat-label">Sem erro</div>
                <div class="stat-valor">${resumo.semErro.toLocaleString("pt-BR")}</div>
            </div>
            <div class="stat-tile stat-tile-clicavel" data-categoria-auditoria="erros">
                <div class="stat-label">Com erro</div>
                <div class="stat-valor">${resumo.comErro.toLocaleString("pt-BR")}</div>
            </div>
            <div class="stat-tile stat-tile-clicavel" data-categoria-auditoria="duplicidades">
                <div class="stat-label">Possíveis duplicidades</div>
                <div class="stat-valor">${resumo.duplicidades.toLocaleString("pt-BR")}</div>
            </div>
            <div class="stat-tile stat-tile-clicavel" data-categoria-auditoria="corrigidos">
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

    container.querySelectorAll("[data-categoria-auditoria]").forEach(tile => {
        tile.addEventListener("click", () => abrirCategoriaAuditoria(tile.dataset.categoriaAuditoria));
    });

    renderizarListaAchadosAuditoria("");
}

/**
 * Definição de cada card clicável: título do popup e o filtro (sobre
 * _achadosAuditoriaOperacionalCache) que decide o que entra na
 * categoria. "corrigidos" reúne achado de QUALQUER tipo já marcado —
 * os outros são só os ainda pendentes (mesma régua do KPI). "erros" não
 * abre a lista direto — vai pro popup de subcategorias primeiro (ver
 * abrirSubcategoriasErro).
 */
const DEFINICAO_CATEGORIAS_AUDITORIA = {
    duplicidades: {
        titulo: "Possíveis duplicidades",
        filtro: achado => achado.tipo === "duplicidade" && !achado.corrigido
    },
    corrigidos: {
        titulo: "Já corrigidos",
        filtro: achado => achado.corrigido,
        // Aqui não faz sentido separar por operador correto/incorreto —
        // tudo já está resolvido; se alguma OS ainda tivesse um operador
        // "incorreto" de verdade, ela não deveria estar corrigida.
        duasColunas: false
    },
    reaberturas: {
        titulo: "Reabertas e fechadas por outro colaborador",
        filtro: achado => achado.tipo === "reabertura-outro-colaborador" && !achado.corrigido
    }
};

/**
 * "Com erro" hoje engloba 3 tipos bem diferentes (ver
 * ROTULOS_TIPO_ACHADO_AUDITORIA) — em vez de jogar tudo junto na mesma
 * lista, o card abre primeiro um resumo por subcategoria
 * (abrirSubcategoriasErro), e só ao escolher uma delas é que aparece a
 * lista de OS (mesmo popup de duas colunas dos outros cards).
 *
 * "erro_diagnostico"/"erro_proxima_tarefa" são as duas metades do tipo
 * "inconsistencia" (Diagnóstico x Próxima Tarefa incompatível) — ver
 * AuditoriaOperacionalEngine.subcategoriaErroInconsistencia: se a OS foi
 * reaberta com uma mensagem tipo "acerto de próxima tarefa", isso
 * confirma que o problema era a Próxima Tarefa, não o Diagnóstico.
 * "diagnostico-ausente"/"proxima-tarefa-ausente" já são categorias
 * fechadas em si (o campo simplesmente não foi preenchido).
 */
const DEFINICAO_SUBCATEGORIAS_ERRO = {
    erro_diagnostico: {
        titulo: "Erro de Diagnóstico",
        filtro: achado => achado.tipo === "inconsistencia" && achado.subcategoria === "erro_diagnostico"
    },
    erro_proxima_tarefa: {
        titulo: "Erro de Próxima Tarefa",
        filtro: achado => achado.tipo === "inconsistencia" && achado.subcategoria === "erro_proxima_tarefa"
    },
    "diagnostico-ausente": {
        titulo: "Diagnóstico não informado",
        filtro: achado => achado.tipo === "diagnostico-ausente"
    },
    "proxima-tarefa-ausente": {
        titulo: "Próxima Tarefa não informada",
        filtro: achado => achado.tipo === "proxima-tarefa-ausente"
    }
};

function abrirCategoriaAuditoria(categoria) {
    if (categoria === "erros") {
        abrirSubcategoriasErro();
        return;
    }

    const definicao = DEFINICAO_CATEGORIAS_AUDITORIA[categoria];
    if (!definicao) return;

    const itens = _achadosAuditoriaOperacionalCache.filter(definicao.filtro);
    renderizarPopupDuasColunasAuditoria(definicao.titulo, itens, { duasColunas: definicao.duasColunas !== false });
}

/** Popup nível 1 do card "Com erro" — um resumo clicável por subcategoria (ver DEFINICAO_SUBCATEGORIAS_ERRO). */
function abrirSubcategoriasErro() {
    const itensComErro = _achadosAuditoriaOperacionalCache.filter(
        achado => achado.tipo !== "duplicidade" && achado.tipo !== "reabertura-outro-colaborador" && !achado.corrigido
    );

    document.getElementById("modalGraficoCompletoTitulo").textContent = `Com erro (${itensComErro.length})`;

    const conteudo = document.getElementById("modalGraficoCompletoConteudo");
    conteudo.innerHTML = `
        <p class="modal-descricao">Toque num tipo de erro pra ver a lista de OS.</p>
        <div class="lista-subcategorias-erro">
            ${Object.entries(DEFINICAO_SUBCATEGORIAS_ERRO).map(([chave, def]) => `
                <button type="button" class="item-subcategoria-erro" data-subcategoria-erro="${escaparHtml(chave)}">
                    <span>${escaparHtml(def.titulo)}</span>
                    <strong>${itensComErro.filter(def.filtro).length}</strong>
                </button>
            `).join("")}
        </div>
    `;

    conteudo.querySelectorAll("[data-subcategoria-erro]").forEach(botao => {
        botao.addEventListener("click", () => {
            const definicaoSub = DEFINICAO_SUBCATEGORIAS_ERRO[botao.dataset.subcategoriaErro];
            if (!definicaoSub) return;
            renderizarPopupDuasColunasAuditoria(
                definicaoSub.titulo,
                itensComErro.filter(definicaoSub.filtro),
                { aoVoltar: abrirSubcategoriasErro }
            );
        });
    });

    abrirModal("modalGraficoCompleto");
}

/**
 * Popup de detalhamento (nível 2, ou direto pros outros 3 cards) — duas
 * colunas cruzando com o MOTIVO da reabertura por troca de colaborador
 * (ver js/config/motivosreabertura.js): coluna 1 é quem NÃO tem uma
 * reabertura classificada como "serviço não executado" — inclui tanto
 * quem nunca reabriu quanto quem reabriu só por "erro de processo"
 * (correção administrativa, o 1º Fechamento continua valendo); coluna 2
 * é só quem tem uma reabertura "serviço não executado" (o 1º técnico
 * não foi a campo de verdade — operador de fechamento "incorreto", já
 * que o crédito passa a ser de quem realmente atendeu por último).
 *
 * `opcoes.duasColunas === false` desliga essa separação e mostra uma
 * lista única (usado por "Já corrigidos": tudo ali já está resolvido,
 * então "operador incorreto" não tem sentido — se tivesse algo
 * incorreto de verdade, não estaria corrigido). `opcoes.aoVoltar`, se
 * vier, desenha um botão "← Voltar" que chama de volta a tela anterior
 * (nível 1) no MESMO modal. Reaproveita o modal genérico "lista
 * completa" (js/ui/graficos.js) em vez de um modal novo.
 */
function renderizarPopupDuasColunasAuditoria(titulo, itens, opcoes = {}) {
    document.getElementById("modalGraficoCompletoTitulo").textContent = `${titulo} (${itens.length})`;

    const botaoVoltarHtml = opcoes.aoVoltar
        ? `<button type="button" class="botao-voltar-popup" id="btnVoltarPopupAuditoria">← Voltar</button>`
        : "";

    const conteudo = document.getElementById("modalGraficoCompletoConteudo");

    if (opcoes.duasColunas === false) {
        conteudo.innerHTML = `
            ${botaoVoltarHtml}
            <div class="lista-recorrencias">${itensCategoriaAuditoriaHtml(itens)}</div>
        `;
    } else {
        const idsServicoNaoExecutado = new Set(
            _achadosAuditoriaOperacionalCache
                .filter(achado => achado.tipo === "reabertura-outro-colaborador" && achado.motivoReabertura === "servico_nao_executado")
                .map(achado => String(achado.ordemId))
        );

        const corretos = itens.filter(achado => !idsServicoNaoExecutado.has(String(achado.ordemId)));
        const incorretos = itens.filter(achado => idsServicoNaoExecutado.has(String(achado.ordemId)));

        conteudo.innerHTML = `
            ${botaoVoltarHtml}
            <div class="duas-colunas-categoria">
                <div>
                    <h3 class="modal-subtitulo">Operador de fechamento correto (${corretos.length})</h3>
                    <div class="lista-recorrencias">${itensCategoriaAuditoriaHtml(corretos)}</div>
                </div>
                <div>
                    <h3 class="modal-subtitulo">Operador de fechamento incorreto (${incorretos.length})</h3>
                    <div class="lista-recorrencias">${itensCategoriaAuditoriaHtml(incorretos)}</div>
                </div>
            </div>
        `;
    }

    conteudo.querySelectorAll(".item-recorrencia-os").forEach(botao => {
        botao.addEventListener("click", () => abrirModalOS(botao.dataset.id, "modalGraficoCompleto"));
    });

    if (opcoes.aoVoltar) {
        document.getElementById("btnVoltarPopupAuditoria")?.addEventListener("click", opcoes.aoVoltar);
    }

    abrirModal("modalGraficoCompleto");
}

const ROTULOS_MOTIVO_REABERTURA = {
    erro_processo: "Erro de processo",
    servico_nao_executado: "Serviço não executado",
    indefinido: "Motivo não identificado"
};

function itensCategoriaAuditoriaHtml(itens) {
    if (itens.length === 0) return '<p class="alerta-vazio">Nenhuma OS aqui.</p>';

    return itens.map(achado => {
        const ehReaberturaOutroColaborador = achado.tipo === "reabertura-outro-colaborador";

        // "Corrigida em": automática usa a data do fechamento mais
        // recente (o que resolveu o problema sozinho); manual usa
        // quando alguém marcou por aqui (ver
        // AuditoriaOperacionalEngine.auditar).
        const dataCorrigida = achado.corrigidoAutomaticamente
            ? achado.dataUltimoFechamento
            : (achado.corrigidoPor ? achado.corrigidoEm : null);

        const datasHtml = (achado.dataFinalizacao || dataCorrigida) ? `
            <span class="item-recorrencia-assunto">
                ${achado.dataFinalizacao ? `Finalizada em ${escaparHtml(formatarDataHora(new Date(achado.dataFinalizacao)))}` : ""}
                ${dataCorrigida ? ` · Corrigida em ${escaparHtml(formatarDataHora(new Date(dataCorrigida)))}` : ""}
            </span>
        ` : "";

        return `
        <div class="item-recorrencia item-recorrencia-coluna">
            <div class="item-recorrencia-lado">
                <span class="item-recorrencia-label">OS</span>
                <button type="button" class="item-recorrencia-os" data-id="${escaparHtml(String(achado.ordemId))}">${escaparHtml(String(achado.ordemId))}</button>
                <span class="item-recorrencia-assunto">${escaparHtml(achado.cliente ?? achado.login ?? "-")}</span>
            </div>
            ${ehReaberturaOutroColaborador ? `
                <div class="item-recorrencia-lado">
                    <span class="item-recorrencia-label">1º fechamento</span>
                    <span class="item-recorrencia-nome">${escaparHtml(achado.colaboradorPrimeiro ?? "-")}</span>
                </div>
                <div class="item-recorrencia-lado">
                    <span class="item-recorrencia-label">Reaberta por</span>
                    <span class="item-recorrencia-nome">${escaparHtml(achado.operadorReabertura ?? "-")}</span>
                </div>
                <div class="item-recorrencia-lado">
                    <span class="item-recorrencia-label">Fechamento seguinte creditado a</span>
                    <span class="item-recorrencia-nome">${escaparHtml(achado.colaboradorUltimo ?? "-")}</span>
                </div>
                <span class="item-recorrencia-assunto">Motivo: ${escaparHtml(ROTULOS_MOTIVO_REABERTURA[achado.motivoReabertura] ?? "Motivo não identificado")}</span>
            ` : `
                <div class="item-recorrencia-lado">
                    <span class="item-recorrencia-label">Motivo</span>
                    <span class="item-recorrencia-nome">${escaparHtml(achado.motivo ?? ROTULOS_TIPO_ACHADO_AUDITORIA[achado.tipo] ?? achado.tipo)}</span>
                </div>
                ${achado.operadorReabertura ? `
                    <div class="item-recorrencia-lado">
                        <span class="item-recorrencia-label">Reaberta por</span>
                        <span class="item-recorrencia-nome">${escaparHtml(achado.operadorReabertura)}</span>
                    </div>
                ` : ""}
            `}
            ${datasHtml}
        </div>
    `;
    }).join("");
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

/**
 * Etiqueta "Corrigido" + botão de desfazer (marcação manual), etiqueta
 * "Corrigida na reabertura" sem botão nenhum (detecção automática — o
 * fechamento mais recente já resolve o achado sozinho, não tem o que
 * desfazer), ou botão de marcar (ainda pendente). Ver
 * AuditoriaOperacionalEngine.auditar (corrigidoAutomaticamente) e
 * js/services/auditoriacorrecoes.js (marcação manual).
 */
function celulaStatusAchado(achado) {
    if (!achado.corrigido) {
        return `
            <button type="button" class="botao-corrigir" data-acao-correcao="marcar"
                data-ordem-id="${escaparHtml(String(achado.ordemId))}" data-tipo-achado="${escaparHtml(achado.tipo)}">
                Marcar como corrigido
            </button>
        `;
    }

    if (!achado.corrigidoPor) {
        return `
            <span class="tag-corrigido" title="O fechamento mais recente dessa OS já resolve esse Diagnóstico × Próxima Tarefa — foi reaberta e ajustada no sistema de origem, sem precisar marcar manualmente.">
                ✓ Corrigida na reabertura
            </span>
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
