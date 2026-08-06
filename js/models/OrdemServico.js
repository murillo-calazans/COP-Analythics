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
        this.login = login; // identificador de recorrência — um cliente pode ter vários logins, mas cada login é único
        this.cidade = cidade;
        this.bairro = bairro;
        this.assunto = assunto;

        this.statusAtual = null;
        this.tecnicoResponsavel = null; // operador da movimentação mais recente (não necessariamente a última importada)
        this.dataAbertura = dataAbertura;
        this.dataFechamento = null;

        this.movimentacoes = []; // Movimentacao[]

        // Reservados para as próximas camadas (Business/Intelligence Engine)
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

            // statusAtual/tecnicoResponsavel vêm da movimentação com a MAIOR
            // data, não da última lida do arquivo — planilhas não garantem
            // que as linhas de uma OS estejam em ordem cronológica.
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
