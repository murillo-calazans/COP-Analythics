/**
 * ==========================================================
 * UI de Gráficos — barra horizontal reutilizável
 * ==========================================================
 * Recebe dados já prontos do IndicatorEngine ([{rotulo, valor}],
 * ordenado do maior pro menor) e desenha. Não calcula nada aqui
 * — só apresenta. Cada gráfico tem alternância "ver como tabela"
 * e tooltip acessível por mouse e teclado (mesma info nos dois).
 */

function renderizarGraficoBarras(containerId, dados, opcoes = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const serie = opcoes.serie ?? "serie-1";
    const limite = opcoes.limite ?? 5;
    const formatoValor = opcoes.formatoValor ?? (v => String(v));

    const lista = dados.slice(0, limite);

    container._dadosGrafico = { dados: lista, formatoValor, opcoesOriginais: opcoes };
    container.dataset.modo = "grafico";

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
}

function alternarVisualizacaoGrafico(containerId) {
    const container = document.getElementById(containerId);
    if (!container || !container._dadosGrafico) return;

    const { dados, formatoValor, opcoesOriginais } = container._dadosGrafico;

    if (container.dataset.modo === "tabela") {
        renderizarGraficoBarras(containerId, dados, opcoesOriginais);
        return;
    }

    container.innerHTML = "";

    const tabela = document.createElement("table");
    tabela.className = "tabela-alertas";

    const cabecalho = document.createElement("thead");
    cabecalho.innerHTML = "<tr><th>Item</th><th>Valor</th></tr>";
    tabela.appendChild(cabecalho);

    const corpo = document.createElement("tbody");
    dados.forEach(item => {
        const tr = document.createElement("tr");

        const tdRotulo = document.createElement("td");
        tdRotulo.textContent = item.rotulo;

        const tdValor = document.createElement("td");
        tdValor.textContent = formatoValor(item.valor);

        tr.appendChild(tdRotulo);
        tr.appendChild(tdValor);
        corpo.appendChild(tr);
    });
    tabela.appendChild(corpo);

    container.appendChild(tabela);
    container.dataset.modo = "tabela";
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

/**
 * Gráfico de linha (tendência ao longo do tempo). Recebe pontos já
 * prontos ([{rotulo, valor}], em ordem cronológica) — não calcula
 * granularidade nem agrupamento aqui, isso é do IndicatorEngine.
 */
function renderizarGraficoLinha(containerId, pontos, opcoes = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const formatoValor = opcoes.formatoValor ?? (v => String(v));
    const cor = opcoes.cor ?? "var(--grafico-serie-1)";

    const validos = pontos.filter(p => p.valor !== null && p.valor !== undefined);

    if (validos.length === 0) {
        container.innerHTML = '<p class="grafico-vazio">Sem dados suficientes ainda.</p>';
        return;
    }

    const larguraTotal = 640;
    const alturaTotal = 220;
    const margem = { topo: 16, base: 28, esquerda: 44, direita: 16 };
    const largura = larguraTotal - margem.esquerda - margem.direita;
    const altura = alturaTotal - margem.topo - margem.base;

    const valores = validos.map(p => p.valor);
    const minValor = Math.min(...valores, 0);
    const maxValor = Math.max(...valores);
    const amplitude = maxValor - minValor || 1;

    const coordX = indice => margem.esquerda +
        (validos.length === 1 ? largura / 2 : (indice / (validos.length - 1)) * largura);
    const coordY = valor => margem.topo + altura - ((valor - minValor) / amplitude) * altura;

    const pontosCoordenadas = validos.map((p, indice) => ({ ...p, x: coordX(indice), y: coordY(p.valor) }));
    const linha = pontosCoordenadas.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

    const niveisGrade = 4;
    const gridlines = Array.from({ length: niveisGrade + 1 }, (_, i) => {
        const valor = minValor + (amplitude * i) / niveisGrade;
        const y = coordY(valor);
        return `<line x1="${margem.esquerda}" y1="${y.toFixed(1)}" x2="${larguraTotal - margem.direita}" y2="${y.toFixed(1)}" class="grafico-linha-grade" />` +
            `<text x="${margem.esquerda - 8}" y="${(y + 4).toFixed(1)}" class="grafico-linha-eixo-texto" text-anchor="end">${escaparHtml(formatoValor(Math.round(valor)))}</text>`;
    }).join("");

    const passoLabel = Math.max(1, Math.ceil(pontosCoordenadas.length / 8));
    const labelsX = pontosCoordenadas
        .filter((_, i) => i % passoLabel === 0 || i === pontosCoordenadas.length - 1)
        .map(p => `<text x="${p.x.toFixed(1)}" y="${alturaTotal - 8}" class="grafico-linha-eixo-texto" text-anchor="middle">${escaparHtml(p.rotulo)}</text>`)
        .join("");

    const marcadores = pontosCoordenadas.map((p, indice) => `
        <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="${cor}"></circle>
        <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="12" fill="transparent"
            class="grafico-linha-hit" data-indice="${indice}" tabindex="0" role="img"
            aria-label="${escaparHtml(p.rotulo)}: ${escaparHtml(formatoValor(p.valor))}"></circle>
    `).join("");

    const ultimo = pontosCoordenadas[pontosCoordenadas.length - 1];

    container.innerHTML = `
        <svg viewBox="0 0 ${larguraTotal} ${alturaTotal}" class="grafico-linha-svg" preserveAspectRatio="none">
            ${gridlines}
            <polyline points="${linha}" fill="none" stroke="${cor}" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round" class="grafico-linha-traco"></polyline>
            ${marcadores}
            ${labelsX}
            <text x="${ultimo.x.toFixed(1)}" y="${(ultimo.y - 10).toFixed(1)}" text-anchor="end"
                class="grafico-linha-valor-final">${escaparHtml(formatoValor(ultimo.valor))}</text>
        </svg>
    `;

    container.querySelectorAll(".grafico-linha-hit").forEach(hit => {
        const item = pontosCoordenadas[Number(hit.dataset.indice)];
        hit.addEventListener("pointerenter", evento => mostrarTooltipGrafico(evento, item, formatoValor));
        hit.addEventListener("pointermove", posicionarTooltipGrafico);
        hit.addEventListener("pointerleave", ocultarTooltipGrafico);
        hit.addEventListener("focus", evento => mostrarTooltipGrafico(evento, item, formatoValor));
        hit.addEventListener("blur", ocultarTooltipGrafico);
    });
}
