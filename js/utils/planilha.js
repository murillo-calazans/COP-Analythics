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

/**
 * ==========================================================
 * Leitura de .xlsx grande "em streaming"
 * ==========================================================
 * O SheetJS descompacta o XML da aba inteiro numa única string JS. O
 * V8 limita strings a ~512 MB — um export do IXC com ~350 mil linhas
 * (aba de ~585 MB descompactada, todas as células como inlineStr)
 * passa disso, e o SheetJS devolve a aba VAZIA, sem erro nenhum.
 *
 * Aqui o .xlsx é lido direto: o índice do ZIP é percorrido à mão, o
 * XML da aba é descompactado aos pedaços (DecompressionStream) e as
 * linhas são extraídas conforme chegam, sem nunca montar o XML
 * inteiro na memória. Devolve o mesmo formato de
 * XLSX.utils.sheet_to_json(sheet, { defval: "" }) com cellDates: true.
 */

// Acima disso (tamanho DESCOMPACTADO de alguma entrada do ZIP) nem
// tenta o SheetJS — vai direto pro streaming.
const LIMITE_XML_SHEETJS_BYTES = 256 * 1024 * 1024;

function listarEntradasZip(buffer) {
    const view = new DataView(buffer);
    const decoder = new TextDecoder("utf-8");

    // End Of Central Directory: fica nos últimos 22 bytes + comentário (até 64 KB).
    let eocd = -1;
    for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) {
        if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("Arquivo .xlsx corrompido (índice do ZIP não encontrado).");

    const totalEntradas = view.getUint16(eocd + 10, true);
    let p = view.getUint32(eocd + 16, true);
    const entradas = new Map();

    for (let i = 0; i < totalEntradas; i++) {
        if (view.getUint32(p, true) !== 0x02014b50) break;
        const tamNome = view.getUint16(p + 28, true);
        const tamExtra = view.getUint16(p + 30, true);
        const tamComentario = view.getUint16(p + 32, true);
        const nome = decoder.decode(new Uint8Array(buffer, p + 46, tamNome));

        entradas.set(nome, {
            metodo: view.getUint16(p + 10, true),
            tamanhoCompactado: view.getUint32(p + 20, true),
            tamanho: view.getUint32(p + 24, true),
            offsetLocal: view.getUint32(p + 42, true)
        });
        p += 46 + tamNome + tamExtra + tamComentario;
    }
    return entradas;
}

function planilhaGrandeDemaisParaSheetJS(buffer) {
    try {
        for (const entrada of listarEntradasZip(buffer).values()) {
            if (entrada.tamanho > LIMITE_XML_SHEETJS_BYTES) return true;
        }
    } catch (erro) {
        console.warn("Não foi possível ler o índice do ZIP:", erro);
    }
    return false;
}

// Gera o texto (UTF-8 já decodificado) de uma entrada do ZIP, aos pedaços.
async function* lerEntradaZipEmPedacos(buffer, entrada) {
    const view = new DataView(buffer);
    const p = entrada.offsetLocal;
    const inicio = p + 30 + view.getUint16(p + 26, true) + view.getUint16(p + 28, true);
    const bytes = new Uint8Array(buffer, inicio, entrada.tamanhoCompactado);

    let stream = new Blob([bytes]).stream();
    if (entrada.metodo === 8) stream = stream.pipeThrough(new DecompressionStream("deflate-raw"));
    else if (entrada.metodo !== 0) throw new Error(`Compressão ZIP não suportada (método ${entrada.metodo}).`);

    const reader = stream.pipeThrough(new TextDecoderStream("utf-8")).getReader();
    while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
    }
}

// Percorre uma entrada XML entregando, a cada pedaço, só o trecho que
// termina num elemento completo (fechado por `tagFechamento`).
async function percorrerXmlPorElementos(buffer, entrada, tagFechamento, processarTrecho) {
    let resto = "";
    let ultimaPausa = Date.now();
    for await (const pedaco of lerEntradaZipEmPedacos(buffer, entrada)) {
        resto += pedaco;
        const fim = resto.lastIndexOf(tagFechamento);
        if (fim < 0) continue;
        const corte = fim + tagFechamento.length;
        processarTrecho(resto.slice(0, corte));
        resto = resto.slice(corte);

        // Deixa a tela atualizar o progresso de vez em quando — não a
        // cada pedaço (~16 KB): o setTimeout tem resolução de 4–15 ms e,
        // com dezenas de milhares de pedaços, só a espera levava minutos.
        if (Date.now() - ultimaPausa > 100) {
            await new Promise(r => setTimeout(r, 0));
            ultimaPausa = Date.now();
        }
    }
    if (resto) processarTrecho(resto);
}

async function lerEntradaZipInteira(buffer, entrada) {
    let texto = "";
    for await (const pedaco of lerEntradaZipEmPedacos(buffer, entrada)) texto += pedaco;
    return texto;
}

function desescaparXml(texto) {
    if (texto.indexOf("&") < 0 && texto.indexOf("_x") < 0) return texto;
    return texto
        .replace(/_x([0-9A-Fa-f]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
        .replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (_, e) => {
            switch (e) {
                case "amp": return "&";
                case "lt": return "<";
                case "gt": return ">";
                case "quot": return "\"";
                case "apos": return "'";
                default: return String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
            }
        });
}

// Pedaços de string extraídos via regex/slice continuam apontando pro
// pedaço inteiro do XML de onde vieram (sliced string do V8) — guardar
// milhões deles manteria o XML todo vivo na memória. A concatenação
// seguida de slice força uma cópia independente.
function copiarString(texto) {
    return texto.length < 13 ? texto : (" " + texto).slice(1);
}

function textoDosNosT(xml) {
    let texto = "";
    const re = /<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g;
    let m;
    while ((m = re.exec(xml))) texto += m[1] ?? "";
    return desescaparXml(texto);
}

function indiceColuna(letras) {
    let n = 0;
    for (let i = 0; i < letras.length; i++) n = n * 26 + (letras.charCodeAt(i) - 64);
    return n - 1;
}

// numFmtId nativos do Excel que são data/hora.
const NUMFMTS_DATA_NATIVOS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

// Índices de estilo (atributo s="" da célula) cujo formato é data/hora.
function estilosDeData(stylesXml) {
    const formatosCustomData = new Set();
    for (const m of stylesXml.matchAll(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) {
        const codigo = desescaparXml(m[2]).replace(/"[^"]*"|\[[^\]]*\]|\\./g, "");
        if (/[dmyhs]/i.test(codigo)) formatosCustomData.add(Number(m[1]));
    }

    const estilos = new Set();
    const cellXfs = stylesXml.match(/<cellXfs\b[\s\S]*?<\/cellXfs>/);
    if (!cellXfs) return estilos;

    let i = 0;
    for (const m of cellXfs[0].matchAll(/<xf\b([^>]*)/g)) {
        const id = Number((m[1].match(/numFmtId="(\d+)"/) || [])[1] ?? 0);
        if (NUMFMTS_DATA_NATIVOS.has(id) || formatosCustomData.has(id)) estilos.add(i);
        i++;
    }
    return estilos;
}

// Serial do Excel -> Date no fuso local (mesmo comportamento do cellDates do SheetJS).
function serialExcelParaData(serial, data1904) {
    const utc = new Date(Math.round((serial - (data1904 ? 24107 : 25569)) * 86400000));
    return new Date(utc.getTime() + utc.getTimezoneOffset() * 60000);
}

function resolverCaminhoZip(base, alvo) {
    if (alvo.startsWith("/")) return alvo.slice(1);
    const partes = base.split("/").slice(0, -1);
    for (const parte of alvo.split("/")) {
        if (parte === "..") partes.pop();
        else if (parte !== ".") partes.push(parte);
    }
    return partes.join("/");
}

async function lerXlsxEmStreaming(buffer, aoProgredir = () => {}) {
    const entradas = listarEntradasZip(buffer);

    const workbookXml = await lerEntradaZipInteira(buffer, entradas.get("xl/workbook.xml"));
    const relsXml = await lerEntradaZipInteira(buffer, entradas.get("xl/_rels/workbook.xml.rels"));
    const data1904 = /date1904="(1|true)"/.test(workbookXml);

    const alvosPorId = new Map();
    for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
        const id = (m[0].match(/\bId="([^"]+)"/) || [])[1];
        const alvo = (m[0].match(/\bTarget="([^"]+)"/) || [])[1];
        if (id && alvo) alvosPorId.set(id, resolverCaminhoZip("xl/workbook.xml", alvo));
    }

    const estilosData = entradas.has("xl/styles.xml")
        ? estilosDeData(await lerEntradaZipInteira(buffer, entradas.get("xl/styles.xml")))
        : new Set();

    const compartilhadas = [];
    if (entradas.has("xl/sharedStrings.xml")) {
        await percorrerXmlPorElementos(buffer, entradas.get("xl/sharedStrings.xml"), "</si>", trecho => {
            for (const m of trecho.matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)) {
                compartilhadas.push(copiarString(textoDosNosT(m[1] ?? "")));
            }
        });
    }

    const valorDaCelula = (atributos, conteudo) => {
        const tipo = (atributos.match(/\bt="(\w+)"/) || [])[1] ?? "n";
        if (tipo === "inlineStr") return copiarString(textoDosNosT(conteudo));

        const v = (conteudo.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        if (v === undefined) return "";

        switch (tipo) {
            case "s": return compartilhadas[Number(v)] ?? "";
            case "b": return v === "1";
            case "d": return new Date(v);
            case "str":
            case "e": return copiarString(desescaparXml(v));
            default: {
                const numero = Number(v);
                const estilo = Number((atributos.match(/\bs="(\d+)"/) || [])[1] ?? 0);
                return estilosData.has(estilo) ? serialExcelParaData(numero, data1904) : numero;
            }
        }
    };

    for (const m of workbookXml.matchAll(/<sheet\b[^>]*>/g)) {
        const nomeAba = desescaparXml((m[0].match(/\bname="([^"]*)"/) || [])[1] ?? "");
        const rid = (m[0].match(/\br:id="([^"]+)"/) || [])[1];
        const entrada = entradas.get(alvosPorId.get(rid));
        if (!entrada) continue;

        let cabecalho = null;
        const linhas = [];

        await percorrerXmlPorElementos(buffer, entrada, "</row>", trecho => {
            for (const mr of trecho.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
                if (!mr[1]) continue;

                const valores = [];
                let proxima = 0;
                for (const mc of mr[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
                    const ref = (mc[1].match(/\br="([A-Z]+)\d*"/) || [])[1];
                    const col = ref ? indiceColuna(ref) : proxima;
                    valores[col] = valorDaCelula(mc[1], mc[2] ?? "");
                    proxima = col + 1;
                }

                if (!cabecalho) {
                    // Mesmo esquema do sheet_to_json: vazio vira __EMPTY, repetido ganha _1, _2...
                    const usados = new Map();
                    cabecalho = Array.from({ length: valores.length }, (_, i) => {
                        const base = valores[i] === undefined || valores[i] === "" ? "__EMPTY" : String(valores[i]);
                        const n = usados.get(base) ?? 0;
                        usados.set(base, n + 1);
                        return n === 0 ? base : `${base}_${n}`;
                    });
                    continue;
                }

                if (valores.every(v => v === undefined || v === "")) continue;

                const linha = {};
                cabecalho.forEach((nomeCol, i) => {
                    linha[nomeCol] = valores[i] ?? "";
                });
                linhas.push(linha);
            }
            aoProgredir(linhas.length);
        });

        if (linhas.length > 0) return { nomeAba, linhas };
    }

    return { nomeAba: null, linhas: [] };
}
