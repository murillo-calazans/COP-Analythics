/**
 * ==========================================================
 * Configurações > Acesso dos usuários (só admin)
 * ==========================================================
 * Por usuário: de quais SETORES ele vê as OS e quais ABAS ele abre.
 *   - setores: perfis.setores_visiveis — aplicado no banco (RLS de
 *     ordens/movimentacoes, database/patch-28), então todo relatório e
 *     tela só recebe as OS liberadas. null = todos.
 *   - abas: perfis.abas_visiveis — o site esconde o resto (ver
 *     podeVerSecao em js/ui/navegacao.js). null = todas.
 * Admin vê tudo sempre. Lê/grava pelas funções admin_listar_acessos /
 * admin_salvar_acesso, que conferem no banco se quem chama é admin.
 */

const NOMES_MODULO_ACESSO = {
    ordens: "Gestão de Relatórios",
    cop: "Gestão do COP",
    clientes: "Gestão de Clientes",
    terceiras: "Gestão de Terceiras (só admin/editor)",
    auditoria: "Auditoria",
    agendador: "Gestão de Ordens",
    escala: "Escala"
};

// Seções sem botão no topo (módulo de uma tela só).
const NOMES_SECAO_ACESSO = { "agenda-hoje": "Agenda do dia", "escala-hoje": "Escala de hoje" };

let acessosUsuarios = null;
let acessoAberto = null; // id do usuário com o editor aberto
let rolarAteAcessoAberto = false;

/** Vindo da tela de Usuários ("Editar" na coluna Pode ver): abre o editor daquele usuário. */
function abrirAcessoDoUsuario(id) {
    acessoAberto = id;
    rolarAteAcessoAberto = true;
    const busca = document.getElementById("buscaAcessoUsuarios");
    if (busca) busca.value = "";
    mostrarSecao("configuracoes");
}

function nomeSecaoAcesso(secao) {
    const botao = document.querySelector(`nav.menu [data-secao="${secao}"]`);
    if (botao) {
        const copia = botao.cloneNode(true);
        copia.querySelectorAll(".badge-alertas").forEach(b => b.remove());
        const texto = copia.textContent.replace(/\s+/g, " ").trim();
        if (texto) return texto;
    }
    return NOMES_SECAO_ACESSO[secao] ?? secao;
}

/** Abas controláveis, agrupadas por módulo, na ordem do menu. */
function abasControlaveis() {
    const grupos = new Map();
    for (const [secao, modulo] of Object.entries(MODULO_DA_SECAO)) {
        if (SECOES_SEMPRE_LIBERADAS.includes(secao) || modulo === "admin") continue;
        if (!grupos.has(modulo)) grupos.set(modulo, []);
        grupos.get(modulo).push({ secao, nome: nomeSecaoAcesso(secao) });
    }
    return grupos;
}

function setoresParaAcesso() {
    const setores = new Set(typeof setoresConhecidos === "function" ? setoresConhecidos() : []);
    for (const u of acessosUsuarios ?? []) {
        (u.setores_visiveis ?? []).forEach(s => setores.add(String(s).toUpperCase()));
        if (u.setor) setores.add(String(u.setor).toUpperCase());
    }
    return [...setores].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

async function renderizarAcessoUsuarios() {
    const card = document.getElementById("cardAcessoUsuarios");
    if (!card) return;
    card.hidden = !ehAdmin();
    if (card.hidden) return;

    const lista = document.getElementById("listaAcessoUsuarios");
    const busca = document.getElementById("buscaAcessoUsuarios");
    if (busca && !busca.dataset.ligado) {
        busca.dataset.ligado = "1";
        busca.addEventListener("input", desenharListaAcessos);
    }

    lista.innerHTML = '<p class="alerta-vazio">Carregando usuários...</p>';
    const { data, error } = await supabaseClient.rpc("admin_listar_acessos");
    if (error) {
        const falta = /admin_listar_acessos|PGRST202|function/i.test(`${error.message} ${error.code}`);
        lista.innerHTML = falta
            ? '<p class="alerta-vazio">Falta rodar o database/patch-28-acesso-usuarios.sql no Supabase.</p>'
            : `<p class="alerta-vazio">Não deu pra carregar: ${escaparHtml(error.message)}</p>`;
        return;
    }
    acessosUsuarios = data ?? [];
    desenharListaAcessos();
}

function resumoAcesso(u) {
    if (u.papel === "admin") return "Admin — vê tudo";
    const setores = u.setores_visiveis ? `${u.setores_visiveis.length} setor(es)` : "todos os setores";
    const abas = u.abas_visiveis ? `${u.abas_visiveis.length} aba(s)` : "todas as abas";
    return `${setores} · ${abas}`;
}

function desenharListaAcessos() {
    const lista = document.getElementById("listaAcessoUsuarios");
    if (!lista || !acessosUsuarios) return;
    const termo = normalizarTexto(document.getElementById("buscaAcessoUsuarios")?.value ?? "");
    const visiveis = acessosUsuarios.filter(u =>
        !termo || normalizarTexto(`${u.nome ?? ""} ${u.email ?? ""} ${u.setor ?? ""}`).includes(termo));

    if (visiveis.length === 0) {
        lista.innerHTML = '<p class="alerta-vazio">Nenhum usuário encontrado.</p>';
        return;
    }

    lista.innerHTML = visiveis.map(u => `
        <div class="acesso-usuario${acessoAberto === u.id ? " aberto" : ""}" data-id="${u.id}">
            <button type="button" class="acesso-cabecalho" data-alternar>
                <span class="acesso-nome">${escaparHtml(u.nome || u.email)}</span>
                <span class="acesso-email">${escaparHtml(u.email ?? "")}${u.setor ? ` · ${escaparHtml(u.setor)}` : ""}</span>
                <span class="acesso-resumo ${u.setores_visiveis || u.abas_visiveis ? "restrito" : ""}">${escaparHtml(resumoAcesso(u))}</span>
            </button>
            ${acessoAberto === u.id ? htmlEditorAcesso(u) : ""}
        </div>`).join("");

    lista.querySelectorAll("[data-alternar]").forEach(botao => botao.addEventListener("click", () => {
        const id = botao.closest(".acesso-usuario").dataset.id;
        acessoAberto = acessoAberto === id ? null : id;
        desenharListaAcessos();
    }));

    const aberto = lista.querySelector(".acesso-usuario.aberto");
    if (aberto) ligarEditorAcesso(aberto, acessosUsuarios.find(u => u.id === acessoAberto));
    if (aberto && rolarAteAcessoAberto) aberto.scrollIntoView({ behavior: "smooth", block: "start" });
    rolarAteAcessoAberto = false;
}

function htmlEditorAcesso(u) {
    if (u.papel === "admin") {
        return '<div class="acesso-editor"><p class="resumo-filtro">Admin vê todas as abas e todos os setores — não dá pra restringir.</p></div>';
    }
    const setoresMarcados = new Set((u.setores_visiveis ?? []).map(s => s.toUpperCase()));
    const abasMarcadas = new Set(u.abas_visiveis ?? []);
    const caixa = (nome, valor, marcado, extra = "") =>
        `<label class="acesso-opcao"><input type="checkbox" name="${nome}" value="${escaparHtml(valor)}"${marcado ? " checked" : ""}${extra}> ${escaparHtml(valor)}</label>`;

    const setores = setoresParaAcesso().map(s => caixa("setor", s, setoresMarcados.has(s))).join("");
    const abas = [...abasControlaveis()].map(([modulo, secoes]) => `
        <div class="acesso-grupo">
            <label class="acesso-modulo"><input type="checkbox" data-modulo="${modulo}"> ${escaparHtml(NOMES_MODULO_ACESSO[modulo] ?? modulo)}</label>
            ${secoes.map(s => `<label class="acesso-opcao"><input type="checkbox" name="aba" value="${s.secao}" data-do-modulo="${modulo}"${abasMarcadas.has(s.secao) ? " checked" : ""}> ${escaparHtml(s.nome)}</label>`).join("")}
        </div>`).join("");

    return `
        <div class="acesso-editor">
            <fieldset>
                <legend>Setores das ordens de serviço</legend>
                <label class="acesso-opcao forte"><input type="radio" name="modoSetor" value="todos"${u.setores_visiveis ? "" : " checked"}> Todos os setores</label>
                <label class="acesso-opcao forte"><input type="radio" name="modoSetor" value="lista"${u.setores_visiveis ? " checked" : ""}> Só os setores marcados:</label>
                <div class="acesso-opcoes" data-bloco="setor">${setores || '<p class="resumo-filtro">Importe a Base.xlsx pra listar os setores.</p>'}</div>
            </fieldset>
            <fieldset>
                <legend>Abas do site</legend>
                <label class="acesso-opcao forte"><input type="radio" name="modoAba" value="todas"${u.abas_visiveis ? "" : " checked"}> Todas as abas</label>
                <label class="acesso-opcao forte"><input type="radio" name="modoAba" value="lista"${u.abas_visiveis ? " checked" : ""}> Só as abas marcadas (Início sempre aparece):</label>
                <div class="acesso-opcoes acesso-abas" data-bloco="aba">${abas}</div>
            </fieldset>
            <div class="acesso-acoes">
                <button type="button" class="botao-primario" data-salvar>Salvar acesso</button>
                <span class="resumo-filtro" data-status></span>
            </div>
        </div>`;
}

function ligarEditorAcesso(el, u) {
    if (!u || u.papel === "admin") return;

    // listas só valem com "Só os marcados"
    const sincronizarModo = () => {
        el.querySelector('[data-bloco="setor"]').classList.toggle("desligado", el.querySelector('[name="modoSetor"]:checked').value !== "lista");
        el.querySelector('[data-bloco="aba"]').classList.toggle("desligado", el.querySelector('[name="modoAba"]:checked').value !== "lista");
    };
    el.querySelectorAll('[name="modoSetor"], [name="modoAba"]').forEach(r => r.addEventListener("change", sincronizarModo));
    sincronizarModo();

    // checkbox do módulo marca/desmarca as abas dele
    const atualizarModulos = () => el.querySelectorAll("[data-modulo]").forEach(m => {
        const filhas = [...el.querySelectorAll(`[data-do-modulo="${m.dataset.modulo}"]`)];
        m.checked = filhas.length > 0 && filhas.every(f => f.checked);
        m.indeterminate = !m.checked && filhas.some(f => f.checked);
    });
    el.querySelectorAll("[data-modulo]").forEach(m => m.addEventListener("change", () => {
        el.querySelectorAll(`[data-do-modulo="${m.dataset.modulo}"]`).forEach(f => { f.checked = m.checked; });
        atualizarModulos();
    }));
    el.querySelectorAll("[data-do-modulo]").forEach(f => f.addEventListener("change", atualizarModulos));
    atualizarModulos();

    el.querySelector("[data-salvar]").addEventListener("click", () => salvarAcessoUsuario(el, u));
}

async function salvarAcessoUsuario(el, u) {
    const status = el.querySelector("[data-status]");
    const botao = el.querySelector("[data-salvar]");
    const marcados = nome => [...el.querySelectorAll(`[name="${nome}"]:checked`)].map(c => c.value);

    const setores = el.querySelector('[name="modoSetor"]:checked').value === "lista" ? marcados("setor") : null;
    const abas = el.querySelector('[name="modoAba"]:checked').value === "lista" ? marcados("aba") : null;
    if (setores && setores.length === 0) {
        status.textContent = 'Marque pelo menos um setor, ou escolha "Todos os setores".';
        return;
    }

    botao.disabled = true;
    status.textContent = "Salvando...";
    const { error } = await supabaseClient.rpc("admin_salvar_acesso", { p_id: u.id, p_setores: setores, p_abas: abas });
    botao.disabled = false;
    if (error) {
        status.textContent = `Não salvou: ${error.message}`;
        return;
    }
    u.setores_visiveis = setores;
    u.abas_visiveis = abas;
    if (typeof acessoPorUsuario !== "undefined") acessoPorUsuario.set(u.id, { ...u });
    status.textContent = "Salvo. Vale na próxima vez que a pessoa abrir ou recarregar o site.";
    el.querySelector(".acesso-resumo").textContent = resumoAcesso(u);
    el.querySelector(".acesso-resumo").classList.toggle("restrito", Boolean(setores || abas));
}
