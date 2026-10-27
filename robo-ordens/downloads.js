/**
 * ==========================================================
 * Pasta fixa de downloads do navegador do robô
 * ==========================================================
 * Por padrão o Playwright salva todo download numa pasta temporária
 * (…\Temp\playwright-artifacts-xxxx), com nome aleatório SEM extensão,
 * e apaga quando o navegador fecha — por isso os arquivos "sumiam".
 *
 * configurarDownloads(ctx) faz todo download da janela cair em
 * C:\cop-robo\downloads, com o NOME ORIGINAL sugerido pelo IXC.
 * Se já existir um arquivo com o mesmo nome, numera ( (1), (2)… )
 * em vez de sobrescrever.
 *
 * Uso dentro de um script que abre o navegador:
 *   const { PASTA_DOWNLOADS, configurarDownloads } = require("./downloads");
 *   const ctx = await chromium.launchPersistentContext(PERFIL, {
 *       acceptDownloads: true, ...
 *   });
 *   configurarDownloads(ctx);
 */

const path = require("path");
const fs = require("fs");

const PASTA_DOWNLOADS = path.join(__dirname, "downloads");

function garantirPasta() {
    try { fs.mkdirSync(PASTA_DOWNLOADS, { recursive: true }); } catch (_) {}
}

// Evita sobrescrever: "relatorio.xlsx" -> "relatorio (1).xlsx" -> "relatorio (2).xlsx"
function caminhoSemColisao(nomeArquivo) {
    const ext = path.extname(nomeArquivo);
    const base = path.basename(nomeArquivo, ext);
    let tentativa = path.join(PASTA_DOWNLOADS, nomeArquivo);
    let n = 1;
    while (fs.existsSync(tentativa)) {
        tentativa = path.join(PASTA_DOWNLOADS, `${base} (${n})${ext}`);
        n++;
    }
    return tentativa;
}

function configurarDownloads(ctx, log = console.log) {
    garantirPasta();
    ctx.on("download", async (download) => {
        try {
            const sugerido = download.suggestedFilename() || `download-${Date.now()}`;
            const destino = caminhoSemColisao(sugerido);
            await download.saveAs(destino);
            log(`Download salvo em: ${destino}`);
        } catch (e) {
            log(`Falha ao salvar download: ${e.message}`);
        }
    });
}

module.exports = { PASTA_DOWNLOADS, configurarDownloads, caminhoSemColisao };
