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
 */

function renderizarGraficoBarras(containerId, dados, opcoes = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const serie = opcoes.serie ?? "serie-1";
    const limite = opcoes.limite ?? 5;
    const formatoValor = opcoes.formatoValor ?? (v => String(v));
    const titulo = opcoes.titulo ?? "Lista completa";

    container._dadosGrafico = { dados, formatoValor, opcoesOriginais: opcoes, titulo };

    const lista = dados.slice(0, limite);

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
        linha.className = opcoes.aoClicar ? "grafico-linha clicavel" : "grafico-linha";
        linha.tabIndex = 0;
        linha.setAttribute("role", opcoes.aoClicar ? "button" : "img");
        linha.setAttribute("aria-label", `${item.rotulo}: ${formatoValor(item.valor)}`);

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

        if (opcoes.aoClicar) {
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

/** Popup com a lista completa (não só os "limite" primeiros) em tabela. */
function abrirGraficoCompleto(containerId) {
    const container = document.getElementById(containerId);
    if (!container || !container._dadosGrafico) return;

    const { dados, formatoValor, titulo } = container._dadosGrafico;

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
                        <td>${escaparHtml(String(item.rotulo))}</td>
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
