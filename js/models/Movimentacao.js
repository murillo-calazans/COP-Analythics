class Movimentacao {
    constructor({
        operador = null,
        colaboradorResponsavel = null,
        equipe = null,
        evento = null,
        diagnostico = null,
        proximaTarefa = null,
        status = null,
        respostaPadrao = null,
        mensagem = "",
        historico = [],
        data = null
    } = {}) {
        this.operador = operador;
        this.colaboradorResponsavel = colaboradorResponsavel;
        this.equipe = equipe;
        this.evento = evento;
        this.diagnostico = diagnostico;
        this.proximaTarefa = proximaTarefa;
        this.status = status;
        this.respostaPadrao = respostaPadrao;
        this.mensagem = mensagem;
        this.historico = Array.isArray(historico) ? historico : [historico].filter(Boolean);
        this.data = data;
    }

    adicionarHistorico(texto) {
        if (texto) this.historico.push(texto);
    }
}
