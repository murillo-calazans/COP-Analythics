let roboComandoEmAndamento = false;

function roboToast(mensagem, tipo = "info") {
    let el = document.getElementById("roboToast");
    if (!el) {
        el = document.createElement("div");
        el.id = "roboToast";
        el.className = "robo-toast";
        document.body.appendChild(el);
    }
    el.textContent = mensagem;
    el.dataset.tipo = tipo;
    el.classList.add("aberto");
    clearTimeout(roboToast._t);
    roboToast._t = setTimeout(() => el.classList.remove("aberto"), tipo === "erro" ? 8000 : 5000);
}

async function solicitarAtualizacaoRobo() {
    if (roboComandoEmAndamento) return;
    if (typeof podeEditarOperacao === "function" && !podeEditarOperacao()) return;

    const botao = document.getElementById("btnAtualizarRobo");
    roboComandoEmAndamento = true;
    if (botao) { botao.disabled = true; botao.classList.add("girando"); }
    roboToast("Pedido enviado ao robô. Atualizando o banco…");

    try {
        const { data, error } = await supabaseClient
            .from("robo_comandos")
            .insert({ tipo: "atualizar", solicitado_por: APP.usuario?.email ?? null })
            .select("id")
            .single();
        if (error) throw error;

        const id = data.id;

        const limite = Date.now() + 360000;
        let viuProcessando = false;

        while (Date.now() < limite) {
            await new Promise(r => setTimeout(r, 3000));
            const { data: row } = await supabaseClient
                .from("robo_comandos").select("status, resultado").eq("id", id).maybeSingle();

            if (row?.status === "processando" && !viuProcessando) {
                viuProcessando = true;
                roboToast("O robô está atualizando… (pode demorar na 1ª rodada do dia)");
            }
            if (row?.status === "concluido") {
                roboToast("Banco atualizado pelo robô ✓", "ok");
                if (typeof aovivoVerificar === "function") await aovivoVerificar();
                if (typeof carregarAgendaIxc === "function" && !document.getElementById("agendaIxcConteudo")?.hidden) carregarAgendaIxc(true);
                return;
            }
            if (row?.status === "erro") {
                roboToast("O robô encontrou um erro: " + (row.resultado?.erro || "ver a janela do robô"), "erro");
                return;
            }
        }

        if (viuProcessando) roboToast("O robô ainda está processando (rodada pesada). Os dados aparecem sozinhos quando terminar.", "info");
        else roboToast("O robô não respondeu. Verifique se o 'iniciar.cmd' está aberto no PC.", "erro");
    } catch (e) {
        roboToast("Não consegui enviar o pedido: " + (e.message || e), "erro");
    } finally {
        roboComandoEmAndamento = false;
        if (botao) { botao.disabled = false; botao.classList.remove("girando"); }
    }
}

function registrarRoboComando() {
    const botao = document.getElementById("btnAtualizarRobo");
    if (botao) botao.addEventListener("click", solicitarAtualizacaoRobo);
}
