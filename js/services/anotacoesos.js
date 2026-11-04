let _anotacoesOsCache = null;

async function carregarAnotacoesOs(forcar = false) {
    if (_anotacoesOsCache && !forcar) return _anotacoesOsCache;
    const mapa = new Map();
    try {
        const { data, error } = await supabaseClient
            .from("os_anotacoes")
            .select("os_id, texto, autor, atualizado_em");
        if (error) throw error;
        (data || []).forEach(r => mapa.set(String(r.os_id), r));
    } catch (e) {

        console.warn("Anotações de OS (ignorado):", e.message || e);
    }
    _anotacoesOsCache = mapa;
    return _anotacoesOsCache;
}

function anotacaoOs(osId) {
    return _anotacoesOsCache?.get(String(osId)) ?? null;
}

async function salvarAnotacaoOs(osId, texto) {
    const t = String(texto ?? "").trim();
    if (!t) return removerAnotacaoOs(osId);

    const registro = {
        os_id: String(osId),
        texto: t.slice(0, 120),
        autor: (typeof APP !== "undefined" && (APP.usuario?.nome || APP.usuario?.email)) || null,
        atualizado_em: new Date().toISOString()
    };
    const { error } = await supabaseClient.from("os_anotacoes").upsert(registro, { onConflict: "os_id" });
    if (error) throw error;
    (_anotacoesOsCache ??= new Map()).set(String(osId), registro);
    return registro;
}

async function removerAnotacaoOs(osId) {
    const { error } = await supabaseClient.from("os_anotacoes").delete().eq("os_id", String(osId));
    if (error) throw error;
    _anotacoesOsCache?.delete(String(osId));
    return null;
}
