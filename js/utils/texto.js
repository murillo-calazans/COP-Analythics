/**
 * ==========================================================
 * Utilitários de Texto
 * ==========================================================
 * Usados para casar nomes de colunas configurados em
 * js/config/colunas.js com os cabeçalhos reais da planilha,
 * mesmo quando maiúsculas/minúsculas ou acentuação variam
 * (ex.: "Descrição" bate com "DESCRICAO" e "descrição").
 */

function normalizarTexto(texto) {
    return String(texto)
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .trim()
        .toUpperCase();
}

function encontrarColuna(linha, nomeColuna) {
    const alvo = normalizarTexto(nomeColuna);
    const chave = Object.keys(linha).find(k => normalizarTexto(k) === alvo);
    return chave ?? null;
}

function escaparHtml(texto) {
    const div = document.createElement("div");
    div.textContent = String(texto);
    return div.innerHTML;
}
