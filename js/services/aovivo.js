const AOVIVO_INTERVALO_MS = 3 * 60 * 1000;
let aovivoUltimo = null;
let aovivoTimer = null;
let aovivoRodando = false;

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
    if (typeof atualizarBannerGlobal === "function") atualizarBannerGlobal();
    if (aovivoRodando) return;
    if (APP.status.carregando) return;
    if (document.querySelector(".modal.aberto")) return;

    aovivoRodando = true;
    try {
        const atual = await aovivoMaiorAtualizacao();
        if (!atual) return;
        if (aovivoUltimo === null) { aovivoUltimo = atual; return; }
        if (atual <= aovivoUltimo) return;

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

async function iniciarAoVivo() {
    pararAoVivo();

    aovivoUltimo = await aovivoMaiorAtualizacao();
    if (typeof atualizarBannerGlobal === "function") atualizarBannerGlobal();
    aovivoTimer = setInterval(aovivoVerificar, AOVIVO_INTERVALO_MS);

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
