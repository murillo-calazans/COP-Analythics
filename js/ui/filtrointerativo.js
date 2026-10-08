/**
 * ==========================================================
 * Filtro Global interativo (estilo Power BI)
 * ==========================================================
 * Três coisas em cima do Filtro Global que já existe (estado em
 * APP.filtrosGlobais, popup em js/ui/filtroperiodo.js):
 *
 * 1. Etiquetas dos filtros ativos sempre visíveis ao lado do botão do
 *    Filtro Global (no celular, um botão flutuante com o resumo), cada
 *    uma com × pra remover.
 * 2. Clicar pra filtrar: barra de gráfico (opção campoFiltro de
 *    renderizarGraficoBarras) ou nome em tabela (.filtro-clicavel com
 *    data-campo/data-valor, um listener delegado só). Clique simples =
 *    o campo passa a ser SÓ aquele valor; clicar de novo no mesmo
 *    valor remove.
 * 3. Ctrl/Shift/Cmd + clique só MARCA o valor (sem redesenhar a tela,
 *    pra continuar dando pra clicar nas outras barras) — aplica tudo
 *    de uma vez ao soltar a tecla ou quando a janela perde o foco.
 *
 * Não muda regra nenhuma de filtro (período/fechamento efetivo etc.
 * continuam no FiltroEngine) — só escreve em APP.filtrosGlobais e
 * chama atualizarBadgeFiltroGlobal()/atualizarTodasAsTelas(), igual o
 * botão "Aplicar" do popup.
 *
 * Diagnóstico é invertido (APP.filtrosGlobais.diagnosticosOcultos
 * guarda os OCULTOS, normalizados): "filtrar por um diagnóstico" =
 * ocultar todos os outros.
 */

// Chave usada em campoFiltro / data-campo -> onde fica no estado e nas opções.
const CAMPOS_FILTRO_INTERATIVO = {
    assuntos: { rotulo: "Assunto", chaveEstado: "assuntos", chaveOpcoes: "assuntos" },
    cidades: { rotulo: "Cidade", chaveEstado: "cidades", chaveOpcoes: "cidades" },
    bairros: { rotulo: "Bairro", chaveEstado: "bairros", chaveOpcoes: "bairros" },
    operadores: { rotulo: "Colaborador", chaveEstado: "operadores", chaveOpcoes: "operadores" },
    setores: { rotulo: "Setor", chaveEstado: "setores", chaveOpcoes: "setores" },
    diagnosticos: { rotulo: "Diagnóstico", chaveEstado: "diagnosticosOcultos", chaveOpcoes: "diagnosticos", invertido: true }
};

// Acima disso, o campo vira uma etiqueta só ("Assunto: 5 selecionados").
const MAXIMO_ETIQUETAS_POR_CAMPO = 3;

// Seleção com Ctrl ainda não aplicada: campo -> Set de valores (já resolvidos).
let _selecaoPendenteCtrl = new Map();

// FiltroEngine.coletarOpcoes passa por TODAS as OS — guarda até os dados mudarem.
let _cacheOpcoesInterativo = { ordens: null, total: -1, opcoes: null };

function opcoesFiltroInterativo() {
    const ordens = APP.dados.ordens;
    if (_cacheOpcoesInterativo.ordens !== ordens || _cacheOpcoesInterativo.total !== ordens.size) {
        _cacheOpcoesInterativo = { ordens, total: ordens.size, opcoes: FiltroEngine.coletarOpcoes(ordens) };
    }
    return _cacheOpcoesInterativo.opcoes;
}

function rotuloCortado(rotulo) {
    const texto = String(rotulo ?? "").trim();
    if (texto.endsWith("…")) return texto.slice(0, -1);
    if (texto.endsWith("...")) return texto.slice(0, -3);
    return null;
}

/** O rótulo (de barra ou célula) bate com esse valor? Normalizado, aceitando rótulo cortado ("Instalação nov…"). */
function rotuloBateComValor(rotulo, valor) {
    const valorNormalizado = normalizarTexto(String(valor ?? ""));
    const prefixo = rotuloCortado(rotulo);
    if (prefixo !== null) return valorNormalizado.startsWith(normalizarTexto(prefixo));
    return normalizarTexto(String(rotulo ?? "")) === valorNormalizado;
}

/** Valor "oficial" do filtro (grafia das opções do popup) pra um rótulo; o próprio rótulo se não achar nenhum. */
function resolverValorFiltro(campo, rotulo) {
    const opcoes = opcoesFiltroInterativo()[CAMPOS_FILTRO_INTERATIVO[campo].chaveOpcoes] ?? [];
    return opcoes.find(opcao => rotuloBateComValor(rotulo, opcao)) ?? rotuloCortado(rotulo) ?? String(rotulo);
}

/** Valores hoje "escolhidos" no campo — pra diagnóstico, os VISÍVEIS (vazio = sem filtro nesse campo). */
function valoresSelecionadosCampo(campo) {
    const config = CAMPOS_FILTRO_INTERATIVO[campo];
    const atuais = APP.filtrosGlobais[config.chaveEstado] ?? [];
    if (!config.invertido) return [...atuais];
    if (atuais.length === 0) return [];

    // Uma entrada por diagnóstico normalizado — grafias que só diferem em
    // acento/espaço (ex.: "FECHAMENTO CORRETO" e "FECHAMENTO CORRETO ")
    // são o mesmo diagnóstico pro filtro.
    const ocultos = new Set(atuais);
    const visiveis = new Map();
    for (const d of opcoesFiltroInterativo().diagnosticos ?? []) {
        const chave = normalizarTexto(d);
        if (!ocultos.has(chave) && !visiveis.has(chave)) visiveis.set(chave, d);
    }
    return [...visiveis.values()];
}

/** Pro realce dos gráficos: o rótulo está entre os valores escolhidos nesse campo? */
function rotuloEstaNoFiltro(campo, rotulo) {
    const config = CAMPOS_FILTRO_INTERATIVO[campo];
    const atuais = APP.filtrosGlobais[config.chaveEstado] ?? [];
    if (config.invertido) return !atuais.some(oculto => rotuloBateComValor(rotulo, oculto));
    return atuais.some(valor => rotuloBateComValor(rotulo, valor));
}

function campoInterativoAtivo(campo) {
    const config = CAMPOS_FILTRO_INTERATIVO[campo];
    return Boolean(config) && FiltroEngine.campoAtivo(config.chaveEstado);
}

/** Grava os valores escolhidos de um campo em APP.filtrosGlobais (objeto novo, nunca mutação). */
function definirValoresCampo(campo, valores) {
    const config = CAMPOS_FILTRO_INTERATIVO[campo];
    let novoValor;

    if (config.invertido) {
        if (valores.length === 0) {
            novoValor = [];
        } else {
            const visiveis = new Set(valores.map(v => normalizarTexto(v)));
            novoValor = (opcoesFiltroInterativo().diagnosticos ?? [])
                .map(d => normalizarTexto(d))
                .filter(chave => !visiveis.has(chave));
        }
    } else {
        novoValor = [...valores];
    }

    APP.filtrosGlobais = { ...APP.filtrosGlobais, [config.chaveEstado]: novoValor };
}

function aplicarFiltroInterativo() {
    atualizarBadgeFiltroGlobal();
    atualizarTodasAsTelas();
}

/**
 * Ponto de entrada do clique (gráfico ou tabela). Com Ctrl/Shift/Cmd
 * só marca e espera soltar a tecla; sem, aplica na hora.
 */
function cliqueFiltroInterativo(campo, rotulo, evento, elemento) {
    if (!CAMPOS_FILTRO_INTERATIVO[campo] || APP.dados.ordens.size === 0) return;

    const valor = resolverValorFiltro(campo, rotulo);
    const multiplo = Boolean(evento && (evento.ctrlKey || evento.shiftKey || evento.metaKey));

    if (multiplo) {
        marcarPendenteCtrl(campo, valor, elemento);
        return;
    }

    // Clique simples no meio de uma seleção com Ctrl ainda pendente: aplica a pendente primeiro.
    if (_selecaoPendenteCtrl.size > 0) aplicarSelecaoPendenteCtrl(false);

    const atuais = valoresSelecionadosCampo(campo);
    const jaEraSoEsse = atuais.length === 1 && normalizarTexto(atuais[0]) === normalizarTexto(valor);

    definirValoresCampo(campo, jaEraSoEsse ? [] : [valor]);
    aplicarFiltroInterativo();
}

function marcarPendenteCtrl(campo, valor, elemento) {
    if (!_selecaoPendenteCtrl.has(campo)) {
        // Parte do que já está filtrado nesse campo (igual o Ctrl do Power BI: soma à seleção).
        _selecaoPendenteCtrl.set(campo, new Map(valoresSelecionadosCampo(campo).map(v => [normalizarTexto(v), v])));
    }

    const selecao = _selecaoPendenteCtrl.get(campo);
    const chave = normalizarTexto(valor);
    if (selecao.has(chave)) selecao.delete(chave);
    else selecao.set(chave, valor);

    if (elemento) elemento.classList.toggle("filtro-pendente", selecao.has(chave));
    mostrarAvisoCtrl();
}

function aplicarSelecaoPendenteCtrl(redesenhar = true) {
    if (_selecaoPendenteCtrl.size === 0) return;

    for (const [campo, selecao] of _selecaoPendenteCtrl) {
        definirValoresCampo(campo, [...selecao.values()]);
    }

    _selecaoPendenteCtrl = new Map();
    document.querySelectorAll(".filtro-pendente").forEach(el => el.classList.remove("filtro-pendente"));
    esconderAvisoCtrl();

    if (redesenhar) aplicarFiltroInterativo();
}

function mostrarAvisoCtrl() {
    const aviso = document.getElementById("avisoFiltroCtrl");
    if (!aviso) return;

    const partes = [..._selecaoPendenteCtrl].map(([campo, selecao]) =>
        `${CAMPOS_FILTRO_INTERATIVO[campo].rotulo}: ${selecao.size} selecionado(s)`
    );
    aviso.textContent = `${partes.join(" · ")} — solte o Ctrl para aplicar`;
    aviso.hidden = false;
}

function esconderAvisoCtrl() {
    const aviso = document.getElementById("avisoFiltroCtrl");
    if (aviso) aviso.hidden = true;
}

/**
 * HTML de um valor de tabela clicável pra filtrar (Ordens, Técnicos,
 * Auditoria) — o clique é tratado pelo listener delegado lá embaixo.
 */
function textoFiltravel(campo, valor) {
    if (valor === null || valor === undefined || valor === "") return "-";
    const texto = escaparHtml(String(valor));
    return `<span class="filtro-clicavel" data-campo="${campo}" data-valor="${texto}" title="Clique pra filtrar o painel por este valor — Ctrl+clique pra escolher vários">${texto}</span>`;
}

/* ---------------------------------------------------------
 * Etiquetas dos filtros ativos
 * ------------------------------------------------------- */

function formatarDataCurta(data) {
    return data ? data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "…";
}

/** Uma entrada por etiqueta: { texto, titulo, remover() }. */
function montarEtiquetasFiltrosAtivos() {
    const filtros = APP.filtrosGlobais;
    const etiquetas = [];

    if (filtros.dataInicio || filtros.dataFim) {
        etiquetas.push({
            texto: `Período: ${formatarDataCurta(filtros.dataInicio)} a ${formatarDataCurta(filtros.dataFim)}`,
            titulo: "Remover o período (passa a mostrar todo o histórico)",
            remover: () => { APP.filtrosGlobais = { ...APP.filtrosGlobais, dataInicio: null, dataFim: null }; }
        });
    }

    for (const [campo, config] of Object.entries(CAMPOS_FILTRO_INTERATIVO)) {
        const valores = filtros[config.chaveEstado] ?? [];
        if (valores.length === 0) continue;

        if (config.invertido) {
            etiquetas.push({
                texto: `Diagnósticos ocultos: ${valores.length}`,
                titulo: `Visíveis: ${valoresSelecionadosCampo(campo).join(", ") || "nenhum"}`,
                remover: () => definirValoresCampo(campo, [])
            });
        } else if (valores.length > MAXIMO_ETIQUETAS_POR_CAMPO) {
            etiquetas.push({
                texto: `${config.rotulo}: ${valores.length} selecionados`,
                titulo: valores.join("\n"),
                remover: () => definirValoresCampo(campo, [])
            });
        } else {
            for (const valor of valores) {
                etiquetas.push({
                    texto: `${config.rotulo}: ${valor}`,
                    titulo: valor,
                    remover: () => definirValoresCampo(campo, valoresSelecionadosCampo(campo).filter(v => v !== valor))
                });
            }
        }
    }

    return etiquetas;
}

let _etiquetasFiltrosAtivos = [];

function renderizarFiltrosAtivos() {
    _etiquetasFiltrosAtivos = montarEtiquetasFiltrosAtivos();

    const barra = document.getElementById("barraFiltrosAtivos");
    if (barra) {
        barra.hidden = _etiquetasFiltrosAtivos.length === 0;
        barra.innerHTML = _etiquetasFiltrosAtivos.map((etiqueta, i) => `
            <span class="etiqueta-filtro" title="${escaparHtml(etiqueta.titulo)}">
                <span class="etiqueta-filtro-texto">${escaparHtml(etiqueta.texto)}</span>
                <button type="button" class="etiqueta-filtro-remover" data-etiqueta-filtro="${i}" aria-label="Remover ${escaparHtml(etiqueta.texto)}">×</button>
            </span>
        `).join("") + (_etiquetasFiltrosAtivos.length > 1
            ? '<button type="button" class="etiqueta-filtro-limpar" data-limpar-filtros>Limpar tudo</button>'
            : "");
    }

    const flutuante = document.getElementById("filtroFlutuante");
    if (flutuante) {
        flutuante.hidden = _etiquetasFiltrosAtivos.length === 0;
        const resumo = document.getElementById("filtroFlutuanteResumo");
        if (resumo) {
            resumo.textContent = _etiquetasFiltrosAtivos.length === 1
                ? _etiquetasFiltrosAtivos[0].texto
                : `${_etiquetasFiltrosAtivos.length} filtros ativos`;
            resumo.title = _etiquetasFiltrosAtivos.map(e => e.texto).join("\n");
        }
    }
}

/* ---------------------------------------------------------
 * Listeners (1x, no início do app)
 * ------------------------------------------------------- */

function registrarFiltroInterativo() {
    // Captura (3º argumento true): roda ANTES do listener da linha da
    // tabela (que abre o detalhe da OS/técnico) e impede que ele rode —
    // clicar no nome filtra, clicar no resto da linha continua abrindo.
    document.addEventListener("click", evento => {
        if (evento.target.closest("[data-acao-grafico]")) return; // botão "ver detalhes" dentro da barra
        const alvo = evento.target.closest(".filtro-clicavel[data-campo]");
        if (!alvo) return;

        evento.preventDefault();
        evento.stopPropagation();

        // Popup "Ver todos" de um gráfico fica com dado velho depois de filtrar — fecha num clique simples.
        const multiplo = evento.ctrlKey || evento.shiftKey || evento.metaKey;
        if (!multiplo && alvo.closest("#modalGraficoCompleto")) fecharModal("modalGraficoCompleto");

        cliqueFiltroInterativo(alvo.dataset.campo, alvo.dataset.valor, evento, alvo);
    }, true);

    document.addEventListener("click", evento => {
        const remover = evento.target.closest("[data-etiqueta-filtro]");
        if (remover) {
            const etiqueta = _etiquetasFiltrosAtivos[Number(remover.dataset.etiquetaFiltro)];
            if (!etiqueta) return;
            etiqueta.remover();
            aplicarFiltroInterativo();
            return;
        }

        if (evento.target.closest("[data-limpar-filtros]")) limparFiltroGlobal();
    });

    document.addEventListener("keyup", evento => {
        if (!evento.ctrlKey && !evento.shiftKey && !evento.metaKey) aplicarSelecaoPendenteCtrl();
    });
    window.addEventListener("blur", () => aplicarSelecaoPendenteCtrl());

    document.getElementById("filtroFlutuanteResumo")?.addEventListener("click", abrirFiltroGlobal);

    renderizarFiltrosAtivos();
}
