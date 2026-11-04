class OrdemServico {
    constructor({
        id,
        cliente = null,
        login = null,
        cidade = null,
        bairro = null,
        assunto = null,
        dataAbertura = null
    } = {}) {
        this.id = id;
        this.cliente = cliente;
        this.login = login;
        this.cidade = cidade;
        this.bairro = bairro;
        this.bairroOriginal = null;
        this.assunto = assunto;
        this.assuntoOriginal = null;

        this.statusAtual = null;
        this.tecnicoResponsavel = null;
        this.dataAbertura = dataAbertura;
        this.dataFechamento = null;
        this.lat = null;
        this.lng = null;

        this.movimentacoes = [];

        this.indicadores = {};
        this.alertas = [];
        this.auditoriaIA = null;
    }

    adicionarMovimentacao(movimentacao) {
        if (!(movimentacao instanceof Movimentacao)) {
            throw new Error("Objeto inválido: esperado uma instância de Movimentacao");
        }

        this.movimentacoes.push(movimentacao);

        if (movimentacao.data) {
            if (!this.dataAbertura || movimentacao.data < this.dataAbertura) {
                this.dataAbertura = movimentacao.data;
            }

            if (!this.dataFechamento || movimentacao.data >= this.dataFechamento) {
                this.dataFechamento = movimentacao.data;
                this.statusAtual = movimentacao.status ?? this.statusAtual;
                this.tecnicoResponsavel = movimentacao.operador ?? this.tecnicoResponsavel;
            }
        } else if (this.statusAtual === null) {
            this.statusAtual = movimentacao.status;
            this.tecnicoResponsavel = movimentacao.operador;
        }
    }
}
