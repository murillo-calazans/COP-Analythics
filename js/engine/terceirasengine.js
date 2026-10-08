/**
 * ==========================================================
 * Gestão de Terceiras — cálculo
 * ==========================================================
 * Quanto pagar a cada terceirizada no mês, pela LPU, e a qualidade
 * do serviço delas. Regras (confirmadas pelo usuário):
 *
 * - Quem executou = sufixo do NOME de quem ficou com o crédito do
 *   fechamento ("FULANO - AZUL"); sem sufixo = técnico interno. Nunca
 *   pelo setor nem pelo assunto "- TERCEIRIZADO".
 * - Mês e crédito = fechamentoEfetivo (o mesmo do resto do sistema:
 *   reabertura feita pelo COP pra corrigir processo não tira o crédito
 *   de quem foi a campo).
 * - Produtivo ou não = diagnóstico FINAL (ultimoFechamento), igual aos
 *   relatórios agrupados por diagnóstico. A classificação é a da aba
 *   LPU (terceiras_config.diagnosticos), compartilhada no banco.
 * - Valor = LPU[assunto][terceira]. Sem valor = "sem preço"
 *   (pendência, não paga); 0 = não paga de propósito.
 * - Só fechamento produtivo é pago. Reagendamento não é fechamento,
 *   então nem entra.
 * - Retrabalho só é MOSTRADO (aba Qualidade), não desconta nada.
 *
 * Não respeita o Filtro Global: pagamento não pode depender do
 * recorte que estiver na tela.
 */

const TERCEIRAS = [
    { id: "AZUL", nome: "Azul", sufixos: ["AZUL"] },
    { id: "VELOZ", nome: "Veloz", sufixos: ["VELOZ"] },
    { id: "TECHNOMAIS", nome: "Technomais", sufixos: ["TECHNOMAIS", "TECNHOMAIS"] }
];

const SITUACAO_PAGAMENTO = {
    PAGA: "paga",
    IMPRODUTIVA: "improdutiva",
    SEM_PRECO: "sem_preco",
    NAO_PAGA: "nao_paga",          // LPU = 0
    DIAG_PENDENTE: "diag_pendente" // diagnóstico ainda não classificado na aba LPU
};

const TerceirasEngine = {

    DIAS_RETORNO: 30,
    ASSUNTO_GARANTIA: "GARANTIA TERCEIRIZADA", // canônico de "REPARO PÓS INSTALAÇÃO TERCEIRIZADA" (assuntosequivalentes.js)

    /** "JOÃO SILVA - AZUL" -> "AZUL"; sem sufixo de terceirizada -> null. */
    terceiraDoNome(nome) {
        const m = normalizarTexto(nome ?? "").match(/-\s*([A-Z]+)\s*$/);
        if (!m) return null;
        return TERCEIRAS.find(t => t.sufixos.includes(m[1]))?.id ?? null;
    },

    nomeTerceira(id) {
        return TERCEIRAS.find(t => t.id === id)?.nome ?? id;
    },

    chaveMes(data) {
        return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
    },

    nomeDiagnostico(mov) {
        if (!mov) return null;
        return AuditEngine.resolverReferencia(APP.referencias.diagnosticos, mov.diagnostico, CONFIG_BASE.diagnosticos.nome);
    },

    /** Busca na LPU ignorando acento/maiúscula. undefined = sem preço. */
    precoLpu(config, assunto, terceira) {
        const alvo = normalizarTexto(assunto ?? "");
        for (const [chave, precos] of Object.entries(config.lpu ?? {})) {
            if (normalizarTexto(chave) !== alvo) continue;
            const valor = precos?.[terceira];
            return valor === null || valor === undefined || valor === "" ? undefined : Number(valor);
        }
        return undefined;
    },

    /** true = produtivo, false = improdutivo, undefined = não classificado. */
    diagnosticoProdutivo(config, diagnostico) {
        const alvo = normalizarTexto(diagnostico ?? "");
        for (const [chave, produtivo] of Object.entries(config.diagnosticos ?? {})) {
            if (normalizarTexto(chave) === alvo) return produtivo === true ? true : produtivo === false ? false : undefined;
        }
        return undefined;
    },

    /**
     * Todas as OS fechadas por terceirizada no mês, com a situação de
     * pagamento de cada uma. analise = IndicatorEngine.analisarEventosDeTodas
     * (passada de fora pra não recalcular a cada aba).
     */
    itensDoMes(mes, config, analise) {
        const itens = [];

        for (const ordem of APP.dados.ordens.values()) {
            const info = analise.get(ordem.id);
            const efetivo = info?.fechamentoEfetivo;
            if (!efetivo?.data || this.chaveMes(efetivo.data) !== mes) continue;

            const tecnico = IndicatorEngine.nomeResponsavelFechamento(efetivo);
            const terceira = this.terceiraDoNome(tecnico);
            if (!terceira) continue;

            const diagnostico = this.nomeDiagnostico(info.ultimoFechamento ?? efetivo);
            const produtivo = this.diagnosticoProdutivo(config, diagnostico);
            const preco = this.precoLpu(config, ordem.assunto, terceira);

            let situacao;
            if (produtivo === undefined) situacao = SITUACAO_PAGAMENTO.DIAG_PENDENTE;
            else if (produtivo === false) situacao = SITUACAO_PAGAMENTO.IMPRODUTIVA;
            else if (preco === undefined) situacao = SITUACAO_PAGAMENTO.SEM_PRECO;
            else if (preco === 0) situacao = SITUACAO_PAGAMENTO.NAO_PAGA;
            else situacao = SITUACAO_PAGAMENTO.PAGA;

            itens.push({
                os: ordem.id,
                data: efetivo.data.toISOString(),
                terceira,
                tecnico,
                cliente: ordem.cliente,
                login: ordem.login,
                cidade: ordem.cidade,
                bairro: ordem.bairro,
                assunto: ordem.assunto,
                diagnostico,
                situacao,
                valor: situacao === SITUACAO_PAGAMENTO.PAGA ? preco : 0,
                precoLpu: preco ?? null
            });
        }

        return itens.sort((a, b) => a.data.localeCompare(b.data));
    },

    /** Totais de uma lista de itens (de uma terceirizada ou de todas). */
    resumir(itens) {
        const contar = situacao => itens.filter(i => i.situacao === situacao).length;
        const porAssunto = new Map();

        for (const item of itens.filter(i => i.situacao === SITUACAO_PAGAMENTO.PAGA)) {
            const chave = item.assunto ?? "Sem assunto";
            const atual = porAssunto.get(chave) ?? { assunto: chave, quantidade: 0, valorUnitario: item.valor, subtotal: 0 };
            atual.quantidade++;
            atual.subtotal += item.valor;
            porAssunto.set(chave, atual);
        }

        return {
            totalOS: itens.length,
            pagas: contar(SITUACAO_PAGAMENTO.PAGA),
            improdutivas: contar(SITUACAO_PAGAMENTO.IMPRODUTIVA),
            naoPagas: contar(SITUACAO_PAGAMENTO.NAO_PAGA),
            semPreco: contar(SITUACAO_PAGAMENTO.SEM_PRECO),
            diagPendente: contar(SITUACAO_PAGAMENTO.DIAG_PENDENTE),
            total: itens.reduce((s, i) => s + (i.valor || 0), 0),
            porAssunto: [...porAssunto.values()].sort((a, b) => b.subtotal - a.subtotal)
        };
    },

    /** Assuntos sem preço e diagnósticos sem classificação, com contagem. */
    pendencias(itens) {
        const assuntos = new Map();
        const diagnosticos = new Map();
        for (const item of itens) {
            if (item.situacao === SITUACAO_PAGAMENTO.SEM_PRECO) {
                const chave = `${item.assunto ?? "Sem assunto"}|${item.terceira}`;
                assuntos.set(chave, (assuntos.get(chave) ?? 0) + 1);
            }
            if (item.situacao === SITUACAO_PAGAMENTO.DIAG_PENDENTE) {
                const chave = item.diagnostico ?? "Sem diagnóstico";
                diagnosticos.set(chave, (diagnosticos.get(chave) ?? 0) + 1);
            }
        }
        return {
            assuntos: [...assuntos].map(([chave, quantidade]) => {
                const [assunto, terceira] = chave.split("|");
                return { assunto, terceira, quantidade };
            }).sort((a, b) => b.quantidade - a.quantidade),
            diagnosticos: [...diagnosticos].map(([diagnostico, quantidade]) => ({ diagnostico, quantidade }))
                .sort((a, b) => b.quantidade - a.quantidade)
        };
    },

    /**
     * Assuntos e diagnósticos que as terceirizadas fecharam nos dados
     * carregados (todos os meses) — base das tabelas da aba LPU.
     */
    catalogo(analise) {
        const assuntos = new Map();
        const diagnosticos = new Map();

        for (const ordem of APP.dados.ordens.values()) {
            const info = analise.get(ordem.id);
            const efetivo = info?.fechamentoEfetivo;
            if (!efetivo) continue;
            const terceira = this.terceiraDoNome(IndicatorEngine.nomeResponsavelFechamento(efetivo));
            if (!terceira) continue;

            const assunto = ordem.assunto ?? "Sem assunto";
            const a = assuntos.get(assunto) ?? { assunto, total: 0, porTerceira: {} };
            a.total++;
            a.porTerceira[terceira] = (a.porTerceira[terceira] ?? 0) + 1;
            assuntos.set(assunto, a);

            const diagnostico = this.nomeDiagnostico(info.ultimoFechamento ?? efetivo) ?? "Sem diagnóstico";
            diagnosticos.set(diagnostico, (diagnosticos.get(diagnostico) ?? 0) + 1);
        }

        return {
            assuntos: [...assuntos.values()].sort((a, b) => b.total - a.total),
            diagnosticos: [...diagnosticos].map(([diagnostico, total]) => ({ diagnostico, total })).sort((a, b) => b.total - a.total)
        };
    },

    /**
     * Qualidade no mês, por terceirizada:
     * - reaberturas: OS do mês que tiveram Reabertura;
     * - retornos: o mesmo cliente (login) abriu outra OS em até
     *   DIAS_RETORNO dias depois do fechamento da terceirizada;
     * - garantias: dos retornos, os que vieram como GARANTIA TERCEIRIZADA.
     */
    qualidadeDoMes(mes, analise) {
        const fechadasNoMes = [];
        const porLogin = new Map();

        for (const ordem of APP.dados.ordens.values()) {
            if (ordem.login) {
                if (!porLogin.has(ordem.login)) porLogin.set(ordem.login, []);
                porLogin.get(ordem.login).push(ordem);
            }
            const info = analise.get(ordem.id);
            const efetivo = info?.fechamentoEfetivo;
            if (!efetivo?.data || this.chaveMes(efetivo.data) !== mes) continue;
            const tecnico = IndicatorEngine.nomeResponsavelFechamento(efetivo);
            const terceira = this.terceiraDoNome(tecnico);
            if (terceira) fechadasNoMes.push({ ordem, info, efetivo, tecnico, terceira });
        }

        const resultado = new Map(TERCEIRAS.map(t => [t.id, { terceira: t.id, fechadas: 0, reabertas: 0, retornos: [], garantias: 0 }]));
        const alvoGarantia = normalizarTexto(this.ASSUNTO_GARANTIA);

        for (const { ordem, info, efetivo, tecnico, terceira } of fechadasNoMes) {
            const r = resultado.get(terceira);
            r.fechadas++;
            if (info.temReabertura) r.reabertas++;

            const limite = efetivo.data.getTime() + this.DIAS_RETORNO * 86400000;
            const seguinte = (porLogin.get(ordem.login) ?? [])
                .filter(o => o.id !== ordem.id && o.dataAbertura && o.dataAbertura > efetivo.data && o.dataAbertura.getTime() <= limite)
                .sort((a, b) => a.dataAbertura - b.dataAbertura)[0];
            if (!seguinte) continue;

            const garantia = normalizarTexto(seguinte.assunto ?? "") === alvoGarantia;
            if (garantia) r.garantias++;
            r.retornos.push({
                os: ordem.id,
                tecnico,
                cliente: ordem.cliente,
                assunto: ordem.assunto,
                fechadaEm: efetivo.data,
                osRetorno: seguinte.id,
                assuntoRetorno: seguinte.assunto,
                abertaEm: seguinte.dataAbertura,
                dias: Math.round((seguinte.dataAbertura - efetivo.data) / 86400000),
                garantia
            });
        }

        return resultado;
    }
};
