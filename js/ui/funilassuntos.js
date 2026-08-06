/**
 * ==========================================================
 * UI do Funil de Assuntos
 * ==========================================================
 * "Depois de uma OS com assunto de origem (ex.: Instalação Novo
 * Cliente), o cliente abriu uma OS com assunto de destino (ex.:
 * Sem Conexão LOS)?" — mede qualidade de instalação/transferência.
 * Assuntos configuráveis via busca+chips (mesmo padrão visual do
 * Filtro Global), porque o texto exato varia por operação.
 */

let _funilPendente = { origem: [], destino: [] };

/**
 * Só cuida do que é permanente na página (o modal e seus campos de
 * busca) — o botão "Configurar" fica dentro da aba Indicadores, que é
 * remontada via innerHTML toda vez, então esse botão é religado em
 * cada renderizarSecaoIndicadores() (ver js/ui/indicadores.js).
 */
function registrarFunilAssuntos() {
    const botaoSalvar = document.getElementById("btnSalvarFunilAssuntos");
    if (botaoSalvar) botaoSalvar.addEventListener("click", salvarFunilAssuntosDaTela);

    ["funilOrigem", "funilDestino"].forEach(registrarBuscaFunil);
}

function registrarBuscaFunil(chave) {
    const busca = document.getElementById(`busca-${chave}`);
    if (!busca) return;

    busca.addEventListener("focus", () => renderizarDropdownFunil(chave));
    busca.addEventListener("input", () => renderizarDropdownFunil(chave));
    busca.addEventListener("blur", () => {
        setTimeout(() => {
            const dropdown = document.getElementById(`dropdown-${chave}`);
            if (dropdown) dropdown.hidden = true;
        }, 150);
    });
}

function campoFunil(chave) {
    return chave === "funilOrigem" ? "origem" : "destino";
}

function abrirModalFunilAssuntos() {
    const salvo = APP.configuracoes.funilAssuntos ?? { origem: [], destino: [] };
    _funilPendente = { origem: [...salvo.origem], destino: [...salvo.destino] };

    ["funilOrigem", "funilDestino"].forEach(chave => {
        const busca = document.getElementById(`busca-${chave}`);
        if (busca) busca.value = "";

        renderizarChipsFunil(chave);

        const dropdown = document.getElementById(`dropdown-${chave}`);
        if (dropdown) dropdown.hidden = true;
    });

    abrirModal("modalFunilAssuntos");
}

function renderizarChipsFunil(chave) {
    const container = document.getElementById(`chips-${chave}`);
    if (!container) return;

    const campo = campoFunil(chave);
    const selecionados = _funilPendente[campo];

    container.innerHTML = selecionados.map(valor => `
        <span class="chip-selecionado" data-valor="${escaparHtml(valor)}">
            ${escaparHtml(valor)}
            <button type="button" aria-label="Remover ${escaparHtml(valor)}">&times;</button>
        </span>
    `).join("");

    container.querySelectorAll(".chip-selecionado button").forEach(botao => {
        botao.addEventListener("click", () => {
            const valor = botao.parentElement.dataset.valor;
            _funilPendente[campo] = _funilPendente[campo].filter(v => v !== valor);
            renderizarChipsFunil(chave);
            renderizarDropdownFunil(chave);
        });
    });
}

function renderizarDropdownFunil(chave) {
    const dropdown = document.getElementById(`dropdown-${chave}`);
    const busca = document.getElementById(`busca-${chave}`);
    if (!dropdown || !busca) return;

    const campo = campoFunil(chave);
    const todasOpcoes = coletarAssuntosDistintos();
    const selecionados = _funilPendente[campo];
    const termoNormalizado = normalizarTexto(busca.value);

    const disponiveis = todasOpcoes
        .filter(opcao => !selecionados.includes(opcao))
        .filter(opcao => !termoNormalizado || normalizarTexto(opcao).includes(termoNormalizado))
        .slice(0, 50);

    if (todasOpcoes.length === 0) {
        dropdown.innerHTML = '<div class="seletor-multiplo-vazio">Importe dados pra ver as opções.</div>';
    } else if (disponiveis.length === 0) {
        dropdown.innerHTML = '<div class="seletor-multiplo-vazio">Nenhuma opção encontrada.</div>';
    } else {
        dropdown.innerHTML = disponiveis.map(opcao => `
            <div class="seletor-multiplo-opcao" data-valor="${escaparHtml(opcao)}">${escaparHtml(opcao)}</div>
        `).join("");

        dropdown.querySelectorAll(".seletor-multiplo-opcao").forEach(item => {
            item.addEventListener("mousedown", evento => {
                evento.preventDefault();
                if (!_funilPendente[campo].includes(item.dataset.valor)) {
                    _funilPendente[campo].push(item.dataset.valor);
                }
                busca.value = "";
                renderizarChipsFunil(chave);
                renderizarDropdownFunil(chave);
            });
        });
    }

    dropdown.hidden = false;
}

function salvarFunilAssuntosDaTela() {
    APP.configuracoes.funilAssuntos = {
        origem: [..._funilPendente.origem],
        destino: [..._funilPendente.destino]
    };

    salvarFunilAssuntos(APP.configuracoes.funilAssuntos);
    fecharModal("modalFunilAssuntos");
    renderizarFunilAssuntosResultado();
}

function renderizarFunilAssuntosResultado() {
    const container = document.getElementById("funilAssuntosConteudo");
    const subtitulo = document.getElementById("funilAssuntosSubtitulo");
    if (!container) return;

    const config = APP.configuracoes.funilAssuntos ?? { origem: [], destino: [] };

    if (config.origem.length === 0 || config.destino.length === 0) {
        if (subtitulo) subtitulo.textContent = "Configure os assuntos de origem e destino pra calcular";
        container.innerHTML = '<p class="alerta-vazio">Clique em "Configurar" pra escolher os assuntos.</p>';
        return;
    }

    if (subtitulo) {
        subtitulo.textContent =
            `${config.origem.join(", ")} → ${config.destino.join(", ")} (até ${IndicatorEngine.LIMITE_DIAS_RECORRENCIA} dias depois)`;
    }

    if (!APP.status.baseCarregada || APP.dados.ordens.size === 0) {
        container.innerHTML = '<p class="alerta-vazio">Importe dados pra calcular.</p>';
        return;
    }

    const resultado = IndicatorEngine.calcularFunilAssuntos(FiltroEngine.ordensFiltradas());

    if (resultado.ocorrencias.length === 0) {
        container.innerHTML = '<p class="alerta-vazio">Nenhum cliente encontrado com esse padrão nos dados atuais.</p>';
        return;
    }

    const linhas = resultado.ocorrencias.map(o => `
        <tr>
            <td>${escaparHtml(o.cliente ?? "(sem nome)")}</td>
            <td>${escaparHtml(o.login)}</td>
            <td>
                <button type="button" class="item-recorrencia-os" data-id="${escaparHtml(String(o.ordemOrigemId))}">${escaparHtml(String(o.ordemOrigemId))}</button>
                <span class="item-recorrencia-assunto">${escaparHtml(o.assuntoOrigem)}</span>
            </td>
            <td>
                <button type="button" class="item-recorrencia-os" data-id="${escaparHtml(String(o.ordemDestinoId))}">${escaparHtml(String(o.ordemDestinoId))}</button>
                <span class="item-recorrencia-assunto">${escaparHtml(o.assuntoDestino)}</span>
            </td>
        </tr>
    `).join("");

    container.innerHTML = `
        <p class="resultados-contagem">${resultado.totalClientes} cliente(s) distinto(s) — ${resultado.ocorrencias.length} ocorrência(s).</p>
        <table class="tabela-alertas">
            <thead>
                <tr><th>Cliente</th><th>Login</th><th>OS de origem</th><th>OS de destino</th></tr>
            </thead>
            <tbody>${linhas}</tbody>
        </table>
    `;

    container.querySelectorAll(".item-recorrencia-os").forEach(botao => {
        botao.addEventListener("click", () => abrirModalOS(botao.dataset.id));
    });
}
