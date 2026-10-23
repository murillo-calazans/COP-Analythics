/**
 * ==========================================================
 * Anotações manuais por OS (acompanhamento do COP)
 * ==========================================================
 * Nota curta que o COP cola numa OS pendente ("área de risco", "em
 * tratativa", "agendado"…) só pra sinalizar que já está sendo tratada.
 * Guardada no Supabase (tabela os_anotacoes, ver patch-29), presa ao número
 * da OS — sobrevive à puxada de hora em hora. Cache em memória pra o popup
 * mostrar na hora; recarregado junto com os dados ao vivo.
 */

let _anotacoesOsCache = null;   // Map os_id(string) -> { os_id, texto, autor, atualizado_em }

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
        // tabela ainda não criada (patch-29) ou sem rede: silencioso, só não mostra nota
        console.warn("Anotações de OS (ignorado):", e.message || e);
    }
    _anotacoesOsCache = mapa;
    return _anotacoesOsCache;
}

/** Nota atual de uma OS (ou null). Lê do cache já carregado. */
function anotacaoOs(osId) {
    return _anotacoesOsCache?.get(String(osId)) ?? null;
}

/** Salva/atualiza a nota (texto vazio = remove). Atualiza o cache. */
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
