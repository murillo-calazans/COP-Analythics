/**
 * ==========================================================
 * Atualização "ao vivo"
 * ==========================================================
 * Enquanto o COP-Analytics está aberto, verifica de tempos em tempos se
 * algo novo foi gravado no Supabase (pelo robô de ordens de hora em hora,
 * ou por uma importação de alguém) e, SÓ nesse caso, recarrega os dados e
 * redesenha a tela — sem precisar de F5.
 *
 * A verificação é baratíssima: lê uma única linha (a maior
 * ordens.atualizado_em). O recarregamento pesado (atualizarDoSupabase, que
 * pagina tudo) só roda quando esse carimbo de tempo avançou. Não interrompe
 * quem está com um modal aberto, nem durante um carregamento/importação.
 */

const AOVIVO_INTERVALO_MS = 3 * 60 * 1000;   // checa a cada 3 min
let aovivoUltimo = null;                      // maior atualizado_em já visto
let aovivoTimer = null;
let aovivoRodando = false;                    // evita sobreposição de duas checagens

async function aovivoMaiorAtualizacao() {
    const { data, error } = await supabaseClient
        .from("ordens")
        .select("atualizado_em")
        .order("atualizado_em", { ascending: false })
        .limit(1);
    if (error || !data || data.length === 0) return null;
    return data[0].atualizado_em;
}

async function aovivoVerificar() {
    if (aovivoRodando) return;
    if (APP.status.carregando) return;                 // não durante importação/carregamento
    if (document.querySelector(".modal.aberto")) return; // não atrapalha quem está vendo um detalhe

    aovivoRodando = true;
    try {
        const atual = await aovivoMaiorAtualizacao();
        if (!atual) return;
        if (aovivoUltimo === null) { aovivoUltimo = atual; return; } // 1ª vez: só marca a base
        if (atual <= aovivoUltimo) return;                           // nada novo

        // Houve gravação nova desde a última vez: recarrega tudo e redesenha.
        const ok = await atualizarDoSupabase(() => {}, true);
        if (!ok) return;
        aovivoUltimo = atual;

        APP.indicadores.recorrencia = IndicatorEngine.calcularRecorrencia(FiltroEngine.ordensFiltradas());
        atualizarAlertas();
        renderizarDashboard();
        renderizarSecaoAtiva();
        if (typeof atualizarBadgeAlertas === "function") atualizarBadgeAlertas();
        console.log(`Ao vivo: dados atualizados automaticamente (${new Date().toLocaleTimeString("pt-BR")}).`);
    } catch (erro) {
        console.warn("Ao vivo (ignorado):", erro);
    } finally {
        aovivoRodando = false;
    }
}

/** Liga a atualização automática. Chamado depois do 1º carregamento (app.js). */
async function iniciarAoVivo() {
    pararAoVivo();
    // base = estado que acabou de ser carregado, pra não disparar um recarregamento à toa
    aovivoUltimo = await aovivoMaiorAtualizacao();
    aovivoTimer = setInterval(aovivoVerificar, AOVIVO_INTERVALO_MS);
    // ao voltar pra aba (depois de ficar noutra), confere na hora
    document.removeEventListener("visibilitychange", aovivoAoVoltar);
    document.addEventListener("visibilitychange", aovivoAoVoltar);
}

function aovivoAoVoltar() {
    if (document.visibilityState === "visible") aovivoVerificar();
}

function pararAoVivo() {
    if (aovivoTimer) clearInterval(aovivoTimer);
    aovivoTimer = null;
}
