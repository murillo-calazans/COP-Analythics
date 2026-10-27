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

    atualizarRotuloUsuario();
    configurarMinhaConta();

    aplicarGateDePapel();
    if (typeof atualizarMenuLateralAdmin === "function") atualizarMenuLateralAdmin();
    // Notificações puxam a os_pendentes inteira (pesada) — adia pra não competir
    // com o carregamento principal (deixa a tela abrir primeiro).
    if (typeof renderizarNotificacoes === "function") {
        const adiar = window.requestIdleCallback || (fn => setTimeout(fn, 3500));
        adiar(() => renderizarNotificacoes());
        if (typeof renderizarRompimentos === "function") adiar(() => renderizarRompimentos());
    }

    // Saudação já aparece; os números do mês entram quando os dados chegarem.
    if (secaoAtiva() === "inicio") renderizarInicio();
}

/** Nome (curto, clicável) + papel no canto direito do cabeçalho. */
function atualizarRotuloUsuario() {
    const rotulo = document.getElementById("usuarioLogado");
    if (!rotulo || !APP.usuario) return;
    const papel = APP.usuario.papel === "admin" || APP.usuario.papel === "editor" ? APP.usuario.papel : "leitor";
    const setor = APP.usuario.setor ? ` (${APP.usuario.setor})` : "";
    rotulo.innerHTML =
        `<button type="button" class="usuario-nome-btn" id="btnMeuNome" title="Mudar como quer ser chamado">${escaparHtml(nomeCurtoUsuario())}</button>` +
        `<span class="usuario-papel"> · ${escaparHtml(papel)}${escaparHtml(setor)}</span>`;
    rotulo.title = APP.usuario.email;
    document.getElementById("btnMeuNome")?.addEventListener("click", abrirMinhaConta);
}

function abrirMinhaConta() {
    const inp = document.getElementById("inputMeuNome");
    if (inp) { inp.value = nomePreferido(); setTimeout(() => inp.focus(), 60); }
    ["inputNovaSenha", "inputNovaSenha2"].forEach(id => { const e = document.getElementById(id); if (e) e.value = ""; });
    const fb = document.getElementById("senhaFeedback"); if (fb) fb.hidden = true;
    if (typeof abrirModal === "function") abrirModal("modalMinhaConta");
}

function feedbackSenha(msg, ok) {
    const fb = document.getElementById("senhaFeedback");
    if (!fb) return;
    fb.textContent = msg;
    fb.classList.toggle("ok", !!ok);
    fb.hidden = false;
}

let _minhaContaConfigurada = false;
function configurarMinhaConta() {
    if (_minhaContaConfigurada) return;
    _minhaContaConfigurada = true;
    if (typeof registrarModal === "function") registrarModal("modalMinhaConta");

    // Nome de exibição
    const salvarNome = () => {
        salvarNomePreferido(document.getElementById("inputMeuNome")?.value || "");
        aplicarNomeExibicao();
        if (typeof fecharModal === "function") fecharModal("modalMinhaConta");
    };
    document.getElementById("btnSalvarMeuNome")?.addEventListener("click", salvarNome);
    document.getElementById("inputMeuNome")?.addEventListener("keydown", e => { if (e.key === "Enter") salvarNome(); });
    document.getElementById("btnLimparMeuNome")?.addEventListener("click", () => {
        salvarNomePreferido("");
        const inp = document.getElementById("inputMeuNome"); if (inp) inp.value = "";
        aplicarNomeExibicao();
        if (typeof fecharModal === "function") fecharModal("modalMinhaConta");
    });

    // Troca de senha
    const salvarSenha = async () => {
        const s1 = document.getElementById("inputNovaSenha")?.value || "";
        const s2 = document.getElementById("inputNovaSenha2")?.value || "";
        if (s1.length < 6) return feedbackSenha("A senha precisa ter pelo menos 6 caracteres.", false);
        if (s1 !== s2) return feedbackSenha("As senhas não coincidem.", false);
        const botao = document.getElementById("btnSalvarSenha");
        if (botao) botao.disabled = true;
        const r = (typeof trocarSenha === "function") ? await trocarSenha(s1) : { ok: false, mensagem: "Indisponível." };
        if (botao) botao.disabled = false;
        if (!r.ok) return feedbackSenha(r.mensagem || "Não deu pra trocar a senha.", false);
        ["inputNovaSenha", "inputNovaSenha2"].forEach(id => { const e = document.getElementById(id); if (e) e.value = ""; });
        feedbackSenha("Senha trocada com sucesso! 👍", true);
    };
    document.getElementById("btnSalvarSenha")?.addEventListener("click", salvarSenha);
    document.getElementById("inputNovaSenha2")?.addEventListener("keydown", e => { if (e.key === "Enter") salvarSenha(); });
}

/** Reaplica o nome escolhido no cabeçalho e na saudação do Início. */
function aplicarNomeExibicao() {
    atualizarRotuloUsuario();
    if (typeof secaoAtiva === "function" && secaoAtiva() === "inicio" && typeof renderizarInicio === "function") renderizarInicio();
}

/**
 * Esconde ações restritas conforme o papel (ver js/services/auth.js):
 * Importar, Apagar Dados, Logs de Importação e o card de Diagnósticos
 * Não Resolvidos liberam pra admin+editor (patch-17).
 */
function aplicarGateDePapel() {
    const botaoImportar = document.getElementById("btnAbrirImportar");
    const botaoLimpar = document.getElementById("btnLimparDados");
    const botaoLogs = document.getElementById("btnAbrirLogs");
    const botaoAtualizarRobo = document.getElementById("btnAtualizarRobo");
    const cardDiagnosticosNaoResolvidos = document.getElementById("cardDiagnosticosNaoResolvidos");

    const operacao = podeEditarOperacao();
    const importar = podeImportar();
    if (botaoImportar) botaoImportar.hidden = !importar;
    if (botaoLimpar) botaoLimpar.hidden = !operacao;
    if (botaoLogs) botaoLogs.hidden = !operacao;
    if (botaoAtualizarRobo) botaoAtualizarRobo.hidden = !operacao;
    if (cardDiagnosticosNaoResolvidos) cardDiagnosticosNaoResolvidos.hidden = !importar;
}
