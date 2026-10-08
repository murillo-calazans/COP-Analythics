/**
 * ==========================================================
 * UI de Gráficos — barra horizontal reutilizável
 * ==========================================================
 * Recebe dados já prontos do IndicatorEngine ([{rotulo, valor}],
 * ordenado do maior pro menor) e desenha. Não calcula nada aqui
 * — só apresenta. Sempre mostra só os "limite" primeiros (padrão
 * 5) — se tiver mais que isso, aparece um link "Ver todos" que
 * abre a lista completa num popup, pra página não ficar comprida
 * demais com ranking grande (técnico, cidade, assunto, etc.).
 * Tooltip acessível por mouse e teclado.
 *
 * Com opcoes.campoFiltro (ex.: "assuntos", "operadores", "cidades",
 * "diagnosticos" — ver CAMPOS_FILTRO_INTERATIVO em
 * js/ui/filtrointerativo.js), clicar numa barra filtra a tela inteira
 * por ela (Ctrl+clique soma várias), e, com esse campo filtrado, as
 * barras fora do filtro ficam opacas em vez de sumir (realce estilo
 * Power BI — pra isso o gráfico precisa receber os dados calculados
 * SEM esse campo no filtro, ver dadosComRealce). Valor escolhido que
 * ficaria fora do top "limite" entra na lista mesmo assim.
 */

/**
 * Dados de um gráfico com campoFiltro: se o campo estiver filtrado,
 * recalcula ignorando ele (FiltroEngine.ordensFiltradasExceto), senão
 * reaproveita o que já foi calculado pro resto da tela (sem custo extra).
 */
function dadosComRealce(campo, dadosJaCalculados, calcular) {
    if (!campoInterativoAtivo(campo)) return dadosJaCalculados;
    return calcular(FiltroEngine.ordensFiltradasExceto(CAMPOS_FILTRO_INTERATIVO[campo].chaveEstado));
}

function renderizarGraficoBarras(containerId, dados, opcoes = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const serie = opcoes.serie ?? "serie-1";
    const limite = opcoes.limite ?? 5;
    const formatoValor = opcoes.formatoValor ?? (v => String(v));
    const titulo = opcoes.titulo ?? "Lista completa";

    const campoFiltro = opcoes.campoFiltro ?? null;
    const comRealce = campoFiltro !== null && campoInterativoAtivo(campoFiltro);

    container._dadosGrafico = { dados, formatoValor, opcoesOriginais: opcoes, titulo, campoFiltro };

    const lista = dados.slice(0, limite);
    if (comRealce) {
        lista.push(...dados.slice(limite).filter(item => rotuloEstaNoFiltro(campoFiltro, item.rotulo)));
    }

    if (lista.length === 0) {
        container.innerHTML = '<p class="grafico-vazio">Sem dados suficientes ainda.</p>';
        return;
    }

    const maiorValor = Math.max(...lista.map(item => item.valor));

    container.innerHTML = "";

    const corpo = document.createElement("div");
    corpo.className = "grafico-corpo";

    lista.forEach(item => {
        const linha = document.createElement("div");
        const clicavel = Boolean(opcoes.aoClicar || campoFiltro);
        linha.className = clicavel ? "grafico-linha clicavel" : "grafico-linha";
        linha.tabIndex = 0;
        linha.setAttribute("role", clicavel ? "button" : "img");
        linha.setAttribute("aria-label", `${item.rotulo}: ${formatoValor(item.valor)}`);

        if (campoFiltro) {
            // O clique em si é tratado pelo listener delegado de js/ui/filtrointerativo.js.
            linha.classList.add("filtro-clicavel");
            linha.dataset.campo = campoFiltro;
            linha.dataset.valor = item.rotulo;
            linha.title = "Clique pra filtrar — Ctrl+clique pra escolher vários";
            if (comRealce) {
                const escolhido = rotuloEstaNoFiltro(campoFiltro, item.rotulo);
                linha.classList.toggle("barra-opaca", !escolhido);
                linha.setAttribute("aria-pressed", String(escolhido));
            }
        }

        const rotulo = document.createElement("span");
        rotulo.className = "grafico-rotulo";
        rotulo.textContent = item.rotulo;

        const trilha = document.createElement("div");
        trilha.className = "grafico-trilha";

        const barra = document.createElement("div");
        barra.className = `grafico-barra ${serie}`;
        const largura = maiorValor > 0 ? Math.max((item.valor / maiorValor) * 100, 3) : 0;
        barra.style.width = `${largura}%`;
        trilha.appendChild(barra);

        const valor = document.createElement("span");
        valor.className = "grafico-valor";
        valor.textContent = formatoValor(item.valor);

        linha.appendChild(rotulo);
        linha.appendChild(trilha);
        linha.appendChild(valor);

        linha.addEventListener("pointerenter", evento => mostrarTooltipGrafico(evento, item, formatoValor));
        linha.addEventListener("pointermove", posicionarTooltipGrafico);
        linha.addEventListener("pointerleave", ocultarTooltipGrafico);
        linha.addEventListener("focus", evento => mostrarTooltipGrafico(evento, item, formatoValor));
        linha.addEventListener("blur", ocultarTooltipGrafico);

        if (campoFiltro) {
            linha.addEventListener("keydown", evento => {
                if (evento.target !== linha) return; // Enter no botão de ação é dele
                if (evento.key === "Enter" || evento.key === " ") {
                    evento.preventDefault();
                    cliqueFiltroInterativo(campoFiltro, item.rotulo, evento, linha);
                }
            });

            // Clique na barra agora filtra — a ação antiga (ex.: abrir a
            // ficha do técnico) vai pra um botão próprio no fim da linha.
            if (opcoes.aoClicar) {
                linha.classList.add("com-acao");
                const acao = document.createElement("button");
                acao.type = "button";
                acao.className = "grafico-acao";
                acao.dataset.acaoGrafico = "";
                acao.textContent = "›";
                acao.title = opcoes.rotuloAcao ?? "Ver detalhes";
                acao.setAttribute("aria-label", `${opcoes.rotuloAcao ?? "Ver detalhes"}: ${item.rotulo}`);
                acao.addEventListener("click", evento => {
                    evento.stopPropagation();
                    opcoes.aoClicar(item);
                });
                linha.appendChild(acao);
            }
        } else if (opcoes.aoClicar) {
            linha.addEventListener("click", () => opcoes.aoClicar(item));
            linha.addEventListener("keydown", evento => {
                if (evento.key === "Enter" || evento.key === " ") {
                    evento.preventDefault();
                    opcoes.aoClicar(item);
                }
            });
        }

        corpo.appendChild(linha);
    });

    container.appendChild(corpo);

    if (dados.length > limite) {
        const verTodos = document.createElement("button");
        verTodos.type = "button";
        verTodos.className = "grafico-ver-todos";
        verTodos.textContent = `Ver todos (${dados.length})`;
        verTodos.addEventListener("click", () => abrirGraficoCompleto(containerId));
        container.appendChild(verTodos);
    }
}

/**
 * Popup com a lista completa (não só os "limite" primeiros) em tabela.
 * O modal #modalGraficoCompleto é genérico (só título + um container de
 * conteúdo) — também reaproveitado por abrirCategoriaAuditoria
 * (js/ui/auditoriaoperacional.js) pro popup dos cards da Auditoria, com
 * um HTML diferente (duas colunas em vez de tabela).
 */
function abrirGraficoCompleto(containerId) {
    const container = document.getElementById(containerId);
    if (!container || !container._dadosGrafico) return;

    const { dados, formatoValor, titulo, campoFiltro } = container._dadosGrafico;

    document.getElementById("modalGraficoCompletoTitulo").textContent = titulo;

    const conteudo = document.getElementById("modalGraficoCompletoConteudo");
    conteudo.innerHTML = `
        <table class="tabela-alertas">
            <thead>
                <tr><th>Item</th><th>Valor</th></tr>
            </thead>
            <tbody>
                ${dados.map(item => `
                    <tr>
                        <td>${campoFiltro
                            ? `<span class="filtro-clicavel" data-campo="${campoFiltro}" data-valor="${escaparHtml(String(item.rotulo))}" title="Clique pra filtrar">${escaparHtml(String(item.rotulo))}</span>`
                            : escaparHtml(String(item.rotulo))}</td>
                        <td>${escaparHtml(String(formatoValor(item.valor)))}</td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
    `;

    abrirModal("modalGraficoCompleto");
}

function garantirTooltipGrafico() {
    let tooltip = document.getElementById("graficoTooltip");
    if (!tooltip) {
        tooltip = document.createElement("div");
        tooltip.id = "graficoTooltip";
        tooltip.className = "grafico-tooltip";
        document.body.appendChild(tooltip);
    }
    return tooltip;
}

function mostrarTooltipGrafico(evento, item, formatoValor) {
    const tooltip = garantirTooltipGrafico();
    tooltip.textContent = "";

    tooltip.appendChild(document.createTextNode(`${item.rotulo}: `));

    const forte = document.createElement("strong");
    forte.textContent = formatoValor(item.valor);
    tooltip.appendChild(forte);

    tooltip.classList.add("visivel");
    posicionarTooltipGrafico(evento);
}

function posicionarTooltipGrafico(evento) {
    const tooltip = document.getElementById("graficoTooltip");
    if (!tooltip) return;

    const alvo = evento.currentTarget?.getBoundingClientRect?.();
    const x = typeof evento.clientX === "number" && evento.clientX > 0
        ? evento.clientX
        : (alvo ? alvo.left + alvo.width / 2 : 0);
    const y = typeof evento.clientY === "number" && evento.clientY > 0
        ? evento.clientY
        : (alvo ? alvo.top : 0);

    tooltip.style.left = `${x + 12}px`;
    tooltip.style.top = `${y - 28}px`;
}

function ocultarTooltipGrafico() {
    const tooltip = document.getElementById("graficoTooltip");
    if (tooltip) tooltip.classList.remove("visivel");
}
