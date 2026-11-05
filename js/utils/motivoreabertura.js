function classificarMotivoReabertura(mensagem) {
    if (!mensagem) return "indefinido";

    const texto = normalizarTexto(String(mensagem));
    const bateAlguma = expressoes => expressoes.some(expressao => texto.includes(normalizarTexto(expressao)));

    if (bateAlguma(MOTIVOS_REABERTURA.TECNICO_ERRADO)) return "tecnico_errado";
    if (bateAlguma(MOTIVOS_REABERTURA.SERVICO_NAO_EXECUTADO)) return "servico_nao_executado";
    if (bateAlguma(MOTIVOS_REABERTURA.ERRO_PROCESSO)) return "erro_processo";
    return "indefinido";
}

function escolherFechamentoEfetivo(motivo, { primeiroFechamento, ultimoFechamento, ultimaReabertura }) {
    if (motivo === "servico_nao_executado") return ultimoFechamento;
    if (motivo === "tecnico_errado") {
        const fechouDepois = ultimoFechamento?.data && ultimaReabertura?.data && ultimoFechamento.data > ultimaReabertura.data;
        if (!fechouDepois) return null;
        const corrigido = Object.assign(Object.create(Object.getPrototypeOf(ultimoFechamento)), ultimoFechamento);
        corrigido.data = primeiroFechamento?.data ?? ultimoFechamento.data;
        return corrigido;
    }
    return primeiroFechamento;
}
