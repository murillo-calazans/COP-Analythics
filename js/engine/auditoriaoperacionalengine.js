/**
 * ==========================================================
 * Auditoria Operacional Engine
 * ==========================================================
 * Motor de REGRAS determinísticas (nada de IA aqui — isso é o
 * Auditor IA, ver js/services/auditoriaia.js) que verifica, pra cada
 * OS finalizada, se o Diagnóstico do fechamento é coerente com a
 * Próxima Tarefa informada — ver REGRAS_AUDITORIA_DIAGNOSTICO em
 * js/config/regrasauditoria.js. Roda em lote sobre um conjunto de
 * ordens (normalmente FiltroEngine.ordensFiltradas(), igual ao resto
 * do sistema), sem persistir nada — recalculado a cada carregamento.
 *
 * Diagnóstico e Próxima Tarefa só valem na movimentação de FECHAMENTO
 * (evento "Fechamento" — conferido nos dados reais: toda linha com
 * esse evento tem status "Finalizada", e vice-versa, então as duas
 * condições citadas no pedido original são a mesma coisa) — reaproveita
 * IndicatorEngine.analisarEventosDeTodas/ultimoFechamento em vez de
 * duplicar essa varredura.
 *
 * Diagnóstico pode vir como ID (dado antigo, já importado antes da
 * planilha passar a trazer o nome direto) ou como texto (dado novo)
 * — AuditEngine.resolverReferencia já lida com os dois formatos
 * (tenta achar por ID na Base; não achando, devolve o texto cru), sem
 * precisar de nenhuma lógica extra aqui.
 */
const AuditoriaOperacionalEngine = {

    // Normalizado (sem acento/maiúscula) — comparado com normalizarTexto(diagnostico).endsWith(...).
    SUFIXO_DIAGNOSTICO_CONCLUIDO: "CONCLUIDA",

    /**
     * Alguns diagnósticos vêm com o ID do diagnóstico colado no fim,
     * tipo "INSTALAÇÃO CONCLUÍDA (340)" ou "TRANSFERÊNCIA CONCLUÍDA
     * (130)" — mesma convenção já usada em
     * IndicatorEngine.ASSUNTO_CANCELAMENTO ("CANCELAMENTO (350)").
     * Próxima Tarefa nunca traz esse sufixo. Ignora esse "(NNN)" final
     * SÓ pra casar a regra — o texto original (com o número) continua
     * sendo o que aparece pro usuário no achado (ver auditarFechamento).
     */
    removerSufixoIdDiagnostico(texto) {
        return String(texto).replace(/\s*\(\d+\)\s*$/, "").trim();
    },

    /**
     * Acha a regra (específica, da tabela em REGRAS_AUDITORIA_DIAGNOSTICO,
     * ou a genérica de "CONCLUÍDA") que se aplica a um diagnóstico —
     * ou null se não houver nenhuma regra mapeada pra ele ainda (nesse
     * caso a OS fica em "sem regra mapeada", não conta como certo nem
     * como erro).
     *
     * Cada regra casa o diagnóstico de um dos dois jeitos (ver
     * js/config/regrasauditoria.js): "diagnostico" exige texto EXATO
     * (normalizado); "diagnosticoContemAlgum" basta o diagnóstico CONTER
     * uma das palavras/trechos da lista — usado quando a grafia real
     * varia demais pra travar num texto único.
     */
    regraParaDiagnostico(diagnosticoNome) {
        if (!diagnosticoNome) return null;

        const diagnosticoBase = this.removerSufixoIdDiagnostico(diagnosticoNome);
        const diagnosticoNormalizado = normalizarTexto(diagnosticoBase);

        const especifica = REGRAS_AUDITORIA_DIAGNOSTICO.find(regra => {
            if (regra.diagnosticoContemAlgum) {
                return regra.diagnosticoContemAlgum.some(
                    chave => diagnosticoNormalizado.includes(normalizarTexto(chave))
                );
            }
            return normalizarTexto(regra.diagnostico) === diagnosticoNormalizado;
        });

        if (especifica) {
            return {
                id: especifica.id,
                proximaTarefaEsperada: especifica.proximaTarefaEsperada ?? null,
                proximaTarefaContemAlgum: especifica.proximaTarefaContemAlgum ?? null,
                severidade: especifica.severidade ?? "erro",
                mensagem: especifica.mensagem
            };
        }

        if (diagnosticoNormalizado.endsWith(this.SUFIXO_DIAGNOSTICO_CONCLUIDO)) {
            return {
                id: "concluida-generico",
                proximaTarefaEsperada: [diagnosticoBase],
                proximaTarefaContemAlgum: null,
                severidade: "erro",
                mensagem: `O diagnóstico indica conclusão ("${diagnosticoBase}") — a Próxima Tarefa deveria seguir o mesmo processo.`
            };
        }

        return null;
    },

    /**
     * Confere se a Próxima Tarefa informada satisfaz a regra: texto
     * EXATO (proximaTarefaEsperada) ou apenas CONTER uma das
     * palavras/trechos aceitos (proximaTarefaContemAlgum) — ver
     * regraParaDiagnostico.
     */
    proximaTarefaAtendeRegra(regra, proximaTarefaNormalizada) {
        if (regra.proximaTarefaContemAlgum) {
            return regra.proximaTarefaContemAlgum.some(
                chave => proximaTarefaNormalizada.includes(normalizarTexto(chave))
            );
        }
        return regra.proximaTarefaEsperada.some(
            esperado => normalizarTexto(esperado) === proximaTarefaNormalizada
        );
    },

    /** Lista pra exibir no achado (coluna "Esperado") — funciona pros dois modos de regra. */
    textoProximaTarefaEsperada(regra) {
        return regra.proximaTarefaContemAlgum ?? regra.proximaTarefaEsperada;
    },

    /**
     * Audita o fechamento de UMA OS. Devolve um dos status:
     * - "sem-fechamento": OS ainda não fechou, fora do escopo.
     * - "diagnostico-ausente": fechou sem nenhum diagnóstico — conta como erro.
     * - "sem-regra": tem diagnóstico, mas nenhuma regra mapeada ainda — neutro.
     * - "ok": Próxima Tarefa bate com o esperado pra esse diagnóstico.
     * - "erro": Próxima Tarefa ausente ou incompatível — vem junto um "achado".
     */
    auditarFechamento(movFechamento) {
        const diagnosticoNome = AuditEngine.resolverReferencia(
            APP.referencias.diagnosticos, movFechamento.diagnostico, CONFIG_BASE.diagnosticos.nome
        );

        if (!diagnosticoNome) {
            return {
                status: "erro",
                diagnostico: null,
                achado: {
                    tipo: "diagnostico-ausente",
                    regraId: null,
                    severidade: "erro",
                    diagnostico: null,
                    proximaTarefa: (movFechamento.proximaTarefa ?? "").toString().trim() || null,
                    proximaTarefaEsperada: null,
                    motivo: "OS finalizada sem nenhum diagnóstico registrado no fechamento."
                }
            };
        }

        const regra = this.regraParaDiagnostico(diagnosticoNome);
        if (!regra) {
            return { status: "sem-regra", diagnostico: diagnosticoNome };
        }

        const proximaTarefaBruta = (movFechamento.proximaTarefa ?? "").toString().trim();

        if (!proximaTarefaBruta) {
            return {
                status: "erro",
                diagnostico: diagnosticoNome,
                achado: {
                    tipo: "proxima-tarefa-ausente",
                    regraId: regra.id,
                    severidade: regra.severidade,
                    diagnostico: diagnosticoNome,
                    proximaTarefa: null,
                    proximaTarefaEsperada: this.textoProximaTarefaEsperada(regra),
                    motivo: `Diagnóstico "${diagnosticoNome}" exige uma Próxima Tarefa, mas ela não foi informada no fechamento.`
                }
            };
        }

        const proximaTarefaNormalizada = normalizarTexto(proximaTarefaBruta);
        const bateComEsperado = this.proximaTarefaAtendeRegra(regra, proximaTarefaNormalizada);

        if (!bateComEsperado) {
            return {
                status: "erro",
                diagnostico: diagnosticoNome,
                achado: {
                    tipo: "inconsistencia",
                    regraId: regra.id,
                    severidade: regra.severidade,
                    diagnostico: diagnosticoNome,
                    proximaTarefa: proximaTarefaBruta,
                    proximaTarefaEsperada: this.textoProximaTarefaEsperada(regra),
                    motivo: regra.mensagem
                        ?? `Próxima Tarefa "${proximaTarefaBruta}" não é compatível com o diagnóstico "${diagnosticoNome}".`
                }
            };
        }

        return { status: "ok", diagnostico: diagnosticoNome, proximaTarefa: proximaTarefaBruta };
    },

    /**
     * Mesmo login + mesmo assunto + mesmo diagnóstico do fechamento
     * repetido em 2+ OS — sinaliza como possível duplicidade (ex.:
     * "Instalação Concluída" duas vezes pro mesmo cliente no mesmo
     * assunto). Dimensão SEPARADA da checagem Diagnóstico x Próxima
     * Tarefa acima — uma OS pode estar "ok" ali e ainda assim entrar
     * aqui. Exige assunto preenchido nos dois lados (sem isso o
     * agrupamento juntaria OS sem relação nenhuma sob uma chave vazia).
     */
    auditarDuplicidadeLogin(ordens, analise) {
        const porGrupo = new Map();

        for (const ordem of ordens.values()) {
            if (!ordem.login || !ordem.assunto) continue;

            const fechamento = analise.get(ordem.id)?.ultimoFechamento;
            if (!fechamento) continue;

            const diagnosticoNome = AuditEngine.resolverReferencia(
                APP.referencias.diagnosticos, fechamento.diagnostico, CONFIG_BASE.diagnosticos.nome
            );
            if (!diagnosticoNome) continue;

            const chave = [ordem.login, normalizarTexto(ordem.assunto), normalizarTexto(diagnosticoNome)].join("||");
            if (!porGrupo.has(chave)) porGrupo.set(chave, []);
            porGrupo.get(chave).push({ ordem, diagnosticoNome });
        }

        const achados = [];

        for (const grupo of porGrupo.values()) {
            if (grupo.length < 2) continue;

            const idsGrupo = grupo.map(item => item.ordem.id);

            for (const { ordem, diagnosticoNome } of grupo) {
                const outrasOrdens = idsGrupo.filter(id => id !== ordem.id);

                achados.push({
                    ordemId: ordem.id,
                    login: ordem.login,
                    cliente: ordem.cliente,
                    assunto: ordem.assunto,
                    tipo: "duplicidade",
                    regraId: "login-duplicado",
                    severidade: "aviso",
                    diagnostico: diagnosticoNome,
                    proximaTarefa: null,
                    proximaTarefaEsperada: null,
                    outrasOrdens,
                    motivo: `Mesmo login e assunto com diagnóstico "${diagnosticoNome}" repetido em outra(s) OS: ${outrasOrdens.join(", ")}.`
                });
            }
        }

        return achados;
    },

    /**
     * Ponto de entrada: audita um conjunto de OS (normalmente
     * FiltroEngine.ordensFiltradas()) e devolve o resumo agregado +
     * a lista de achados, pra Auditoria desenhar os indicadores e a
     * tabela de inconsistências.
     */
    auditar(ordens) {
        const analise = IndicatorEngine.analisarEventosDeTodas(ordens);

        const resumo = {
            totalOS: ordens.size,
            semFechamento: 0,
            totalAuditadas: 0, // semErro + comErro (Diagnóstico x Próxima Tarefa) — não inclui "sem regra mapeada"
            semErro: 0,
            comErro: 0,
            semRegraMapeada: 0,
            duplicidades: 0
        };

        const achados = [];
        const porTipoErro = new Map();
        const semRegraDiagnosticos = new Map();

        for (const ordem of ordens.values()) {
            const fechamento = analise.get(ordem.id)?.ultimoFechamento;

            if (!fechamento) {
                resumo.semFechamento++;
                continue;
            }

            const resultado = this.auditarFechamento(fechamento);

            if (resultado.status === "sem-regra") {
                resumo.semRegraMapeada++;
                semRegraDiagnosticos.set(resultado.diagnostico, (semRegraDiagnosticos.get(resultado.diagnostico) ?? 0) + 1);
                continue;
            }

            resumo.totalAuditadas++;

            if (resultado.status === "ok") {
                resumo.semErro++;
                continue;
            }

            resumo.comErro++;
            porTipoErro.set(resultado.achado.tipo, (porTipoErro.get(resultado.achado.tipo) ?? 0) + 1);

            achados.push({
                ordemId: ordem.id,
                login: ordem.login,
                cliente: ordem.cliente,
                assunto: ordem.assunto,
                ...resultado.achado
            });
        }

        const achadosDuplicidade = this.auditarDuplicidadeLogin(ordens, analise);
        for (const achado of achadosDuplicidade) {
            resumo.duplicidades++;
            porTipoErro.set(achado.tipo, (porTipoErro.get(achado.tipo) ?? 0) + 1);
            achados.push(achado);
        }

        return {
            resumo,
            achados,
            porTipoErro: IndicatorEngine.paraListaOrdenada(porTipoErro),
            semRegraDiagnosticos: IndicatorEngine.paraListaOrdenada(semRegraDiagnosticos)
        };
    }

};
