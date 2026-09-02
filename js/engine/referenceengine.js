function construirMap(linhas, chaveCol, nomeAba) {
    if (linhas.length === 0) return new Map();

    const colunaReal = encontrarColuna(linhas[0], chaveCol);

    if (!colunaReal) {
        throw new Error(
            `Coluna-chave "${chaveCol}" não encontrada na aba ${nomeAba}. ` +
            `Ajuste CONFIG_BASE em js/config/colunas.js. ` +
            `Colunas disponíveis nessa aba: ${Object.keys(linhas[0]).join(", ")}`
        );
    }

    const mapa = new Map();

    for (const linha of linhas) {
        const chave = linha[colunaReal];
        if (chave === undefined || chave === null || chave === "") continue;
        mapa.set(chave, linha);
    }

    return mapa;
}

const ReferenceEngine = {
    carregar(workbook) {
        const abaOperadores = encontrarAba(workbook, "OPERADOR");
        const abaEventos = encontrarAba(workbook, "EVENTO");
        const abaDiagnosticos = encontrarAba(workbook, "DIAGN");
        // Opcional (não entra na checagem de "incompleta" abaixo) — Base.xlsx
        // de antes dessa aba existir continua carregando normalmente, só
        // sem resolver nome de Colaborador Responsável (fica no código cru).
        const abaColaboradoresResponsaveis = encontrarAba(workbook, "RESPONS");

        if (!abaOperadores || !abaEventos || !abaDiagnosticos) {
            throw new Error(
                "Base.xlsx incompleta: uma ou mais abas de referência não foram encontradas. " +
                `Abas encontradas no arquivo: ${workbook.SheetNames.join(", ")}`
            );
        }

        const operadores = construirMap(
            XLSX.utils.sheet_to_json(corrigirRangeSheet(abaOperadores)),
            CONFIG_BASE.operadores.chave,
            "Operadores"
        );

        const eventos = construirMap(
            XLSX.utils.sheet_to_json(corrigirRangeSheet(abaEventos)),
            CONFIG_BASE.eventos.chave,
            "Eventos"
        );

        const diagnosticos = construirMap(
            XLSX.utils.sheet_to_json(corrigirRangeSheet(abaDiagnosticos)),
            CONFIG_BASE.diagnosticos.chave,
            "Diagnósticos"
        );

        const colaboradoresResponsaveis = abaColaboradoresResponsaveis
            ? construirMap(
                XLSX.utils.sheet_to_json(corrigirRangeSheet(abaColaboradoresResponsaveis)),
                CONFIG_BASE.colaboradoresResponsaveis.chave,
                "Colaborador Responsável"
            )
            : new Map();

        return { operadores, eventos, diagnosticos, colaboradoresResponsaveis };
    }
};

function encontrarAba(workbook, palavraChave) {
    const nomeAba = workbook.SheetNames.find(nome =>
        nome.toUpperCase().includes(palavraChave)
    );
    return nomeAba ? workbook.Sheets[nomeAba] : null;
}