class Movimentacao {
    constructor({
        operador = null,
        colaboradorResponsavel = null,
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
        this.colaboradorResponsavel = colaboradorResponsavel; // quem de fato atendeu/fechou a OS (ID de uma aba PRÓPRIA da Base.xlsx, diferente da de Operadores) — só a movimentação de Fechamento costuma trazer isso preenchido; ver IndicatorEngine.nomeResponsavelFechamento
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