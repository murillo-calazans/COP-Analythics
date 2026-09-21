/**
 * ==========================================================
 * Classificador de Motivo de Reabertura
 * ==========================================================
 * Recebe a mensagem (texto livre) do evento "Reabertura" de uma OS e
 * devolve qual das duas categorias configuradas em
 * js/config/motivosreabertura.js ela indica — ou "indefinido" se não
 * bater com nenhuma expressão conhecida. Ver IndicatorEngine.
 * analisarEventosOS (fechamentoEfetivo) pra como isso é usado.
 *
 * Checa SERVICO_NAO_EXECUTADO antes de ERRO_PROCESSO de propósito: se
 * uma mensagem (por acaso) mencionar expressões das duas listas, o lado
 * mais sério (serviço não executado, que muda o crédito) tem prioridade
 * — mais seguro do que deixar passar batido como simples acerto de
 * processo.
 */
function classificarMotivoReabertura(mensagem) {
    if (!mensagem) return "indefinido";

    const texto = normalizarTexto(String(mensagem));
    const bateAlguma = expressoes => expressoes.some(expressao => texto.includes(normalizarTexto(expressao)));

    if (bateAlguma(MOTIVOS_REABERTURA.SERVICO_NAO_EXECUTADO)) return "servico_nao_executado";
    if (bateAlguma(MOTIVOS_REABERTURA.ERRO_PROCESSO)) return "erro_processo";
    return "indefinido";
}
