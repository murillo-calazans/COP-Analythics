const TERCEIRAS = [
    { id: "AZUL", nome: "Azul", sufixos: ["AZUL"] },
    { id: "VELOZ", nome: "Veloz", sufixos: ["VELOZ"] },
    { id: "TECHNOMAIS", nome: "Technomais", sufixos: ["TECHNOMAIS", "TECNHOMAIS"] }
];

const CATEGORIAS_PRECO = [
    { id: "EXTERNA", nome: "Externa" },
    { id: "INTERNA", nome: "Interna" }
];

const SITUACAO_PAGAMENTO = {
    PAGA: "paga",
    IMPRODUTIVA: "improdutiva",
    SEM_PRECO: "sem_preco",
    NAO_PAGA: "nao_paga",
    DIAG_PENDENTE: "diag_pendente",
    CAT_PENDENTE: "cat_pendente"
};

const TerceirasEngine = {

    DIAS_RETORNO: 30,
    ASSUNTO_GARANTIA: "GARANTIA TERCEIRIZADA",

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

    nomeCategoria(id) {
        return CATEGORIAS_PRECO.find(c => c.id === id)?.nome ?? id;
    },

    entradaLpu(config, assunto) {
        const alvo = normalizarTexto(assunto ?? "");
        for (const [chave, entrada] of Object.entries(config.lpu ?? {})) {
            if (normalizarTexto(chave) === alvo) return entrada;
        }
        return undefined;
    },

    assuntoDividido(config, assunto) {
        return this.entradaLpu(config, assunto)?.dividido === true;
    },

    precoLpu(config, assunto, terceira, categoria = null) {
        const entrada = this.entradaLpu(config, assunto);
        if (!entrada) return undefined;
        const valor = entrada.dividido === true
            ? (categoria ? entrada.porCategoria?.[categoria]?.[terceira] : undefined)
            : entrada[terceira];
        return valor === null || valor === undefined || valor === "" ? undefined : Number(valor);
    },

    infoDiagnostico(config, diagnostico) {
        const alvo = normalizarTexto(diagnostico ?? "");
        for (const [chave, valor] of Object.entries(config.diagnosticos ?? {})) {
            if (normalizarTexto(chave) !== alvo) continue;
            if (typeof valor === "boolean") return { produtivo: valor, categoria: null };
            return {
                produtivo: valor?.produtivo === true ? true : valor?.produtivo === false ? false : undefined,
                categoria: valor?.categoria ?? null
            };
        }
        return { produtivo: undefined, categoria: null };
    },

    diagnosticoProdutivo(config, diagnostico) {
        return this.infoDiagnostico(config, diagnostico).produtivo;
    },

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
            const { produtivo, categoria } = this.infoDiagnostico(config, diagnostico);
            const dividido = this.assuntoDividido(config, ordem.assunto);
            const preco = this.precoLpu(config, ordem.assunto, terceira, categoria);

            let situacao;
            if (produtivo === undefined) situacao = SITUACAO_PAGAMENTO.DIAG_PENDENTE;
            else if (produtivo === false) situacao = SITUACAO_PAGAMENTO.IMPRODUTIVA;
            else if (dividido && !categoria) situacao = SITUACAO_PAGAMENTO.CAT_PENDENTE;
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
                categoria: dividido ? categoria : null,
                situacao,
                valor: situacao === SITUACAO_PAGAMENTO.PAGA ? preco : 0,
                precoLpu: preco ?? null
            });
        }

        return itens.sort((a, b) => a.data.localeCompare(b.data));
    },

    resumir(itens) {
        const contar = situacao => itens.filter(i => i.situacao === situacao).length;
        const porAssunto = new Map();

        for (const item of itens.filter(i => i.situacao === SITUACAO_PAGAMENTO.PAGA)) {

            const chave = `${item.assunto ?? "Sem assunto"}${item.categoria ? ` · ${this.nomeCategoria(item.categoria)}` : ""}`;
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

            diagPendente: contar(SITUACAO_PAGAMENTO.DIAG_PENDENTE) + contar(SITUACAO_PAGAMENTO.CAT_PENDENTE),
            total: itens.reduce((s, i) => s + (i.valor || 0), 0),
            porAssunto: [...porAssunto.values()].sort((a, b) => b.subtotal - a.subtotal)
        };
    },

    tecnicosDoMes(itens) {
        const porTecnico = new Map();
        for (const item of itens) {
            const nome = item.tecnico || "—";
            const atual = porTecnico.get(nome) ?? { tecnico: nome, os: 0, pagas: 0, valor: 0 };
            atual.os++;
            if (item.situacao === SITUACAO_PAGAMENTO.PAGA) { atual.pagas++; atual.valor += item.valor || 0; }
            porTecnico.set(nome, atual);
        }
        return [...porTecnico.values()].sort((a, b) => b.os - a.os || a.tecnico.localeCompare(b.tecnico));
    },

    manutencaoSemReparo(info, improdutivos) {
        if (!info?.ultimoFechamento) return false;
        if (!improdutivos?.size) return false;
        const diag = this.nomeDiagnostico(info.ultimoFechamento);
        return diag ? improdutivos.has(normalizarTexto(diag)) : false;
    },

    instalacoesComManutencaoSuspeita(analise, dias = 15) {
        const ehInstalacao = a => normalizarTexto(a).includes("INSTALA");
        const ehManutencao = a => normalizarTexto(a).includes("MANUTEN");
        const improdutivos = APP.configuracoes?.diagnosticosImprodutivos ?? new Set();
        const janelaMs = dias * 86400000;

        const porLogin = new Map();
        for (const ordem of APP.dados.ordens.values()) {
            if (!ordem.login) continue;
            const info = analise.get(ordem.id);
            const efetivo = info?.fechamentoEfetivo;
            const tecnico = efetivo ? IndicatorEngine.nomeResponsavelFechamento(efetivo) : null;
            const chave = normalizarTexto(ordem.login);
            if (!porLogin.has(chave)) porLogin.set(chave, []);
            porLogin.get(chave).push({ ordem, info, efetivo, tecnico, terceiraId: tecnico ? this.terceiraDoNome(tecnico) : null });
        }

        const alertas = [];
        for (const lista of porLogin.values()) {
            const instalacoes = lista.filter(o => o.efetivo?.data && o.terceiraId && ehInstalacao(o.ordem.assunto));
            if (!instalacoes.length) continue;

            for (const inst of instalacoes) {
                const fim = inst.efetivo.data.getTime();
                const manut = lista
                    .filter(o =>
                        o.ordem.id !== inst.ordem.id &&
                        ehManutencao(o.ordem.assunto) &&
                        !o.terceiraId &&
                        o.ordem.dataAbertura &&
                        o.ordem.dataAbertura.getTime() >= fim &&
                        o.ordem.dataAbertura.getTime() <= fim + janelaMs &&
                        this.manutencaoSemReparo(o.info, improdutivos))
                    .sort((a, b) => a.ordem.dataAbertura - b.ordem.dataAbertura)[0];
                if (!manut) continue;

                const diasEntre = Math.round((manut.ordem.dataAbertura.getTime() - fim) / 86400000);
                const diagManut = this.nomeDiagnostico(manut.info.ultimoFechamento);
                alertas.push({
                    login: inst.ordem.login,
                    cliente: inst.ordem.cliente,
                    instalacao: { os: inst.ordem.id, fechamento: inst.efetivo.data, terceiraId: inst.terceiraId, terceira: this.nomeTerceira(inst.terceiraId), tecnico: inst.tecnico },
                    manutencao: { os: manut.ordem.id, abertura: manut.ordem.dataAbertura, tecnico: manut.tecnico, dias: diasEntre, diagnostico: diagManut },
                    motivo: `Manutenção da nossa equipe aberta ${diasEntre} dia(s) após a instalação da ${this.nomeTerceira(inst.terceiraId)}, sem reparo real (diagnóstico improdutivo: "${diagManut || "—"}") — provável erro de abertura.`
                });
            }
        }
        return alertas.sort((a, b) => b.instalacao.fechamento - a.instalacao.fechamento);
    },

    pendencias(itens) {
        const assuntos = new Map();
        const diagnosticos = new Map();
        const semCategoria = new Map();
        for (const item of itens) {
            if (item.situacao === SITUACAO_PAGAMENTO.SEM_PRECO) {
                const assunto = `${item.assunto ?? "Sem assunto"}${item.categoria ? ` · ${this.nomeCategoria(item.categoria)}` : ""}`;
                const chave = `${assunto}|${item.terceira}`;
                assuntos.set(chave, (assuntos.get(chave) ?? 0) + 1);
            }
            if (item.situacao === SITUACAO_PAGAMENTO.DIAG_PENDENTE) {
                const chave = item.diagnostico ?? "Sem diagnóstico";
                diagnosticos.set(chave, (diagnosticos.get(chave) ?? 0) + 1);
            }
            if (item.situacao === SITUACAO_PAGAMENTO.CAT_PENDENTE) {
                const chave = item.diagnostico ?? "Sem diagnóstico";
                semCategoria.set(chave, (semCategoria.get(chave) ?? 0) + 1);
            }
        }
        return {
            assuntos: [...assuntos].map(([chave, quantidade]) => {
                const [assunto, terceira] = chave.split("|");
                return { assunto, terceira, quantidade };
            }).sort((a, b) => b.quantidade - a.quantidade),
            diagnosticos: [...diagnosticos].map(([diagnostico, quantidade]) => ({ diagnostico, quantidade }))
                .sort((a, b) => b.quantidade - a.quantidade),
            semCategoria: [...semCategoria].map(([diagnostico, quantidade]) => ({ diagnostico, quantidade }))
                .sort((a, b) => b.quantidade - a.quantidade)
        };
    },

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
            const d = diagnosticos.get(diagnostico) ?? { diagnostico, total: 0, assuntos: new Set() };
            d.total++;
            d.assuntos.add(normalizarTexto(assunto));
            diagnosticos.set(diagnostico, d);
        }

        return {
            assuntos: [...assuntos.values()].sort((a, b) => b.total - a.total),
            diagnosticos: [...diagnosticos.values()].sort((a, b) => b.total - a.total)
        };
    },

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
    },

    fechadasPeloCopComTerceiro(mes, analise) {
        const alertas = [];

        for (const ordem of APP.dados.ordens.values()) {
            const info = analise.get(ordem.id);
            const efetivo = info?.fechamentoEfetivo;
            if (!efetivo?.data || this.chaveMes(efetivo.data) !== mes) continue;

            if (efetivo.colaboradorResponsavel === null || efetivo.colaboradorResponsavel === undefined || efetivo.colaboradorResponsavel === "") continue;

            const tecnico = IndicatorEngine.nomeResponsavelFechamento(efetivo);
            const terceira = this.terceiraDoNome(tecnico);
            if (!terceira) continue;

            const operador = AuditEngine.resolverReferencia(APP.referencias.operadores, efetivo.operador, CONFIG_BASE.operadores.nome);
            if (this.terceiraDoNome(operador)) continue;

            alertas.push({
                os: ordem.id,
                data: efetivo.data,
                terceira,
                tecnico,
                operador: operador ?? "—",
                operadorSetor: AuditEngine.resolverReferencia(APP.referencias.operadores, efetivo.operador, CONFIG_BASE.operadores.setor) ?? "",
                cliente: ordem.cliente,
                cidade: ordem.cidade,
                assunto: ordem.assunto
            });
        }

        return alertas.sort((a, b) => b.data - a.data);
    }
};
