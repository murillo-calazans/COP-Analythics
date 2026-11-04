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

async function trocarSenha(novaSenha) {
    const { error } = await supabaseClient.auth.updateUser({ password: novaSenha });
    if (error) return { ok: false, mensagem: error.message || "Não deu pra trocar a senha." };
    return { ok: true };
}

async function sair() {
    await supabaseClient.auth.signOut();
    APP.usuario = null;
    APP.status.autenticado = false;
}

async function carregarUsuarioAtual(sessao) {
    const { data, error } = await supabaseClient
        .from("perfis")
        .select("*")
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

        abasVisiveis: Array.isArray(data.abas_visiveis) ? data.abas_visiveis : null,
        setoresVisiveis: Array.isArray(data.setores_visiveis) ? data.setores_visiveis : null,
        nome: data.nome?.trim() || nomeDoEmail(sessao.user.email)
    };
}

function nomeDoEmail(email) {
    return String(email ?? "").split("@")[0].split(/[._-]+/).filter(Boolean)
        .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" ");
}

function nomePreferido() {
    try { return (localStorage.getItem("cop_nome_exibicao") || "").trim(); } catch { return ""; }
}
function salvarNomePreferido(valor) {
    try {
        const t = (valor || "").trim();
        if (t) localStorage.setItem("cop_nome_exibicao", t);
        else localStorage.removeItem("cop_nome_exibicao");
    } catch {  }
}

function primeiroNomeUsuario() {
    const pref = nomePreferido();
    if (pref) return pref.split(/\s+/)[0];
    return (APP.usuario?.nome ?? "").split(/\s+/)[0] || "";
}

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

function podeEditarOperacao() {
    return APP.usuario?.papel === "admin" || APP.usuario?.papel === "editor";
}

function podeImportar() {
    return podeEditarOperacao();
}

function traduzirErroLogin(error) {
    if (error.message?.includes("Invalid login credentials")) return "E-mail ou senha incorretos.";
    return `Erro ao entrar: ${error.message}`;
}
