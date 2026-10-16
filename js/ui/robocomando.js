/**
 * ==========================================================
 * Botão "Atualizar banco agora" (força o robô)
 * ==========================================================
 * O robô roda no PC de quem opera (C:\cop-robo) e não dá pra chamá-lo
 * direto do navegador. Então o botão (só admin/editor — ver
 * aplicarGateDePapel) insere um pedido na tabela robo_comandos; o robô
 * fica checando essa tabela a cada ~30s, abre o IXC e atualiza na hora,
 * e marca o pedido como concluído. Aqui a gente acompanha o status e,
 * quando concluir, dispara o refresh "ao vivo" pra tela mostrar o novo.
 * Precisa do robô ligado (iniciar.cmd aberto) — senão avisa que não respondeu.
 */

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
        // Espera até 6 min: a 1ª rodada do dia faz os retratos completos (529 +
        // base de CTOs) e pode levar ~4-5 min; as rodadas incrementais são rápidas.
        const limite = Date.now() + 360000;
        let viuProcessando = false;

        while (Date.now() < limite) {
            await new Promise(r => setTimeout(r, 3000));
            const { data: row } = await supabaseClient
                .from("robo_comandos").select("status, resultado").eq("id", id).maybeSingle();

            if (row?.status === "processando" && !viuProcessando) {
                viuProcessando = true;   // o robô pegou o pedido e está trabalhando
                roboToast("O robô está atualizando… (pode demorar na 1ª rodada do dia)");
            }
            if (row?.status === "concluido") {
                roboToast("Banco atualizado pelo robô ✓", "ok");
                if (typeof aovivoVerificar === "function") await aovivoVerificar(); // puxa o novo pra tela
                if (typeof carregarAgendaIxc === "function" && !document.getElementById("agendaIxcConteudo")?.hidden) carregarAgendaIxc(true);
                return;
            }
            if (row?.status === "erro") {
                roboToast("O robô encontrou um erro: " + (row.resultado?.erro || "ver a janela do robô"), "erro");
                return;
            }
        }
        // estourou o tempo: se o robô chegou a "processando", ele está vivo e só
        // demorando (rodada pesada) — não é erro; os dados entram sozinhos ao fim.
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
