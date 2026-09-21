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
 * IndicatorEngine.analisarEventosDeTodas/fechamentoEfetivo em vez de
 * duplicar essa varredura. É o 1º Fechamento NA MAIORIA dos casos (uma
 * reabertura costuma ser só acerto de processo, nunca um novo
 * atendimento) — EXCETO quando a reabertura foi classificada como
 * "serviço não executado" (ver js/config/motivosreabertura.js), caso em
 * que é o ÚLTIMO Fechamento que representa o que realmente aconteceu na
 * OS (ver js/engine/filtroengine.js pro mesmo raciocínio aplicado no
 * resto do sistema).
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

        // Checado ANTES de tudo — inclusive da regra genérica de
        // "CONCLUÍDA" logo abaixo, que senão pegaria por engano um
        // diagnóstico como "EXPANSÃO CONCLUÍDA" (ver
        // DIAGNOSTICOS_SEM_PROXIMA_TAREFA_ESPERADA em
        // js/config/regrasauditoria.js).
        const semProximaTarefaEsperada = DIAGNOSTICOS_SEM_PROXIMA_TAREFA_ESPERADA.some(
            chave => normalizarTexto(chave) === diagnosticoNormalizado
        );
        if (semProximaTarefaEsperada) return null;

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

    // id da regra em REGRAS_AUDITORIA_DIAGNOSTICO usada por
    // auditarDuplicidadeLogin abaixo pra restringir a checagem de
    // duplicidade só a diagnósticos de troca/recolhimento de
    // equipamento — ver comentário lá.
    REGRA_ID_DUPLICIDADE_EQUIPAMENTO: "equipamento-troca-ou-recolhimento",

    /**
     * Mesmo login + mesmo assunto + mesmo diagnóstico de troca/
     * recolhimento de equipamento (ver REGRA_ID_DUPLICIDADE_EQUIPAMENTO)
     * repetido em 2+ OS — sinaliza como possível duplicidade (ex.: dois
     * "Equipamento Recolhido" pro mesmo cliente no mesmo assunto, sinal
     * de que o equipamento pode ter sido recolhido/trocado mais de uma
     * vez sem necessidade). Só faz sentido pra essa família de
     * diagnóstico — repetir OUTROS diagnósticos (ex.: "Troca de
     * Conector", "Verificação sem problema encontrado") pro mesmo
     * cliente é normal, não indica nada suspeito, então não deve virar
     * achado aqui.
     *
     * Dimensão SEPARADA da checagem Diagnóstico x Próxima Tarefa acima —
     * uma OS pode estar "ok" ali e ainda assim entrar aqui. Exige
     * assunto preenchido nos dois lados (sem isso o agrupamento
     * juntaria OS sem relação nenhuma sob uma chave vazia).
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

            const regra = this.regraParaDiagnostico(diagnosticoNome);
            if (regra?.id !== this.REGRA_ID_DUPLICIDADE_EQUIPAMENTO) continue;

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
     * OS que foi reaberta e fechada de novo por um Colaborador
     * Responsável DIFERENTE do que fez o 1º Fechamento — sinal de que a
     * reabertura não foi só o mesmo técnico corrigindo o próprio
     * processo, alguém mais teve que assumir (equipe errada, técnico
     * que sumiu, etc.). Dimensão SEPARADA das outras — uma OS pode estar
     * "ok" no Diagnóstico x Próxima Tarefa e ainda cair aqui.
     *
     * Só entra quem realmente tem DOIS fechamentos com data diferente
     * (1º e último) — uma OS sem reabertura de verdade, ou reaberta mas
     * ainda não refechada, não se qualifica. Carrega junto
     * motivoReabertura (ver js/config/motivosreabertura.js) pra quem
     * consome o achado (js/ui/auditoriaoperacional.js) separar "erro de
     * processo" (correção administrativa, operador de fechamento
     * continua correto) de "serviço não executado" (o 1º técnico não foi
     * a campo de verdade — operador de fechamento incorreto).
     *
     * TRÊS pessoas podem estar envolvidas, não duas — o achado carrega
     * os três nomes separados pra não sugerir que é sempre a mesma
     * gente: colaboradorPrimeiro (quem fechou a 1ª vez), operadorReabertura
     * (quem EXECUTOU a reabertura em si — via de regra um despachante/
     * operador interno organizando o processo, não necessariamente um
     * técnico de campo) e colaboradorUltimo (quem fica com o crédito do
     * fechamento seguinte — pode ser o mesmo operadorReabertura, outro
     * técnico, ou até o mesmo colaboradorPrimeiro).
     */
    auditarReaberturaComTrocaDeColaborador(ordens, analise) {
        const achados = [];

        for (const ordem of ordens.values()) {
            const info = analise.get(ordem.id);
            if (!info?.temReabertura) continue;
            if (!info.primeiroFechamento?.data || !info.ultimoFechamento?.data) continue;
            if (info.primeiroFechamento.data.getTime() === info.ultimoFechamento.data.getTime()) continue;

            const nomePrimeiro = IndicatorEngine.nomeResponsavelFechamento(info.primeiroFechamento);
            const nomeUltimo = IndicatorEngine.nomeResponsavelFechamento(info.ultimoFechamento);
            if (!nomePrimeiro || !nomeUltimo) continue;
            if (normalizarTexto(nomePrimeiro) === normalizarTexto(nomeUltimo)) continue;

            // Diagnóstico/Próxima Tarefa exibidos são do fechamento
            // EFETIVO (ver analisarEventosOS) — quando o motivo é
            // "serviço não executado", esse já é o último fechamento, o
            // que realmente aconteceu de campo.
            const diagnosticoNome = AuditEngine.resolverReferencia(
                APP.referencias.diagnosticos, info.fechamentoEfetivo?.diagnostico, CONFIG_BASE.diagnosticos.nome
            );

            // Quem EXECUTOU a reabertura (Operador da movimentação de
            // Reabertura — normalmente um despachante/operador interno
            // organizando o processo) é gente DIFERENTE de quem fica com
            // o crédito do fechamento seguinte (nomeUltimo, o Colaborador
            // Responsável de quem realmente fechou depois) — por isso são
            // 3 campos separados, não 2 (ver js/ui/auditoriaoperacional.js).
            const nomeOperadorReabertura = AuditEngine.resolverReferencia(
                APP.referencias.operadores, info.operadorReabertura, CONFIG_BASE.operadores.nome
            );

            achados.push({
                ordemId: ordem.id,
                login: ordem.login,
                cliente: ordem.cliente,
                assunto: ordem.assunto,
                tipo: "reabertura-outro-colaborador",
                regraId: "reabertura-outro-colaborador",
                severidade: "aviso",
                diagnostico: diagnosticoNome,
                proximaTarefa: info.fechamentoEfetivo?.proximaTarefa ? String(info.fechamentoEfetivo.proximaTarefa).trim() : null,
                proximaTarefaEsperada: null,
                colaboradorPrimeiro: nomePrimeiro,
                colaboradorUltimo: nomeUltimo,
                operadorReabertura: nomeOperadorReabertura,
                motivoReabertura: info.motivoReabertura,
                mensagemReabertura: info.mensagemReabertura,
                dataFinalizacao: info.primeiroFechamento.data,
                dataUltimoFechamento: info.ultimoFechamento.data,
                motivo: `Fechada por "${nomePrimeiro}"; reaberta por "${nomeOperadorReabertura ?? "-"}"; fechamento seguinte creditado a "${nomeUltimo}".`
            });
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
            duplicidades: 0,
            // OS reaberta e fechada por um Colaborador Responsável
            // diferente do 1º Fechamento — ver
            // auditarReaberturaComTrocaDeColaborador.
            reaberturasOutroColaborador: 0,
            // Achados (de qualquer tipo) marcados manualmente como já
            // corrigidos (ver js/services/auditoriacorrecoes.js) — contam
            // à parte, não entram em comErro/duplicidades/reaberturasOutroColaborador.
            corrigidos: 0
        };

        const achados = [];
        const porTipoErro = new Map();
        const semRegraDiagnosticos = new Map();

        for (const ordem of ordens.values()) {
            const info = analise.get(ordem.id);
            // Fechamento EFETIVO (1º Fechamento por padrão, último quando
            // a reabertura foi por serviço não executado — ver
            // js/engine/filtroengine.js e IndicatorEngine.analisarEventosOS),
            // pra auditar o Diagnóstico x Próxima Tarefa de quem realmente
            // atendeu a OS.
            const fechamento = info?.fechamentoEfetivo;

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

            // Achado encontrado no fechamento EFETIVO — mas ele pode não
            // ser o fechamento mais recente da OS (ex.: reabertura por
            // "erro de processo" mantém o crédito no 1º Fechamento, ver
            // fechamentoEfetivo). Se o ÚLTIMO fechamento (o que está
            // valendo hoje no sistema de origem) já resolve o MESMO
            // Diagnóstico x Próxima Tarefa, o problema já foi corrigido
            // por lá — reimportar não deveria trazer isso de volta pra
            // "Com erro" só porque ninguém marcou manualmente ainda (ver
            // pedido do usuário: mesclar detecção automática + marcação
            // manual). Só verifica quando o último é de fato outro
            // fechamento — senão é exatamente o mesmo já auditado acima.
            const corrigidoAutomaticamente = !!(
                info.ultimoFechamento &&
                info.ultimoFechamento !== fechamento &&
                this.auditarFechamento(info.ultimoFechamento).status === "ok"
            );

            const correcaoManual = this.buscarCorrecaoAchado(ordem.id, resultado.achado.tipo);
            const corrigido = !!correcaoManual || corrigidoAutomaticamente;

            if (corrigido) {
                resumo.corrigidos++;
            } else {
                resumo.comErro++;
                porTipoErro.set(resultado.achado.tipo, (porTipoErro.get(resultado.achado.tipo) ?? 0) + 1);
            }

            // Subcategoria SÓ pra "inconsistencia" (Diagnóstico x Próxima
            // Tarefa incompatível) — ver subcategoriaErroInconsistencia.
            // "diagnostico-ausente"/"proxima-tarefa-ausente" já são
            // subcategorias em si mesmas, não precisam de mais divisão.
            const subcategoria = resultado.achado.tipo === "inconsistencia"
                ? this.subcategoriaErroInconsistencia(info)
                : null;

            // Quem reabriu (só faz sentido se a OS realmente foi
            // reaberta) e as datas de referência — pra quem consome o
            // achado (js/ui/auditoriaoperacional.js) mostrar "reaberta
            // por", "finalizada em" (o fechamento que foi auditado aqui)
            // e "corrigida em" (o fechamento mais recente, quando a
            // correção foi automática).
            const operadorReabertura = info.temReabertura
                ? AuditEngine.resolverReferencia(APP.referencias.operadores, info.operadorReabertura, CONFIG_BASE.operadores.nome)
                : null;

            achados.push({
                ordemId: ordem.id,
                login: ordem.login,
                cliente: ordem.cliente,
                assunto: ordem.assunto,
                ...resultado.achado,
                subcategoria,
                operadorReabertura,
                dataFinalizacao: fechamento.data ?? null,
                dataUltimoFechamento: info.ultimoFechamento?.data ?? null,
                corrigido,
                corrigidoAutomaticamente,
                corrigidoPor: correcaoManual?.corrigidoPor ?? null,
                corrigidoEm: correcaoManual?.corrigidoEm ?? null
            });
        }

        const achadosDuplicidade = this.auditarDuplicidadeLogin(ordens, analise);
        for (const achado of achadosDuplicidade) {
            const correcao = this.buscarCorrecaoAchado(achado.ordemId, achado.tipo);
            if (correcao) {
                resumo.corrigidos++;
            } else {
                resumo.duplicidades++;
                porTipoErro.set(achado.tipo, (porTipoErro.get(achado.tipo) ?? 0) + 1);
            }
            achados.push({ ...achado, corrigido: !!correcao, corrigidoPor: correcao?.corrigidoPor ?? null, corrigidoEm: correcao?.corrigidoEm ?? null });
        }

        const achadosReabertura = this.auditarReaberturaComTrocaDeColaborador(ordens, analise);
        for (const achado of achadosReabertura) {
            const correcao = this.buscarCorrecaoAchado(achado.ordemId, achado.tipo);
            if (correcao) {
                resumo.corrigidos++;
            } else {
                resumo.reaberturasOutroColaborador++;
                porTipoErro.set(achado.tipo, (porTipoErro.get(achado.tipo) ?? 0) + 1);
            }
            achados.push({ ...achado, corrigido: !!correcao, corrigidoPor: correcao?.corrigidoPor ?? null, corrigidoEm: correcao?.corrigidoEm ?? null });
        }

        return {
            resumo,
            achados,
            porTipoErro: IndicatorEngine.paraListaOrdenada(porTipoErro),
            semRegraDiagnosticos: IndicatorEngine.paraListaOrdenada(semRegraDiagnosticos)
        };
    },

    /** Correção manual (se houver) pra um achado — ver js/services/auditoriacorrecoes.js. */
    buscarCorrecaoAchado(ordemId, tipoAchado) {
        return APP.correcoesAuditoria?.get(chaveCorrecaoAuditoria(ordemId, tipoAchado)) ?? null;
    },

    /**
     * Pra um achado "inconsistencia" (Diagnóstico x Próxima Tarefa
     * incompatível), decide qual dos dois campos era o errado de
     * verdade.
     *
     * O PADRÃO é "erro_proxima_tarefa" — não "erro_diagnostico" (era
     * assim antes, e OS 1895501 mostrou o problema: diagnóstico
     * "TROCA DE EQUIPAMENTO" batia certinho com a mensagem do técnico
     * "Fizemos a troca dos equipamentos e recolhemos os antigos", só a
     * Próxima Tarefa ("A.O.M") que não tinha nada a ver — e mesmo assim
     * caía em "erro_diagnostico" por não ter reabertura nenhuma pra
     * confirmar). Isso é estrutural: auditarFechamento só chega a
     * "inconsistencia" quando o Diagnóstico JÁ bateu com alguma regra
     * conhecida (regraParaDiagnostico achou algo) — quem falhou ali foi
     * sempre a Próxima Tarefa. Diagnóstico errado de verdade (o técnico
     * escolheu a categoria errada) o motor não tem como detectar sozinho,
     * porque ele audita CONSISTÊNCIA entre os dois campos, não se o
     * Diagnóstico escolhido reflete o que aconteceu de fato.
     *
     * A ÚNICA forma de saber que foi o Diagnóstico é uma confirmação
     * explícita: a OS foi reaberta e a mensagem da Reabertura menciona
     * "diagnóstico" (ex.: "reaberta para corrigir o diagnóstico") ->
     * "erro_diagnostico". Não reaproveita classificarMotivoReabertura
     * inteiro de propósito: aquela função decide "servico_nao_executado"
     * vs "erro_processo" (qual fechamento credita quem); aqui a pergunta
     * é outra (qual CAMPO do fechamento estava errado).
     */
    subcategoriaErroInconsistencia(info) {
        const mensagem = normalizarTexto(info?.mensagemReabertura ?? "");
        return mensagem.includes("DIAGNOSTICO") ? "erro_diagnostico" : "erro_proxima_tarefa";
    }

};
