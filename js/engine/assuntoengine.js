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
