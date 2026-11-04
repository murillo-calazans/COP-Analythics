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

    if (typeof renderizarNotificacoes === "function") {
        const adiar = window.requestIdleCallback || (fn => setTimeout(fn, 3500));
        adiar(() => renderizarNotificacoes());
        if (typeof renderizarRompimentos === "function") adiar(() => renderizarRompimentos());
    }

    if (secaoAtiva() === "inicio") renderizarInicio();
}

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

function aplicarNomeExibicao() {
    atualizarRotuloUsuario();
    if (typeof secaoAtiva === "function" && secaoAtiva() === "inicio" && typeof renderizarInicio === "function") renderizarInicio();
}

function aplicarGateDePapel() {
    const botaoImportar = document.getElementById("btnAbrirImportar");
    const botaoLimpar = document.getElementById("btnLimparDados");
    const botaoLogs = document.getElementById("btnAbrirLogs");
    const botaoAtualizarRobo = document.getElementById("btnAtualizarRobo");
    const cardDiagnosticosNaoResolvidos = document.getElementById("cardDiagnosticosNaoResolvidos");

    const operacao = podeEditarOperacao();
    const importar = podeImportar();
    const admin = typeof ehAdmin === "function" && ehAdmin();
    if (botaoImportar) botaoImportar.hidden = !importar;
    if (botaoLimpar) botaoLimpar.hidden = !operacao;
    if (botaoLogs) botaoLogs.hidden = !operacao;
    if (botaoAtualizarRobo) botaoAtualizarRobo.hidden = !operacao;
    if (cardDiagnosticosNaoResolvidos) cardDiagnosticosNaoResolvidos.hidden = !importar;

    document.querySelectorAll('[data-secao="configuracoes"]').forEach(el => { el.hidden = !admin; });
}
