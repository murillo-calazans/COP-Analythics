/**
 * ==========================================================
 * UI da Seção Técnicos
 * ==========================================================
 * Lista/busca fichas de técnicos calculadas pelo IndicatorEngine
 * e abre o detalhe individual num modal. A ficha em si fica
 * enxuta (só números); qualquer item com uma lista por trás
 * (TMS, TMA, reaberturas, recorrências) abre num popup à parte
 * (modalTecnicoDetalhe), com retorno pra ficha ao fechar. Não
 * calcula nada aqui.
 */

let _fichasTecnicosCache = [];

function registrarBuscaTecnicos() {
    const form = document.getElementById("formBuscaTecnicos");
    const input = document.getElementById("buscaTecnicos");

    if (form) {
        form.addEventListener("submit", evento => {
            evento.preventDefault();
            renderizarResultadosTecnicos(input ? input.value.trim() : "");
        });
    }

    if (input) {
        input.addEventListener("input", () => renderizarResultadosTecnicos(input.value.trim()));
    }
}

function renderizarSecaoTecnicos() {
    const input = document.getElementById("buscaTecnicos");
    renderizarResultadosTecnicos(input ? input.value.trim() : "");
}

function renderizarResultadosTecnicos(termo) {
    const container = document.getElementById("resultadosTecnicos");
    if (!container) return;

    if (!APP.status.baseCarregada || APP.dados.ordens.size === 0) {
        container.innerHTML = '<p class="alerta-vazio">Importe dados pra ver a ficha dos técnicos.</p>';
        return;
    }

    _fichasTecnicosCache = IndicatorEngine.calcularFichasTecnicos(FiltroEngine.ordensFiltradas());

    const termoNormalizado = normalizarTexto(termo ?? "");
    const filtradas = termoNormalizado
        ? _fichasTecnicosCache.filter(f => normalizarTexto(f.nome).includes(termoNormalizado))
        : _fichasTecnicosCache;

    if (filtradas.length === 0) {
        container.innerHTML = '<p class="alerta-vazio">Nenhum técnico com OS finalizada encontrado.</p>';
        return;
    }

    const linhas = filtradas.map(ficha => `
        <tr data-tecnico="${escaparHtml(ficha.nome)}" class="linha-clicavel">
            <td>#${ficha.ranking}</td>
            <td>${escaparHtml(ficha.nome)}</td>
            <td>${ficha.totalFinalizadas}</td>
            <td>${formatarDuracaoHoras(ficha.tmsHoras)}</td>
            <td>${ficha.indiceReaberturaPercentual.toFixed(1)}%</td>
            <td>${ficha.recorrenciasGeradas}</td>
        </tr>
    `).join("");

    container.innerHTML = `
        <table class="tabela-alertas">
            <thead>
                <tr>
                    <th>#</th>
                    <th>Técnico</th>
                    <th>OS finalizadas</th>
                    <th>TMS</th>
                    <th>Reabertura</th>
                    <th>Recorrência gerada</th>
                </tr>
            </thead>
            <tbody>${linhas}</tbody>
        </table>
    `;

    container.querySelectorAll("tr[data-tecnico]").forEach(tr => {
        tr.addEventListener("click", () => abrirModalTecnico(tr.dataset.tecnico));
    });
}

function abrirModalTecnico(nome) {
    let ficha = _fichasTecnicosCache.find(f => f.nome === nome);

    if (!ficha && APP.dados.ordens.size > 0) {
        _fichasTecnicosCache = IndicatorEngine.calcularFichasTecnicos(FiltroEngine.ordensFiltradas());
        ficha = _fichasTecnicosCache.find(f => f.nome === nome);
    }

    if (!ficha) {
        alert("Técnico não encontrado nos dados atuais.");
        return;
    }

    renderizarFichaTecnico(ficha);
    abrirModal("modalTecnico");
}

function renderizarFichaTecnico(ficha) {
    document.getElementById("modalTecnicoTitulo").textContent = ficha.nome;

    document.getElementById("modalTecnicoResumo").innerHTML = `
        <div class="resumo-grid">
            <div><span>Ranking geral</span><strong>#${ficha.ranking}</strong></div>
            <div><span>OS finalizadas</span><strong>${ficha.totalFinalizadas}</strong></div>
            ${construirItemResumoClicavel("itemTms", "TMS (deslocamento até finalização)", formatarDuracaoHoras(ficha.tmsHoras), ficha.tmsDetalhes.length > 0)}
            ${construirItemResumoClicavel("itemTma", "TMA (Em Execução até finalização)", formatarDuracaoHoras(ficha.tmaHoras), ficha.tmaDetalhes.length > 0)}
            ${construirItemResumoClicavel("itemReaberturas", "Reaberturas", `${ficha.reaberturas} (${ficha.indiceReaberturaPercentual.toFixed(1)}%)`, ficha.ordensReabertas.length > 0)}
            <div><span>Diagnóstico preenchido no fechamento</span><strong>${ficha.diagnosticosPreenchidos} preenchido(s) / ${ficha.diagnosticosAusentes} ausente(s)</strong></div>
            <div><span>Reagendamentos — Resposta Padrão</span><strong>${ficha.reagendamentosAcertos} preenchida(s) / ${ficha.reagendamentosErros} em branco</strong></div>
            ${construirItemResumoClicavel("itemRecorrencias", "Recorrência gerada", `${ficha.recorrenciasGeradas} (${ficha.percentualRecorrenciaSobreFinalizadas.toFixed(1)}%)`, ficha.recorrenciasDetalhes.length > 0)}
            <div><span>Trabalho sozinho x em dupla</span><strong>${ficha.trabalhosSolo} sozinho / ${ficha.trabalhosDupla} em dupla</strong></div>
            ${construirItemResumoClicavel("itemAbandonos", "Deslocamentos abandonados", `${ficha.deslocamentosAbandonados}`, ficha.deslocamentosAbandonados > 0)}
        </div>
    `;

    ligarItemResumo("itemTms", () => abrirDetalheTempo("TMS — deslocamento até finalização", ficha.tmsDetalhes));
    ligarItemResumo("itemTma", () => abrirDetalheTempo("TMA — Em Execução até finalização", ficha.tmaDetalhes));
    ligarItemResumo("itemReaberturas", () => abrirDetalheOSSimples("OS reabertas", ficha.ordensReabertas));
    ligarItemResumo("itemRecorrencias", () => abrirDetalheRecorrencias("OS de recorrência geradas", ficha.recorrenciasDetalhes));
    ligarItemResumo("itemAbandonos", () => abrirDetalheAbandonos("Deslocamentos abandonados", ficha.deslocamentosAbandonadosDetalhes));
}

/** Item do resumo-grid, clicável só quando há uma lista pra abrir por trás dele. */
function construirItemResumoClicavel(id, rotulo, valor, temDetalhe) {
    return `
        <div class="${temDetalhe ? "resumo-item-clicavel" : ""}" id="${id}" ${temDetalhe ? 'role="button" tabindex="0"' : ""}>
            <span>${rotulo}${temDetalhe ? " — clique pra detalhar" : ""}</span>
            <strong>${valor}</strong>
        </div>
    `;
}

function ligarItemResumo(id, aoAbrir) {
    const item = document.getElementById(id);
    if (!item || !item.classList.contains("resumo-item-clicavel")) return;

    item.addEventListener("click", aoAbrir);
    item.addEventListener("keydown", evento => {
        if (evento.key === "Enter" || evento.key === " ") {
            evento.preventDefault();
            aoAbrir();
        }
    });
}

function abrirDetalheTempo(titulo, detalhes) {
    abrirPopupDetalheTecnico(titulo, `
        <div class="lista-tmr-detalhe">
            ${detalhes.map(d => `
                <div class="item-tmr">
                    <button type="button" class="item-recorrencia-os" data-id="${escaparHtml(String(d.ordemId))}">${escaparHtml(String(d.ordemId))}</button>
                    <span class="item-tmr-assunto">${escaparHtml(d.assunto ?? "sem assunto")}</span>
                    <span class="item-tmr-valor">${formatarDuracaoHoras(d.horas)}</span>
                </div>
            `).join("")}
        </div>
    `);
}

function abrirDetalheOSSimples(titulo, ids) {
    abrirPopupDetalheTecnico(titulo, `
        <div class="lista-os-simples">
            ${ids.map(id => `
                <button type="button" class="item-recorrencia-os" data-id="${escaparHtml(String(id))}">${escaparHtml(String(id))}</button>
            `).join("")}
        </div>
    `);
}

function abrirDetalheRecorrencias(titulo, detalhes) {
    abrirPopupDetalheTecnico(titulo, `
        <div class="lista-recorrencias">
            ${detalhes.map(d => `
                <div class="item-recorrencia">
                    <div class="item-recorrencia-lado">
                        <span class="item-recorrencia-label">Fechou</span>
                        <button type="button" class="item-recorrencia-os" data-id="${escaparHtml(String(d.ordemOrigemId))}">${escaparHtml(String(d.ordemOrigemId))}</button>
                        <span class="item-recorrencia-assunto">${escaparHtml(d.assuntoOrigem ?? "sem assunto")}</span>
                    </div>
                    <div class="item-recorrencia-seta">→</div>
                    <div class="item-recorrencia-lado">
                        <span class="item-recorrencia-label">Cliente reabriu</span>
                        <button type="button" class="item-recorrencia-os" data-id="${escaparHtml(String(d.ordemSeguinteId))}">${escaparHtml(String(d.ordemSeguinteId))}</button>
                        <span class="item-recorrencia-assunto">${escaparHtml(d.assuntoSeguinte ?? "sem assunto")}</span>
                    </div>
                </div>
            `).join("")}
        </div>
    `);
}

function abrirDetalheAbandonos(titulo, detalhes) {
    const rotuloTipo = { deslocamento: "Deslocamento", execucao: "Execução" };

    abrirPopupDetalheTecnico(titulo, `
        <div class="lista-tmr-detalhe">
            ${detalhes.map(d => `
                <div class="item-tmr">
                    <button type="button" class="item-recorrencia-os" data-id="${escaparHtml(String(d.ordemId))}">${escaparHtml(String(d.ordemId))}</button>
                    <span class="item-tmr-assunto">${escaparHtml(d.assunto ?? "sem assunto")} — ${rotuloTipo[d.tipo] ?? "Início"}</span>
                    <span class="item-tmr-valor">${formatarDataHora(d.data)}</span>
                </div>
            `).join("")}
        </div>
    `);
}

function abrirPopupDetalheTecnico(titulo, conteudoHtml) {
    document.getElementById("modalTecnicoDetalheTitulo").textContent = titulo;

    const conteudo = document.getElementById("modalTecnicoDetalheConteudo");
    conteudo.innerHTML = conteudoHtml;

    conteudo.querySelectorAll(".item-recorrencia-os").forEach(botao => {
        botao.addEventListener("click", () => abrirOSDaFichaTecnico(botao.dataset.id));
    });

    abrirModalComRetorno("modalTecnicoDetalhe", "modalTecnico");
}

function abrirOSDaFichaTecnico(id) {
    abrirModalOS(id, "modalTecnicoDetalhe");
}
