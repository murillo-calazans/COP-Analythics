/**
 * ==========================================================
 * Utilitários de Datas
 * ==========================================================
 * Converte valores vindos do Excel (Date, número serial ou
 * texto dd/mm/aaaa) sempre para um objeto Date nativo.
 */

function paraData(valor) {
    if (!valor) return null;
    if (valor instanceof Date) {
        return isNaN(valor.getTime()) ? null : valor;
    }

    if (typeof valor === "number") {
        // Data serial do Excel (dias desde 1899-12-30)
        const data = new Date(Math.round((valor - 25569) * 86400 * 1000));
        return isNaN(data.getTime()) ? null : data;
    }

    if (typeof valor === "string") {
        const texto = valor.trim();
        if (!texto) return null;

        const match = texto.match(
            /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
        );

        if (match) {
            const [, dia, mes, ano, hora = "0", min = "0", seg = "0"] = match;
            const anoCompleto = ano.length === 2 ? Number(ano) + 2000 : Number(ano);
            const data = new Date(
                anoCompleto, Number(mes) - 1, Number(dia),
                Number(hora), Number(min), Number(seg)
            );
            return isNaN(data.getTime()) ? null : data;
        }

        const data = new Date(texto);
        return isNaN(data.getTime()) ? null : data;
    }

    return null;
}
