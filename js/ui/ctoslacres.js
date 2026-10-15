/**
 * ==========================================================
 * UI de CTOs e Lacres (módulo Gestão de Clientes)
 * ==========================================================
 * Toda OS de instalação (também transferência de endereço e mudança de
 * tecnologia) cujo texto de fechamento traz um número de LACRE vira uma
 * linha: OS, Cliente, Diagnóstico, Login, CTO (localização), Porta,
 * Lacre e Status (Pendente/Cadastrado) — mesma estrutura da antiga
 * ferramenta avulsa cadastro-instalacao.html, mas lendo direto das OS
 * já importadas, sem subir planilha.
 *
 * O técnico preenche o fechamento sempre no mesmo modelo ("NUMERO DO
 * LACRE: 123 POTÊNCIA: -20 PORTA DA CTO: 4 LOCALIZAÇÃO DA CTO: ...");
 * os campos saem por posição (ver extrairCamposFechamentoCto). As OS de
 * AUDITORIA INSTALAÇÃO/TRANSFERÊNCIA ficam de fora: elas repetem o texto
 * da OS original ("Descrição OS anterior") e duplicariam a instalação.
 *
 * Status e correções manuais (login/CTO/porta/lacre) ficam no Supabase
 * (tabela ctos_lacres_cadastro, database/patch-24-ctos-lacres.sql),
 * iguais pra todos. Leitor só vê; admin/editor edita.
 *
 * Independente do Filtro Global — filtro próprio (período, busca,
 * status, diagnóstico, tipo), igual Alertas e Ordens.
 */

const ROTULOS_FECHAMENTO_CTO = [
    { chave: "organizado", regex: /DEIXOU\s+O\s+LOCAL\s+ORGANIZADO\s*\?\s*(?:SIM|N[ÃA]O)?\s*\([^)]*\)\s*(?:SIM|N[ÃA]O)?\s*\([^)]*\)/i },
    { chave: "lacre", regex: /N[UÚ]MERO\s+DO\s+LACRE\s*:?/i },
    { chave: "potencia", regex: /POT[ÊE]NCIA\s*:?/i },
    { chave: "porta", regex: /PORTA\s+DA\s+CTO\s*:?/i },
    { chave: "ctoLoc", regex: /LOCALIZA[ÇC][ÃA]O\s+DA\s+CTO\s*:?/i },
    { chave: "casaLoc", regex: /LOCALIZA[ÇC][ÃA]O\s+D[AO]\s+(?:(?:CASA|RESID[ÊE]NCIA)\s+DO\s+)?CLIENTE\s*:?/i },
    { chave: "localInstalado", regex: /(?:LOCAL\s+(?:ONDE\s+FOI\s+)?INSTALADO|AONDE\s+FOI\s+INSTALADO)\s*:?/i },
    { chave: "observacoes", regex: /OBSERVA[ÇC](?:[ÕO]ES|[ÃA]O)\s*:?/i }
];

// Fora do modelo ("Porta 1 Cto -22,5... OBS: ..."): só vale quando o rótulo
// oficial do mesmo campo não aparece, e nunca dentro de outro rótulo já achado
// (o "CTO" de "PORTA DA CTO", por exemplo).
const ROTULOS_FECHAMENTO_CTO_ALTERNATIVOS = [
    { chave: "porta", regex: /\bPORTA\b\s*:?/gi },
    { chave: "ctoLoc", regex: /\bCTO\b\s*:?/gi },
    { chave: "observacoes", regex: /\bOBS\b\.?\s*:?/gi }
];

const REGEX_ROTULO_LACRE = /N[UÚ]MERO\s+DO\s+LACRE/i;
// "-22.4652, -42.6535", "(-22.72, -42.66)" ou com vírgula decimal "-22,4652539, -42,6535331".
const REGEX_COORDENADA_CTO = /^\(?\s*-?\d{1,3}\.\d+\s*,\s*-?\d{1,3}\.\d+\s*\)?|^\(?\s*-?\d{1,3},\d+\s*[,;]?\s+-?\d{1,3},\d+\s*\)?/;
const REGEX_PLUS_CODE_CTO = /^[23456789CFGHJMPQRVWX]{4}\+[23456789CFGHJMPQRVWX]{2,3}(?:\s+[^,:]+,\s*[A-Z]{2}\b)?/i;

// Assunto (já normalizado) que entra / que fica de fora mesmo batendo no primeiro.
const ASSUNTOS_CTO_LACRE = /INSTALACAO|TRANSFERENCIA DE ENDERECO|MUDANCA DE TECNOLOGIA/;
const ASSUNTOS_CTO_LACRE_FORA = /AUDITORIA|NAO CONCLUIDA|REPARO|POS TERCEIRIZADA|GARANTIA/;

const LIMITE_LINHAS_CTOS = 300;

let _ctosLinhasCache = [];
let _ctosCadastro = new Map(); // os_id -> linha de ctos_lacres_cadastro
let _ctosErroBanco = null;
let _ctosRenderToken = 0;

/** Lacre / porta / localização da CTO a partir do texto livre do fechamento. */
function extrairCamposFechamentoCto(texto) {
    const resultado = { lacre: "", porta: "", cto: "" };
    if (!texto) return resultado;

    const encontrados = [];
    for (const { chave, regex } of ROTULOS_FECHAMENTO_CTO) {
        const m = texto.match(regex);
        if (m) encontrados.push({ chave, inicio: m.index, fim: m.index + m[0].length });
    }
    for (const { chave, regex } of ROTULOS_FECHAMENTO_CTO_ALTERNATIVOS) {
        if (encontrados.some(e => e.chave === chave)) continue;
        const m = [...texto.matchAll(regex)].find(m =>
            !encontrados.some(e => m.index < e.fim && m.index + m[0].length > e.inicio));
        if (m) encontrados.push({ chave, inicio: m.index, fim: m.index + m[0].length });
    }
    encontrados.sort((a, b) => a.inicio - b.inicio);

    const valores = {};
    encontrados.forEach((atual, i) => {
        const proximoInicio = i + 1 < encontrados.length ? encontrados[i + 1].inicio : texto.length;
        // Não tira "-" das pontas: coordenada de GPS começa com "-" (hemisfério sul/oeste).
        valores[atual.chave] = texto.slice(atual.fim, proximoInicio).trim().replace(/^:\s*/, "").trim();
    });

    // Lacre e porta são códigos curtos: fica só o número quando vem texto colado depois.
    resultado.lacre = (valores.lacre || "").match(/\d[\d.\-/]*/)?.[0] ?? (valores.lacre || "");
    resultado.porta = (valores.porta || "").match(/^\d+/)?.[0] ?? (valores.porta || "");
    // CTO como coordenada ou plus code seguida de texto livre: fica só a localização.
    const cto = valores.ctoLoc || "";
    resultado.cto = cto.match(REGEX_COORDENADA_CTO)?.[0].trim() ?? cto.match(REGEX_PLUS_CODE_CTO)?.[0].trim() ?? cto;
    return resultado;
}

/** "não tem", "-", vazio… não contam como lacre — só valor com número. */
function lacreInformado(lacre) {
    return /\d/.test(lacre ?? "");
}

function assuntoTemCtoLacre(assunto) {
    const n = normalizarTexto(assunto ?? "");
    return ASSUNTOS_CTO_LACRE.test(n) && !ASSUNTOS_CTO_LACRE_FORA.test(n);
}

function tipoCtoLacre(assunto) {
    const n = normalizarTexto(assunto ?? "");
    if (n.includes("TRANSFERENCIA")) return "Transferência de endereço";
    if (n.includes("MUDANCA DE TECNOLOGIA")) return "Mudança de tecnologia";
    return "Instalação";
}

/** Mensagem com o modelo do lacre: a do fechamento efetivo; se não tiver, a mais recente que tiver. */
function mensagemComLacre(ordem, fechamento) {
    if (fechamento?.mensagem && REGEX_ROTULO_LACRE.test(fechamento.mensagem)) return fechamento;
    let melhor = null;
    for (const mov of ordem.movimentacoes) {
        if (!mov.mensagem || !REGEX_ROTULO_LACRE.test(mov.mensagem)) continue;
        if (!melhor || (mov.data && (!melhor.data || mov.data > melhor.data))) melhor = mov;
    }
    return melhor;
}

function calcularLinhasCtos() {
    _ctosLinhasCache = [];

    for (const ordem of APP.dados.ordens.values()) {
        if (!assuntoTemCtoLacre(ordem.assunto)) continue;

        const fechamento = FiltroEngine.fechamentoEfetivoDaOrdem(ordem);
        const fonte = mensagemComLacre(ordem, fechamento);
        if (!fonte) continue;

        const extraido = extrairCamposFechamentoCto(fonte.mensagem);
        if (!lacreInformado(extraido.lacre)) continue;

        const diagnostico = fechamento
            ? AuditEngine.resolverReferencia(APP.referencias.diagnosticos, fechamento.diagnostico, CONFIG_BASE.diagnosticos.nome)
            : null;

        _ctosLinhasCache.push({
            id: String(ordem.id),
            cliente: ordem.cliente ?? "",
            assunto: ordem.assunto ?? "",
            tipo: tipoCtoLacre(ordem.assunto),
            diagnostico: diagnostico ?? "",
            tecnico: fechamento ? (IndicatorEngine.nomeResponsavelFechamento(fechamento) ?? "") : "",
            dataFinal: fechamento?.data ?? fonte.data ?? null,
            extraido: { login: ordem.login ?? "", ...extraido }
        });
    }

    _ctosLinhasCache.sort((a, b) => (b.dataFinal?.getTime() ?? -1) - (a.dataFinal?.getTime() ?? -1));
}

/** Valor exibido: correção manual salva no banco, senão o que veio da OS. */
function valorCto(linha, campo) {
    const salvo = _ctosCadastro.get(linha.id)?.[campo];
    return salvo !== null && salvo !== undefined ? salvo : linha.extraido[campo];
}

function cadastradoCto(linha) {
    return _ctosCadastro.get(linha.id)?.cadastrado === true;
}

async function carregarCadastroCtos() {
    const mapa = new Map();
    const pagina = 1000;
    for (let inicio = 0; ; inicio += pagina) {
        const { data, error } = await supabaseClient
            .from("ctos_lacres_cadastro")
            .select("os_id, cadastrado, login, cto, porta, lacre, atualizado_por, atualizado_em")
            .range(inicio, inicio + pagina - 1);
        if (error) throw error;
        (data ?? []).forEach(r => mapa.set(String(r.os_id), r));
        if (!data || data.length < pagina) break;
    }
    return mapa;
}

async function renderizarCtosLacres() {
    const container = document.getElementById("listaCtosLacres");
    if (!container) return;

    if (!APP.status.baseCarregada || APP.dados.ordens.size === 0) {
        container.innerHTML = '<p class="alerta-vazio">Importe dados pra ver as instalações.</p>';
        return;
    }

    // Atualização ao vivo (js/services/aovivo.js) redesenha a seção aberta —
    // não apaga uma célula que alguém está editando agora.
    if (document.activeElement?.classList.contains("ctos-input")) return;

    registrarFiltrosCtos();
    calcularLinhasCtos();
    preencherOpcoesDiagnosticoCtos();

    const token = ++_ctosRenderToken;
    if (_ctosCadastro.size === 0 && !_ctosErroBanco) container.innerHTML = '<p class="alerta-vazio">Carregando...</p>';
    try {
        const mapa = await carregarCadastroCtos();
        if (token !== _ctosRenderToken) return;
        _ctosCadastro = mapa;
        _ctosErroBanco = null;
    } catch (erro) {
        if (token !== _ctosRenderToken) return;
        console.error("CTOs e Lacres:", erro);
        _ctosErroBanco = erro;
    }

    // cruzamento com as CTOs do IXC (patch-29 + base de clientes); sem isso a aba segue normal
    try {
        await carregarPosicoesCtos();
        await carregarCtoIxcDosLogins(_ctosLinhasCache.map(l => valorCto(l, "login")));
        _ctosCruzamentoAviso = _ctosPosicoes.total ? "" : "O cadastro de CTOs do IXC ainda está vazio — o robô preenche na próxima puxada da base.";
    } catch (erro) {
        console.warn("CTOs e Lacres — cruzamento:", erro);
        _ctosPosicoes = null;
        _ctosCruzamentoAviso = /ctos/.test(erro?.message ?? "") || ["42P01", "PGRST205"].includes(erro?.code)
            ? "Cruzamento com as CTOs do IXC indisponível — falta rodar o database/patch-29-ctos.sql no Supabase."
            : "";
    }
    if (token !== _ctosRenderToken) return;

    aplicarFiltroCtos();
}

let _ctosFiltrosRegistrados = false;

function registrarFiltrosCtos() {
    if (_ctosFiltrosRegistrados) return;
    _ctosFiltrosRegistrados = true;

    document.getElementById("buscaCtos")?.addEventListener("input", aplicarFiltroCtos);
    ["filtroStatusCtos", "filtroDiagnosticoCtos", "filtroTipoCtos", "filtroConferenciaCtos", "ctosDataInicio", "ctosDataFim"]
        .forEach(id => document.getElementById(id)?.addEventListener("change", aplicarFiltroCtos));

    document.getElementById("btnLimparPeriodoCtos")?.addEventListener("click", () => {
        document.getElementById("ctosDataInicio").value = "";
        document.getElementById("ctosDataFim").value = "";
        aplicarFiltroCtos();
    });
    document.getElementById("btnExportarCtos")?.addEventListener("click", exportarCtosLacres);
}

function preencherOpcoesDiagnosticoCtos() {
    const select = document.getElementById("filtroDiagnosticoCtos");
    if (!select) return;
    const atual = select.value;
    const diagnosticos = [...new Set(_ctosLinhasCache.map(l => l.diagnostico).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, "pt-BR"));
    select.innerHTML = '<option value="">Todos os diagnósticos</option>' +
        diagnosticos.map(d => `<option value="${escaparHtml(d)}">${escaparHtml(d)}</option>`).join("");
    select.value = diagnosticos.includes(atual) ? atual : "";
}

/** Tudo menos o status — base dos contadores (Cadastrados/Pendentes do recorte). */
function linhasCtosSemStatus() {
    const termo = normalizarTexto(document.getElementById("buscaCtos")?.value ?? "");
    const diagnostico = document.getElementById("filtroDiagnosticoCtos")?.value ?? "";
    const tipo = document.getElementById("filtroTipoCtos")?.value ?? "";
    const conferencia = document.getElementById("filtroConferenciaCtos")?.value ?? "";
    const inicioBruto = document.getElementById("ctosDataInicio")?.value;
    const fimBruto = document.getElementById("ctosDataFim")?.value;
    const dataInicio = inicioBruto ? new Date(`${inicioBruto}T00:00:00`) : null;
    const dataFim = fimBruto ? new Date(`${fimBruto}T23:59:59`) : null;

    return _ctosLinhasCache.filter(linha => {
        if (diagnostico && linha.diagnostico !== diagnostico) return false;
        if (tipo && linha.tipo !== tipo) return false;
        if (conferencia && cruzamentoCto(linha)?.situacao !== conferencia) return false;
        if (dataInicio || dataFim) {
            if (!linha.dataFinal) return false;
            if (dataInicio && linha.dataFinal < dataInicio) return false;
            if (dataFim && linha.dataFinal > dataFim) return false;
        }
        if (termo) {
            const alvo = [linha.id, linha.cliente, linha.diagnostico, linha.tecnico,
                valorCto(linha, "login"), valorCto(linha, "cto"), valorCto(linha, "porta"), valorCto(linha, "lacre")];
            if (!alvo.some(c => normalizarTexto(String(c ?? "")).includes(termo))) return false;
        }
        return true;
    });
}

function linhasCtosFiltradas() {
    const status = document.getElementById("filtroStatusCtos")?.value ?? "";
    return linhasCtosSemStatus().filter(linha => {
        if (status === "pendente") return !cadastradoCto(linha);
        if (status === "cadastrado") return cadastradoCto(linha);
        return true;
    });
}

function aplicarFiltroCtos() {
    const base = linhasCtosSemStatus();
    const filtradas = linhasCtosFiltradas();
    renderizarResumoCtos(base, filtradas);
    renderizarTabelaCtos(filtradas);
}

function renderizarResumoCtos(base, filtradas) {
    const container = document.getElementById("resumoCtosLacres");
    if (!container) return;
    const cadastrados = base.filter(cadastradoCto).length;
    const fmt = n => n.toLocaleString("pt-BR");
    const aviso = filtradas.length > LIMITE_LINHAS_CTOS
        ? ` · mostrando as ${LIMITE_LINHAS_CTOS} mais recentes (o Excel leva todas)` : "";
    container.innerHTML = `
        <span>Exibindo: <b>${fmt(filtradas.length)}</b></span>
        <span>Cadastrados: <b class="ctos-ok">${fmt(cadastrados)}</b></span>
        <span>Pendentes: <b class="ctos-pendente">${fmt(base.length - cadastrados)}</b></span>
        ${_ctosPosicoes ? `<span>CTO diferente do IXC: <b class="ctos-pendente">${fmt(base.filter(l => cruzamentoCto(l)?.situacao === "diverge").length)}</b></span>` : ""}
        <span class="ctos-aviso">${aviso}${_ctosCruzamentoAviso ? ` · ${escaparHtml(_ctosCruzamentoAviso)}` : ""}</span>`;
}

/** Link pro mapa quando a CTO veio como coordenada ou link. */
function linkMapaCto(valor) {
    const texto = String(valor ?? "").trim();
    if (/^https?:\/\//i.test(texto)) return texto;
    const coord = texto.match(/(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/) ?? texto.match(/(-?\d{1,3},\d+)\s*[,;]?\s+(-?\d{1,3},\d+)/);
    if (coord) return `https://www.google.com/maps?q=${coord[1].replace(",", ".")},${coord[2].replace(",", ".")}`;
    return REGEX_PLUS_CODE_CTO.test(texto) ? `https://www.google.com/maps?q=${encodeURIComponent(texto)}` : null;
}

function renderizarTabelaCtos(linhas) {
    const container = document.getElementById("listaCtosLacres");
    if (!container) return;

    const avisoBanco = _ctosErroBanco
        ? `<p class="alerta-vazio">${/ctos_lacres_cadastro/.test(_ctosErroBanco.message ?? "") || ["42P01", "PGRST205"].includes(_ctosErroBanco.code)
            ? "A tabela de status ainda não existe no banco — falta rodar o database/patch-24-ctos-lacres.sql no Supabase. A lista aparece, mas o status não salva."
            : `Não deu pra carregar o status: ${escaparHtml(_ctosErroBanco.message ?? String(_ctosErroBanco))}`}</p>`
        : "";

    if (linhas.length === 0) {
        container.innerHTML = avisoBanco + '<p class="alerta-vazio">Nenhuma OS com lacre bate com esse filtro.</p>';
        return;
    }

    const editavel = podeEditarOperacao() && !_ctosErroBanco;
    const celula = (linha, campo, placeholder) => {
        const valor = valorCto(linha, campo) ?? "";
        const mapa = campo === "cto" ? linkMapaCto(valor) : null;
        const linkMapa = mapa ? `<a class="ctos-mapa" href="${escaparHtml(mapa)}" target="_blank" rel="noopener" title="Abrir no mapa">📍</a>` : "";
        const corrigido = _ctosCadastro.get(linha.id)?.[campo] != null ? " corrigido" : "";
        const cruzamento = campo === "cto" ? htmlCruzamentoCto(linha) : "";
        if (!editavel) return `<td class="ctos-texto">${escaparHtml(valor || "-")}${linkMapa}${cruzamento}</td>`;
        return `<td><div class="ctos-campo"><textarea rows="1" class="ctos-input${corrigido}" data-campo="${campo}" placeholder="${placeholder}" title="${escaparHtml(valor)}${corrigido ? " (corrigido manualmente)" : ""}">${escaparHtml(valor)}</textarea>${linkMapa}</div>${cruzamento}</td>`;
    };

    container.innerHTML = avisoBanco + `
        <div class="tabela-scroll">
            <table class="tabela-alertas tabela-ctos">
                <thead>
                    <tr>
                        <th class="cl-os">OS</th>
                        <th class="cl-cliente">Cliente</th>
                        <th class="cl-diag">Diagnóstico</th>
                        <th class="cl-login">Login</th>
                        <th class="cl-cto">CTO (localização)</th>
                        <th class="cl-porta">Porta</th>
                        <th class="cl-lacre">Lacre</th>
                        <th class="cl-data">Data</th>
                        <th class="cl-status ctos-col-status">Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${linhas.slice(0, LIMITE_LINHAS_CTOS).map(linha => `
                        <tr data-id="${escaparHtml(linha.id)}">
                            <td><button type="button" class="ctos-os" title="Ver a OS">${escaparHtml(linha.id)}</button></td>
                            <td class="ctos-texto" title="${escaparHtml(linha.cliente)}">${escaparHtml(linha.cliente || "-")}</td>
                            <td class="ctos-texto" title="${escaparHtml(linha.assunto)}">${escaparHtml(linha.diagnostico || "-")}</td>
                            ${celula(linha, "login", "login")}
                            ${celula(linha, "cto", "não encontrado")}
                            ${celula(linha, "porta", "-")}
                            ${celula(linha, "lacre", "-")}
                            <td class="ctos-texto ctos-data" title="${escaparHtml(linha.tecnico)}">${linha.dataFinal ? linha.dataFinal.toLocaleDateString("pt-BR") : "-"}</td>
                            <td class="ctos-col-status">${htmlStatusCto(cadastradoCto(linha), editavel)}</td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>`;

    const porId = new Map(linhas.map(l => [l.id, l]));
    container.querySelectorAll("tr[data-id]").forEach(tr => {
        const linha = porId.get(tr.dataset.id);
        tr.querySelector(".ctos-os")?.addEventListener("click", () => abrirModalOS(linha.id));
        tr.querySelectorAll(".ctos-input").forEach(input => {
            input.addEventListener("change", () => salvarCampoCto(linha, input.dataset.campo, input.value, input));
            // Enter salva (não quebra linha); a altura acompanha o texto
            input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); input.blur(); } });
            input.addEventListener("input", () => ajustarAlturaCto(input));
            ajustarAlturaCto(input);
        });
        tr.querySelector(".ctos-status[data-alternar]")?.addEventListener("click", evento => alternarStatusCto(linha, evento.currentTarget));
    });
}

/** Célula editável cresce pra baixo com o texto (fallback de field-sizing). */
function ajustarAlturaCto(campo) {
    if (CSS.supports?.("field-sizing", "content")) return;
    campo.style.height = "auto";
    campo.style.height = `${campo.scrollHeight}px`;
}

function htmlStatusCto(cadastrado, editavel) {
    const classe = cadastrado ? "cadastrado" : "pendente";
    const texto = cadastrado ? "Cadastrado" : "Pendente";
    return editavel
        ? `<button type="button" class="ctos-status ${classe}" data-alternar title="Clique pra trocar">${texto}</button>`
        : `<span class="ctos-status ${classe}">${texto}</span>`;
}

/** Grava a linha inteira da OS (status + correções). Correção igual ao texto da OS volta a ser null. */
async function gravarCadastroCto(linha, alteracoes) {
    const atual = _ctosCadastro.get(linha.id) ?? {};
    const registro = { os_id: linha.id, cadastrado: atual.cadastrado ?? false };
    for (const campo of ["login", "cto", "porta", "lacre"]) registro[campo] = atual[campo] ?? null;
    Object.assign(registro, alteracoes);
    for (const campo of ["login", "cto", "porta", "lacre"]) {
        if (registro[campo] !== null && registro[campo].trim() === String(linha.extraido[campo] ?? "").trim()) registro[campo] = null;
    }
    registro.atualizado_por = APP.usuario?.email ?? null;
    registro.atualizado_em = new Date().toISOString();

    const { error } = await supabaseClient.from("ctos_lacres_cadastro").upsert(registro);
    if (error) {
        alert(`Não deu pra salvar a OS ${linha.id}: ${error.message}`);
        return false;
    }
    _ctosCadastro.set(linha.id, registro);
    return true;
}

async function salvarCampoCto(linha, campo, valor, input) {
    input.disabled = true;
    const ok = await gravarCadastroCto(linha, { [campo]: valor.trim() });
    input.disabled = false;
    if (!ok) { input.value = valorCto(linha, campo) ?? ""; return; }
    const corrigido = _ctosCadastro.get(linha.id)?.[campo] != null;
    input.classList.toggle("corrigido", corrigido);
    input.title = input.value + (corrigido ? " (corrigido manualmente)" : "");
}

async function alternarStatusCto(linha, botao) {
    botao.disabled = true;
    const ok = await gravarCadastroCto(linha, { cadastrado: !cadastradoCto(linha) });
    botao.disabled = false;
    if (ok) aplicarFiltroCtos();
}

function exportarCtosLacres() {
    const linhas = linhasCtosFiltradas();
    if (linhas.length === 0) {
        alert("Não há linhas pra exportar com esse filtro.");
        return;
    }
    const dados = linhas.map(l => ({
        "OS": l.id,
        "Cliente": l.cliente,
        "Assunto": l.assunto,
        "Diagnóstico": l.diagnostico,
        "Login do cliente": valorCto(l, "login") ?? "",
        "CTO (localização)": valorCto(l, "cto") ?? "",
        "Porta": valorCto(l, "porta") ?? "",
        "Lacre": valorCto(l, "lacre") ?? "",
        "Técnico": l.tecnico,
        "Fechamento": l.dataFinal ? l.dataFinal.toLocaleDateString("pt-BR") : "",
        "Status": cadastradoCto(l) ? "Cadastrado" : "Pendente",
        ...(() => {
            const c = cruzamentoCto(l);
            return {
                "CTO mais próxima (IXC)": c?.proxima?.descricao ?? "",
                "Distância (m)": c?.proxima ? Math.round(c.proxima.distancia) : "",
                "CTO do login no IXC": c?.ixc ?? "",
                "Conferência": c ? SITUACOES_CTO[c.situacao] : ""
            };
        })()
    }));
    const planilha = XLSX.utils.json_to_sheet(dados);
    planilha["!cols"] = [10, 30, 30, 24, 20, 26, 8, 14, 24, 12, 12, 22, 12, 22, 22].map(wch => ({ wch }));
    const livro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(livro, planilha, "CTOs e Lacres");
    XLSX.writeFile(livro, `ctos-lacres-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ---------- Cruzamento com as CTOs do IXC ----------
// A coordenada que o técnico escreve em "LOCALIZAÇÃO DA CTO" é comparada com
// a posição das CTOs cadastradas no IXC (tabela ctos, patch-29, montada pelo
// robô a partir da visão "CTOs de Clientes"): CTO mais próxima + distância,
// e se ela confere com a CTO que o login tem no IXC (clientes_cto).

const RAIO_CTO_PERTO_M = 300;   // mais longe que isso = "nenhuma CTO perto"
const CELULA_GRADE_CTO = 0.02;  // ~2 km; busca na célula e nas 8 vizinhas

let _ctosPosicoes = null;           // { grade: Map("i|j" -> [cto]), total }
let _ctosIxcPorLogin = new Map();   // login (minúsculo) -> CTO no IXC (ou null)
let _ctosCruzamentoAviso = "";

const SITUACOES_CTO = {
    confere: "CTO confere com o IXC",
    diverge: "CTO diferente do IXC",
    "sem-ixc": "Login sem CTO no IXC",
    longe: "Nenhuma CTO perto",
    "sem-coordenada": "Sem coordenada da CTO"
};

const chaveGradeCto = (lat, lng) => `${Math.floor(lat / CELULA_GRADE_CTO)}|${Math.floor(lng / CELULA_GRADE_CTO)}`;

async function carregarPosicoesCtos() {
    if (_ctosPosicoes) return _ctosPosicoes;
    const grade = new Map();
    let total = 0;
    for (let inicio = 0; ; inicio += 1000) {
        const { data, error } = await supabaseClient.from("ctos")
            .select("descricao, lat, lng").not("lat", "is", null).not("lng", "is", null)
            .order("descricao").range(inicio, inicio + 999);
        if (error) throw error;
        for (const c of data ?? []) {
            const chave = chaveGradeCto(c.lat, c.lng);
            if (!grade.has(chave)) grade.set(chave, []);
            grade.get(chave).push(c);
            total++;
        }
        if (!data || data.length < 1000) break;
    }
    return (_ctosPosicoes = { grade, total });
}

/** CTO do IXC de cada login da lista (só busca os que ainda não tem). */
async function carregarCtoIxcDosLogins(logins) {
    const faltam = [...new Set(logins.filter(Boolean).map(l => l.toLowerCase()))].filter(l => !_ctosIxcPorLogin.has(l));
    const lotes = [];
    for (let i = 0; i < faltam.length; i += 150) lotes.push(faltam.slice(i, i + 150));
    for (let i = 0; i < lotes.length; i += 4) {
        await Promise.all(lotes.slice(i, i + 4).map(async lote => {
            // login no IXC pode ter maiúsculas: busca sem diferenciar (ilike em OR fica pesado; in() + lower no retorno)
            const variantes = [...new Set(lote.flatMap(l => [l, l.toUpperCase()]))];
            const { data, error } = await supabaseClient.from("clientes_cto").select("login, cto").in("login", variantes);
            if (error) throw error;
            lote.forEach(l => _ctosIxcPorLogin.set(l, null));
            (data ?? []).forEach(r => { if (r.login) _ctosIxcPorLogin.set(r.login.toLowerCase(), r.cto ?? null); });
        }));
    }
}

/** "-22.858880,-41.997955" / "(-22.72, -42.66)" / "-22,4652539, -42,6535331" -> {lat, lng}. */
function coordenadaDoTextoCto(texto) {
    const s = String(texto ?? "");
    const m = s.match(/(-?\d{1,3}\.\d+)\s*[,;]\s*(-?\d{1,3}\.\d+)/) ?? s.match(/(-?\d{1,3},\d+)\s*[,;]?\s+(-?\d{1,3},\d+)/);
    if (!m) return null;
    const lat = Number(m[1].replace(",", ".")), lng = Number(m[2].replace(",", "."));
    return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && lat !== 0 && lng !== 0 ? { lat, lng } : null;
}

function distanciaMetrosCto(a, b) {
    const rad = Math.PI / 180, R = 6371000;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

function ctoMaisProxima(ponto) {
    if (!_ctosPosicoes) return null;
    const i0 = Math.floor(ponto.lat / CELULA_GRADE_CTO), j0 = Math.floor(ponto.lng / CELULA_GRADE_CTO);
    let melhor = null;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        for (const c of _ctosPosicoes.grade.get(`${i0 + di}|${j0 + dj}`) ?? []) {
            const d = distanciaMetrosCto(ponto, c);
            if (!melhor || d < melhor.distancia) melhor = { descricao: c.descricao, distancia: d };
        }
    }
    return melhor;
}

const normalizarCto = t => String(t ?? "").trim().toUpperCase();

/** Situação da linha: confere | diverge | sem-ixc | longe | sem-coordenada (null = cruzamento indisponível). */
function cruzamentoCto(linha) {
    if (!_ctosPosicoes) return null;
    const login = String(valorCto(linha, "login") ?? "").toLowerCase();
    const ixc = login ? (_ctosIxcPorLogin.get(login) ?? null) : null;
    const ponto = coordenadaDoTextoCto(valorCto(linha, "cto"));
    if (!ponto) return { situacao: "sem-coordenada", ixc };
    const proxima = ctoMaisProxima(ponto);
    if (!proxima || proxima.distancia > RAIO_CTO_PERTO_M) return { situacao: "longe", proxima, ixc };
    if (!ixc) return { situacao: "sem-ixc", proxima, ixc };
    return { situacao: normalizarCto(ixc) === normalizarCto(proxima.descricao) ? "confere" : "diverge", proxima, ixc };
}

function formatarDistanciaCto(m) {
    return m >= 1000 ? `${(m / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km` : `${Math.round(m)} m`;
}

function htmlCruzamentoCto(linha) {
    const c = cruzamentoCto(linha);
    if (!c) return "";
    const nome = p => `<b>${escaparHtml(p.descricao)}</b> · ${formatarDistanciaCto(p.distancia)}`;
    const ixc = c.ixc ? `IXC: <b>${escaparHtml(c.ixc)}</b>` : "sem CTO no IXC";
    const textos = {
        confere: () => `✓ ${nome(c.proxima)} — confere com o IXC`,
        diverge: () => `⚠ Mais próxima: ${nome(c.proxima)} — ${ixc}`,
        "sem-ixc": () => `📡 Mais próxima: ${nome(c.proxima)} — sem CTO no IXC`,
        longe: () => `⚠ Nenhuma CTO a menos de ${RAIO_CTO_PERTO_M} m${c.proxima ? ` (mais próxima: ${nome(c.proxima)})` : ""} — ${ixc}`,
        "sem-coordenada": () => c.ixc ? `${ixc}` : ""
    };
    const texto = textos[c.situacao]();
    return texto ? `<div class="ctos-cruzamento s-${c.situacao}">${texto}</div>` : "";
}
