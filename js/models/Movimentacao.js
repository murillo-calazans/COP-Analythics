class Movimentacao {
    constructor({
        operador = null,
        equipe = null,
        evento = null,
        diagnostico = null,
        status = null,
        respostaPadrao = null,
        mensagem = "",
        historico = [],
        data = null
    } = {}) {
        this.operador = operador;
        this.equipe = equipe; // quem trabalhou junto — igual ao operador = sozinho, diferente = em dupla
        this.evento = evento;
        this.diagnostico = diagnostico;
        this.status = status;
        this.respostaPadrao = respostaPadrao;
        this.mensagem = mensagem;
        this.historico = Array.isArray(historico) ? historico : [historico].filter(Boolean);
        this.data = data; // sempre um Date, nunca string
    }

    adicionarHistorico(texto) {
        if (texto) this.historico.push(texto);
    }
}