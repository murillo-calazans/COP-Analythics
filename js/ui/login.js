/**
 * ==========================================================
 * UI de Login/Logout
 * ==========================================================
 * Tela cheia (não é um modal) — sem sessão válida, é a única
 * coisa visível (ver body.nao-autenticado em css/layout.css).
 * Não decide regra nenhuma aqui: só chama js/services/auth.js e
 * reage ao resultado.
 */

function registrarLogin() {
    const form = document.getElementById("formLogin");
    const botaoSair = document.getElementById("btnSair");

    if (form) {
        form.addEventListener("submit", async evento => {
            evento.preventDefault();
            await tentarEntrar();
        });
    }

    if (botaoSair) {
        botaoSair.addEventListener("click", async () => {
            await sair();
            mostrarTelaLogin();
        });
    }
}

async function tentarEntrar() {
    const form = document.getElementById("formLogin");
    const email = document.getElementById("loginEmail").value.trim();
    const senha = document.getElementById("loginSenha").value;
    const botao = document.getElementById("btnEntrar");
    const erro = document.getElementById("loginErro");

    erro.hidden = true;
    botao.disabled = true;

    const resultado = await entrar(email, senha);

    if (!resultado.ok) {
        erro.textContent = resultado.mensagem;
        erro.hidden = false;
        botao.disabled = false;
        return;
    }

    const usuario = await carregarUsuarioAtual(resultado.sessao);

    if (!usuario) {
        erro.textContent = "Sua conta ainda não tem um papel configurado. Fale com o administrador.";
        erro.hidden = false;
        botao.disabled = false;
        await sair();
        return;
    }

    APP.usuario = usuario;
    APP.status.autenticado = true;

    // Best-effort, sem await — não faz sentido atrasar a entrada do
    // usuário esperando o log gravar. Só aqui (entrada de verdade pelo
    // formulário), não numa sessão restaurada por F5, senão todo
    // refresh viraria um "login" novo no histórico.
    registrarLogLogin(usuario.email);

    botao.disabled = false;
    erro.hidden = true;
    form.reset();

    mostrarAppAutenticado();
    await inicializarDadosAutenticado();
}

function mostrarTelaLogin() {
    document.body.classList.add("nao-autenticado");
}

function mostrarAppAutenticado() {
    document.body.classList.remove("nao-autenticado");

    const rotulo = document.getElementById("usuarioLogado");
    if (rotulo) {
        const papel = APP.usuario.papel === "admin" ? "admin" : "leitor";
        const setor = APP.usuario.setor ? ` (${APP.usuario.setor})` : "";
        rotulo.textContent = `${APP.usuario.email} · ${papel}${setor}`;
    }

    aplicarGateDePapel();
}

/** Esconde ações de escrita (importar/apagar) e os Logs pra quem não é admin. */
function aplicarGateDePapel() {
    const botaoImportar = document.getElementById("btnAbrirImportar");
    const botaoLimpar = document.getElementById("btnLimparDados");
    const botaoLogs = document.getElementById("btnAbrirLogs");

    const admin = ehAdmin();
    if (botaoImportar) botaoImportar.hidden = !admin;
    if (botaoLimpar) botaoLimpar.hidden = !admin;
    if (botaoLogs) botaoLogs.hidden = !admin;
}
