/**
 * ==========================================================
 * Utilitários de Formatação
 * ==========================================================
 */

function formatarDataHora(data) {
    if (!data) return "-";
    return data.toLocaleString("pt-BR");
}

function formatarDuracaoHoras(horas) {
    if (horas === null || horas === undefined || Number.isNaN(horas)) return "-";

    if (horas < 1) {
        return `${Math.round(horas * 60)} min`;
    }

    if (horas < 24) {
        return `${horas.toFixed(1)} h`;
    }

    const dias = Math.floor(horas / 24);
    const horasRestantes = Math.round(horas % 24);
    return `${dias}d ${horasRestantes}h`;
}
