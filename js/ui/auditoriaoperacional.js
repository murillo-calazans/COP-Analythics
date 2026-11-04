const ROTULOS_TIPO_ACHADO_AUDITORIA = {
    "inconsistencia": "Diagnóstico × Próxima Tarefa incompatível",
    "proxima-tarefa-ausente": "Próxima Tarefa não informada",
    "diagnostico-ausente": "Diagnóstico não informado",
    "duplicidade": "Possível duplicidade (mesmo login/assunto/diagnóstico)",
    "reabertura-outro-colaborador": "Reaberta e fechada por outro colaborador"
};

let _achadosAuditoriaOperacionalCache = [];

let _reabrirPopupAuditoriaAtual = null;

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

    const analiseAuditoria = IndicatorEngine.analisarEventosDeTodas(ordensFiltradas);
    _gruposLoginAuditoria = AuditoriaOperacionalEngine.loginsEmVariasOrdens(ordensFiltradas, analiseAuditoria);

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

        <div class="grafico-card" id="cardLoginsVariasOrdens">
            <div class="grafico-cabecalho">
                <div><div class="grafico-titulo">Logins em várias OS no período</div><div class="grafico-subtitulo">Mesmo cliente (login) com 2+ ordens no recorte do Filtro Global</div></div>
                <select id="filtroTerceiraLoginsAuditoria" aria-label="Filtrar por empresa"></select>
            </div>
            <div id="tabelaLoginsVariasOrdens"></div>
        </div>

        <div class="grafico-card" id="cardInstalManutAuditoria">
            <div class="grafico-cabecalho">
                <div><div class="grafico-titulo">Instalação de terceira → manutenção suspeita</div><div class="grafico-subtitulo">Instalação fechada por terceira e, em até 15 dias, manutenção da nossa equipe sem reparo real (diagnóstico improdutivo)</div></div>
            </div>
            <div id="tabelaInstalManutAuditoria"></div>
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

    prepararSecaoLoginsAuditoria();
    renderizarSecaoInstalManutAuditoria();

    renderizarListaAchadosAuditoria("");
}

function renderizarSecaoInstalManutAuditoria() {
    const alvo = document.getElementById("tabelaInstalManutAuditoria");
    if (!alvo) return;
    const alertas = TerceirasEngine.instalacoesComManutencaoSuspeita(analiseTerceiras());
    alvo.innerHTML = htmlTabelaInstalManutSuspeita(alertas);
}

let _gruposLoginAuditoria = [];
let _filtroEmpresaLoginsAuditoria = "__todas__";

function prepararSecaoLoginsAuditoria() {
    const select = document.getElementById("filtroTerceiraLoginsAuditoria");
    if (select) {
        const empresas = [...new Set(_gruposLoginAuditoria.flatMap(g => g.ordens.map(o => o.empresa)))].sort();
        if (!empresas.includes(_filtroEmpresaLoginsAuditoria)) _filtroEmpresaLoginsAuditoria = "__todas__";
        select.innerHTML = `<option value="__todas__">Todas as empresas</option>` +
            empresas.map(e => `<option value="${escaparHtml(e)}"${e === _filtroEmpresaLoginsAuditoria ? " selected" : ""}>${escaparHtml(e)}</option>`).join("");
        select.onchange = () => { _filtroEmpresaLoginsAuditoria = select.value; renderizarSecaoLoginsAuditoria(); };
    }
    renderizarSecaoLoginsAuditoria();
}

function renderizarSecaoLoginsAuditoria() {
    const alvo = document.getElementById("tabelaLoginsVariasOrdens");
    if (!alvo) return;

    const empresa = _filtroEmpresaLoginsAuditoria;
    const grupos = empresa === "__todas__"
        ? _gruposLoginAuditoria
        : _gruposLoginAuditoria.filter(g => g.ordens.some(o => o.empresa === empresa));

    if (!grupos.length) {
        alvo.innerHTML = '<p class="alerta-vazio">Nenhum login com 2+ OS nesse recorte.</p>';
        return;
    }

    const dataBR = d => d ? new Date(d).toLocaleDateString("pt-BR") : "—";
    alvo.innerHTML = grupos.map(g => `
        <div class="auditoria-login-grupo">
            <div class="auditoria-login-cab"><strong>${escaparHtml(g.login)}</strong> · ${escaparHtml(g.cliente ?? "")} <span class="escala-tag">${g.ordens.length} OS</span></div>
            <div class="tabela-scroll">
                <table class="tabela-alertas">
                    <thead><tr><th>OS</th><th>Tipo (assunto)</th><th>Abertura</th><th>Fechamento</th><th>Técnico</th><th>Empresa</th></tr></thead>
                    <tbody>${g.ordens.map(o => `
                        <tr>
                            <td>${escaparHtml(String(o.id))}</td>
                            <td>${escaparHtml(o.assunto ?? "—")}</td>
                            <td>${dataBR(o.abertura)}</td>
                            <td>${dataBR(o.fechamento)}</td>
                            <td>${escaparHtml(o.tecnico ?? "—")}</td>
                            <td>${escaparHtml(o.empresa)}</td>
                        </tr>`).join("")}
                    </tbody>
                </table>
            </div>
        </div>`).join("");
}

const DEFINICAO_CATEGORIAS_AUDITORIA = {
    duplicidades: {
        titulo: "Possíveis duplicidades",
        filtro: achado => achado.tipo === "duplicidade" && !achado.corrigido
    },
    corrigidos: {
        titulo: "Já corrigidos",
        filtro: achado => achado.corrigido,

        duasColunas: false
    },
    reaberturas: {
        titulo: "Reabertas e fechadas por outro colaborador",
        filtro: achado => achado.tipo === "reabertura-outro-colaborador" && !achado.corrigido
    }
};

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

    _reabrirPopupAuditoriaAtual = () => abrirCategoriaAuditoria(categoria);

    const itens = _achadosAuditoriaOperacionalCache.filter(definicao.filtro);
    renderizarPopupDuasColunasAuditoria(definicao.titulo, itens, { duasColunas: definicao.duasColunas !== false });
}

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
            abrirSubcategoriaErro(botao.dataset.subcategoriaErro);
        });
    });

    abrirModal("modalGraficoCompleto");
}

function abrirSubcategoriaErro(chave) {
    const definicaoSub = DEFINICAO_SUBCATEGORIAS_ERRO[chave];
    if (!definicaoSub) return;

    const itensComErro = _achadosAuditoriaOperacionalCache.filter(
        achado => achado.tipo !== "duplicidade" && achado.tipo !== "reabertura-outro-colaborador" && !achado.corrigido
    );

    _reabrirPopupAuditoriaAtual = () => abrirSubcategoriaErro(chave);

    renderizarPopupDuasColunasAuditoria(
        definicaoSub.titulo,
        itensComErro.filter(definicaoSub.filtro),
        { aoVoltar: abrirSubcategoriasErro }
    );
}

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

    conteudo.querySelectorAll("[data-acao-correcao]").forEach(botao => {
        botao.addEventListener("click", evento => {
            evento.stopPropagation();
            alternarCorrecaoAchadoNoPopup(botao, botao.dataset.ordemId, botao.dataset.tipoAchado, botao.dataset.acaoCorrecao === "desfazer");
        });
    });

    if (opcoes.aoVoltar) {
        document.getElementById("btnVoltarPopupAuditoria")?.addEventListener("click", opcoes.aoVoltar);
    }

    abrirModal("modalGraficoCompleto");
}

async function alternarCorrecaoAchadoNoPopup(botao, ordemId, tipoAchado, desfazer) {
    botao.disabled = true;

    const ok = desfazer
        ? await desmarcarAchadoCorrigido(ordemId, tipoAchado)
        : await marcarAchadoCorrigido(ordemId, tipoAchado);

    if (!ok) {
        alert("Não foi possível salvar agora. Tenta de novo em instantes.");
        botao.disabled = false;
        return;
    }

    renderizarPainelAuditoriaOperacional();
    _reabrirPopupAuditoriaAtual?.();
}

function renderizarAuditoriaOperacionalOS(ordem) {
    const container = document.getElementById("modalAuditoriaOperacionalOS");
    if (!container) return;

    if (!APP.status?.baseCarregada) {
        container.innerHTML = "";
        return;
    }

    if (_achadosAuditoriaOperacionalCache.length === 0) {
        const ordensFiltradas = FiltroEngine.ordensFiltradas();
        if (ordensFiltradas.size > 0) {
            _achadosAuditoriaOperacionalCache = AuditoriaOperacionalEngine.auditar(ordensFiltradas).achados;
        }
    }

    const achadosDaOrdem = _achadosAuditoriaOperacionalCache.filter(achado => String(achado.ordemId) === String(ordem.id));

    if (achadosDaOrdem.length === 0) {
        container.innerHTML = "";
        return;
    }

    container.innerHTML = `
        <h3 class="modal-subtitulo">Auditoria Operacional</h3>
        <div class="lista-recorrencias">
            ${achadosDaOrdem.map(achado => `
                <div class="item-recorrencia item-recorrencia-coluna">
                    <div class="item-recorrencia-lado">
                        <span class="item-recorrencia-label">${escaparHtml(ROTULOS_TIPO_ACHADO_AUDITORIA[achado.tipo] ?? achado.tipo)}</span>
                        <span class="item-recorrencia-nome">${escaparHtml(achado.motivo ?? "-")}</span>
                    </div>
                    <div class="item-recorrencia-lado item-recorrencia-status">${celulaStatusAchado(achado)}</div>
                </div>
            `).join("")}
        </div>
    `;

    container.querySelectorAll("[data-acao-correcao]").forEach(botao => {
        botao.addEventListener("click", evento => {
            evento.stopPropagation();
            alternarCorrecaoAchadoNoModalOS(botao, botao.dataset.ordemId, botao.dataset.tipoAchado, botao.dataset.acaoCorrecao === "desfazer", ordem);
        });
    });
}

async function alternarCorrecaoAchadoNoModalOS(botao, ordemId, tipoAchado, desfazer, ordem) {
    botao.disabled = true;

    const ok = desfazer
        ? await desmarcarAchadoCorrigido(ordemId, tipoAchado)
        : await marcarAchadoCorrigido(ordemId, tipoAchado);

    if (!ok) {
        alert("Não foi possível salvar agora. Tenta de novo em instantes.");
        botao.disabled = false;
        return;
    }

    renderizarPainelAuditoriaOperacional();
    _reabrirPopupAuditoriaAtual?.();
    renderizarAuditoriaOperacionalOS(ordem);
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
                ${achado.assunto ? `<span class="item-recorrencia-assunto">${escaparHtml(achado.assunto)}</span>` : ""}
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
            <div class="item-recorrencia-lado item-recorrencia-status">${celulaStatusAchado(achado)}</div>
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
            normalizarTexto(achado.login ?? "").includes(termoNormalizado) ||
            normalizarTexto(achado.assunto ?? "").includes(termoNormalizado)
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
                        <th>Assunto</th>
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
                            <td>${textoFiltravel("assuntos", achado.assunto)}</td>
                            <td>${escaparHtml(ROTULOS_TIPO_ACHADO_AUDITORIA[achado.tipo] ?? achado.tipo)}</td>
                            <td>${textoFiltravel("diagnosticos", achado.diagnostico)}</td>
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
            evento.stopPropagation();
            alternarCorrecaoAchado(botao, botao.dataset.ordemId, botao.dataset.tipoAchado, botao.dataset.acaoCorrecao === "desfazer");
        });
    });
}

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
