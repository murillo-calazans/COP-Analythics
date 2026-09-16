/**
 * ==========================================================
 * Correções Manuais da Auditoria Operacional (Supabase)
 * ==========================================================
 * Marca um achado da Auditoria (Diagnóstico x Próxima Tarefa,
 * Próxima Tarefa ausente, Diagnóstico ausente, Duplicidade) como
 * "já corrigido" — normalmente porque alguém reabriu a OS no sistema
 * de origem e acertou o processo, mas o achado continua aparecendo
 * aqui porque a Auditoria audita o 1º Fechamento (ver
 * js/engine/auditoriaoperacionalengine.js), que não muda.
 *
 * Compartilhado e aberto: diferente do resto do sistema (onde só
 * admin/editor escrevem), QUALQUER usuário logado — inclusive leitor —
 * pode marcar/desmarcar (ver database/patch-12-auditoria-correcoes.sql).
 * É uma anotação leve, não mexe em nenhum dado importado.
 *
 * Chave de cada correção: `${ordemId}||${tipoAchado}` — uma OS pode ter
 * mais de um tipo de achado ao mesmo tempo, cada um se marca separado.
 */

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

/** Marca um achado como corrigido — grava no Supabase e já atualiza APP.correcoesAuditoria em memória. */
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

/** Desfaz a marcação — quem marcou errado, ou o achado voltou a ser pendência real. */
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
