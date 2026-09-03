/**
 * ==========================================================
 * Assunto Engine
 * ==========================================================
 * Normaliza ordem.assunto pra unificar categorias equivalentes (ex.:
 * "Terceirizado" x sua contraparte própria) — ver
 * js/config/assuntosequivalentes.js pra tabela de mapeamentos.
 *
 * NÃO persiste nada — roda em cima de APP.dados.ordens já em memória
 * (depois de carregar do Supabase/cache local, e depois de cada
 * import novo), mesmo padrão do BairroEngine. O Supabase continua
 * guardando sempre o assunto cru da planilha; ordem.assuntoOriginal
 * guarda esse valor original antes da troca.
 */
const AssuntoEngine = {

    normalizarAssuntos(ordens) {
        const mapaEquivalencia = new Map(
            ASSUNTOS_EQUIVALENTES.map(item => [normalizarTexto(item.de), item.para])
        );

        for (const ordem of ordens.values()) {
            if (!ordem.assunto) continue;
            if (ordem.assuntoOriginal === null || ordem.assuntoOriginal === undefined) {
                ordem.assuntoOriginal = ordem.assunto;
            }

            const canonico = mapaEquivalencia.get(normalizarTexto(ordem.assuntoOriginal));
            if (canonico) ordem.assunto = canonico;
        }
    }

};
