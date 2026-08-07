/**
 * ==========================================================
 * Serviço do Auditor IA
 * ==========================================================
 * Chama a Edge Function "auditor-ia" do Supabase — ela é quem
 * fala com a Anthropic e grava o resultado no banco (ver
 * supabase/functions/auditor-ia/index.ts). Aqui só invoca e
 * repassa o resultado; a permissão (só admin) é checada de novo
 * do lado do servidor, então nem depende de confiar na UI.
 */
async function rodarAuditorIA(ordemId) {
    const { data, error } = await supabaseClient.functions.invoke("auditor-ia", {
        body: { ordemId: String(ordemId) }
    });

    if (error) {
        console.error("Falha ao rodar Auditor IA:", error);
        return { ok: false, mensagem: "Falha ao chamar o Auditor IA. Veja o console pra detalhes." };
    }

    if (data?.error) {
        return { ok: false, mensagem: data.error };
    }

    return { ok: true, avaliacao: data.avaliacao };
}
