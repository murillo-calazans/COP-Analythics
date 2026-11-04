function classificarMotivoReabertura(mensagem) {
    if (!mensagem) return "indefinido";

    const texto = normalizarTexto(String(mensagem));
    const bateAlguma = expressoes => expressoes.some(expressao => texto.includes(normalizarTexto(expressao)));

    if (bateAlguma(MOTIVOS_REABERTURA.SERVICO_NAO_EXECUTADO)) return "servico_nao_executado";
    if (bateAlguma(MOTIVOS_REABERTURA.ERRO_PROCESSO)) return "erro_processo";
    return "indefinido";
}
