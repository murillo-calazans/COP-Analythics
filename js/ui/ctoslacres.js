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

    aplicarFiltroCtos();
}

let _ctosFiltrosRegistrados = false;

function registrarFiltrosCtos() {
    if (_ctosFiltrosRegistrados) return;
    _ctosFiltrosRegistrados = true;

    document.getElementById("buscaCtos")?.addEventListener("input", aplicarFiltroCtos);
    ["filtroStatusCtos", "filtroDiagnosticoCtos", "filtroTipoCtos", "ctosDataInicio", "ctosDataFim"]
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
    const inicioBruto = document.getElementById("ctosDataInicio")?.value;
    const fimBruto = document.getElementById("ctosDataFim")?.value;
    const dataInicio = inicioBruto ? new Date(`${inicioBruto}T00:00:00`) : null;
    const dataFim = fimBruto ? new Date(`${fimBruto}T23:59:59`) : null;

    return _ctosLinhasCache.filter(linha => {
        if (diagnostico && linha.diagnostico !== diagnostico) return false;
        if (tipo && linha.tipo !== tipo) return false;
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
        <span class="ctos-aviso">${aviso}</span>`;
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
        if (!editavel) return `<td class="ctos-texto">${escaparHtml(valor || "-")}${linkMapa}</td>`;
        return `<td><div class="ctos-campo"><textarea rows="1" class="ctos-input${corrigido}" data-campo="${campo}" placeholder="${placeholder}" title="${escaparHtml(valor)}${corrigido ? " (corrigido manualmente)" : ""}">${escaparHtml(valor)}</textarea>${linkMapa}</div></td>`;
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
        "Status": cadastradoCto(l) ? "Cadastrado" : "Pendente"
    }));
    const planilha = XLSX.utils.json_to_sheet(dados);
    planilha["!cols"] = [10, 30, 30, 24, 20, 26, 8, 14, 24, 12, 12].map(wch => ({ wch }));
    const livro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(livro, planilha, "CTOs e Lacres");
    XLSX.writeFile(livro, `ctos-lacres-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
