/**
 * ==========================================================
 * Utilitários de Planilha (XLSX)
 * ==========================================================
 * Alguns exportadores de Excel (relatórios gerados por sistema,
 * como o IXC, e não criados manualmente) gravam a dimensão da
 * aba ("!ref") errada ou ausente. Isso faz o SheetJS enxergar a
 * aba como vazia mesmo com dados visíveis nela. Esta função
 * recalcula o "!ref" a partir das células realmente preenchidas
 * antes de converter a aba para JSON.
 */

function corrigirRangeSheet(sheet) {
    const enderecos = Object.keys(sheet).filter(chave => chave[0] !== "!");
    if (enderecos.length === 0) return sheet;

    // Loop manual em vez de Math.min(...array): com planilhas grandes
    // (centenas de milhares de células), o spread operator estoura a
    // pilha de chamadas do JS ("Maximum call stack size exceeded").
    let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;

    for (const endereco of enderecos) {
        const { r, c } = XLSX.utils.decode_cell(endereco);
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
    }

    const range = {
        s: { r: minR, c: minC },
        e: { r: maxR, c: maxC }
    };

    sheet["!ref"] = XLSX.utils.encode_range(range);
    return sheet;
}

/**
 * Muitos sistemas (IXC incluído) exportam "relatório em Excel" que na
 * verdade é uma tabela HTML salva com extensão .xlsx/.xls. O Excel abre
 * normal porque ele converte na hora, mas o SheetJS lê os bytes crus e
 * não reconhece isso como planilha real — resultando em "0 células".
 * Detectamos o formato pela assinatura dos primeiros bytes do arquivo.
 */
function detectarTipoArquivo(buffer) {
    const bytes = new Uint8Array(buffer.slice(0, 8));

    // ZIP (.xlsx/.xlsm reais começam com "PK")
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) return "zip";

    // OLE Compound File (.xls binário antigo)
    if (bytes[0] === 0xd0 && bytes[1] === 0xcf) return "ole";

    let texto = new TextDecoder("utf-8").decode(bytes).trim().toLowerCase();
    if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1); // remove BOM, se houver

    if (texto.startsWith("<")) return "html";

    return "desconhecido";
}

/**
 * Lê a primeira <table> de um arquivo HTML (disfarçado de .xlsx) e
 * devolve no mesmo formato que XLSX.utils.sheet_to_json produziria:
 * um array de objetos, um por linha, chaveado pelo cabeçalho.
 */
function lerTabelaHtml(buffer) {
    const texto = new TextDecoder("utf-8").decode(buffer);
    const doc = new DOMParser().parseFromString(texto, "text/html");
    const tabela = doc.querySelector("table");

    if (!tabela) return [];

    const linhasTr = Array.from(tabela.querySelectorAll("tr"));
    if (linhasTr.length === 0) return [];

    const cabecalho = Array.from(linhasTr[0].querySelectorAll("th, td"))
        .map(celula => celula.textContent.trim());

    const linhas = [];

    for (const tr of linhasTr.slice(1)) {
        const celulas = Array.from(tr.querySelectorAll("td, th")).map(c => c.textContent.trim());
        if (celulas.every(c => c === "")) continue;

        const linha = {};
        cabecalho.forEach((nomeCol, i) => {
            linha[nomeCol] = celulas[i] ?? "";
        });
        linhas.push(linha);
    }

    return linhas;
}
