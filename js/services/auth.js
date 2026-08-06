/**
 * ==========================================================
 * Serviço de Autenticação (Supabase Auth)
 * ==========================================================
 * Login/logout e resolução do papel do usuário (admin/leitor) a
 * partir da tabela "perfis". Sem autocadastro — contas são
 * criadas manualmente no painel do Supabase (Authentication ->
 * Add user), e o papel é definido inserindo uma linha em
 * "perfis" (ver database/schema-supabase.sql).
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
        .select("papel")
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
        papel: data.papel
    };
}

function ehAdmin() {
    return APP.usuario?.papel === "admin";
}

function traduzirErroLogin(error) {
    if (error.message?.includes("Invalid login credentials")) return "E-mail ou senha incorretos.";
    return `Erro ao entrar: ${error.message}`;
}
