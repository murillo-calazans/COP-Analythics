function chaveCorrecaoAuditoria(ordemId, tipoAchado) {
    return `${ordemId}||${tipoAchado}`;
}

async function buscarCorrecoesAuditoria() {
    try {
        const linhas = await buscarTodasLinhas("auditoria_correcoes", "*", "id");

        const mapa = new Map();
        for (const linha of linhas) {
            mapa.set(chaveCorrecaoAuditoria(linha.ordem_id, linha.tipo_achado), {
                corrigidoPor: linha.corrigido_por,
                corrigidoEm: linha.corrigido_em
            });
        }
        return mapa;
    } catch (erro) {
        console.error("Falha ao buscar correções da Auditoria:", erro);
        return new Map();
    }
}

async function marcarAchadoCorrigido(ordemId, tipoAchado) {
    const registro = {
        corrigidoPor: APP.usuario?.email ?? null,
        corrigidoEm: new Date().toISOString()
    };

    const { error } = await supabaseClient.from("auditoria_correcoes").upsert({
        ordem_id: String(ordemId),
        tipo_achado: tipoAchado,
        corrigido_por: registro.corrigidoPor,
        corrigido_em: registro.corrigidoEm
    }, { onConflict: "ordem_id,tipo_achado" });

    if (error) {
        console.error("Falha ao marcar achado como corrigido:", error);
        return false;
    }

    APP.correcoesAuditoria.set(chaveCorrecaoAuditoria(ordemId, tipoAchado), registro);
    return true;
}

async function desmarcarAchadoCorrigido(ordemId, tipoAchado) {
    const { error } = await supabaseClient
        .from("auditoria_correcoes")
        .delete()
        .eq("ordem_id", String(ordemId))
        .eq("tipo_achado", tipoAchado);

    if (error) {
        console.error("Falha ao desmarcar achado como corrigido:", error);
        return false;
    }

    APP.correcoesAuditoria.delete(chaveCorrecaoAuditoria(ordemId, tipoAchado));
    return true;
}
