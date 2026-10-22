/**
 * ==========================================================
 * Serviço de Autenticação (Supabase Auth)
 * ==========================================================
 * Login/logout e resolução do papel do usuário (admin/editor/leitor) a
 * partir da tabela "perfis". Sem autocadastro — contas são
 * criadas manualmente no painel do Supabase (Authentication ->
 * Add user), e o papel é definido inserindo uma linha em
 * "perfis" (ver database/schema-supabase.sql e
 * database/patch-11-papel-editor.sql).
 *
 * Três papéis:
 * - admin: tudo (importar, apagar dados compartilhados, ver Logs de
 *   Importação, rodar o Auditor IA).
 * - editor: só importar dados e ver o card de Diagnósticos Não
 *   Resolvidos — não apaga dados nem vê Logs de Importação (ver
 *   js/ui/login.js -> aplicarGateDePapel).
 * - leitor: só enxerga (nenhuma ação de escrita).
 */

async function obterSessaoAtual() {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) {
        console.error("Falha ao obter sessão:", error);
        return null;
    }
    return data.session;
}

async function entrar(email, senha) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: senha });
    if (error) return { ok: false, mensagem: traduzirErroLogin(error) };
    return { ok: true, sessao: data.session };
}

async function sair() {
    await supabaseClient.auth.signOut();
    APP.usuario = null;
    APP.status.autenticado = false;
}

/**
 * Busca o papel do usuário logado na tabela "perfis". Um usuário
 * autenticado no Supabase Auth mas sem linha em "perfis" (ex.: conta
 * criada mas ainda não configurada) não tem papel nenhum — trata como
 * sem acesso, não como admin por padrão (mais seguro).
 */
async function carregarUsuarioAtual(sessao) {
    const { data, error } = await supabaseClient
        .from("perfis")
        .select("*") // "*" e não "papel, setor, nome": "nome" só existe depois do patch-15
        .eq("id", sessao.user.id)
        .maybeSingle();

    if (error) {
        console.error("Falha ao carregar perfil do usuário:", error);
        return null;
    }

    if (!data) return null;

    return {
        id: sessao.user.id,
        email: sessao.user.email,
        papel: data.papel,
        setor: data.setor,
        // patch-28: null = todas (abas) / todos (setores, aplicado no banco)
        abasVisiveis: Array.isArray(data.abas_visiveis) ? data.abas_visiveis : null,
        setoresVisiveis: Array.isArray(data.setores_visiveis) ? data.setores_visiveis : null,
        nome: data.nome?.trim() || nomeDoEmail(sessao.user.email)
    };
}

/** "murillo.calazans@avanca.com.br" -> "Murillo Calazans" (quando o perfil não tem nome). */
function nomeDoEmail(email) {
    return String(email ?? "").split("@")[0].split(/[._-]+/).filter(Boolean)
        .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" ");
}

/** Nome que a pessoa escolheu pra ser chamada (só no navegador dela; não muda o cadastro). */
function nomePreferido() {
    try { return (localStorage.getItem("cop_nome_exibicao") || "").trim(); } catch { return ""; }
}
function salvarNomePreferido(valor) {
    try {
        const t = (valor || "").trim();
        if (t) localStorage.setItem("cop_nome_exibicao", t);
        else localStorage.removeItem("cop_nome_exibicao");
    } catch { /* localStorage indisponível: ignora */ }
}

/** Primeiro nome, pra saudação (usa o preferido, se tiver). */
function primeiroNomeUsuario() {
    const pref = nomePreferido();
    if (pref) return pref.split(/\s+/)[0];
    return (APP.usuario?.nome ?? "").split(/\s+/)[0] || "";
}

/** Nome curto pro cabeçalho: o preferido, senão primeiro + último nome. */
function nomeCurtoUsuario() {
    const pref = nomePreferido();
    if (pref) return pref;
    const completo = (APP.usuario?.nome ?? "").trim();
    if (!completo) return (APP.usuario?.email ?? "").split("@")[0];
    const p = completo.split(/\s+/);
    return p.length === 1 ? p[0] : `${p[0]} ${p[p.length - 1]}`;
}

function ehAdmin() {
    return APP.usuario?.papel === "admin";
}

/**
 * admin ou editor — operação do dia a dia: importar e apagar dados, ver
 * logs de importação, editar escala, pré-agendar e publicar a agenda
 * (no banco: patch-11 e patch-17). Só admin continua com usuários e
 * Auditor IA (ehAdmin).
 */
function podeEditarOperacao() {
    return APP.usuario?.papel === "admin" || APP.usuario?.papel === "editor";
}

/** admin ou editor — os dois podem importar dados (ver aplicarGateDePapel). */
function podeImportar() {
    return podeEditarOperacao();
}

function traduzirErroLogin(error) {
    if (error.message?.includes("Invalid login credentials")) return "E-mail ou senha incorretos.";
    return `Erro ao entrar: ${error.message}`;
}
