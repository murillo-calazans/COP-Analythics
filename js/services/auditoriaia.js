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
