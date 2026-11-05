const AuditoriaOperacionalEngine = {

    SUFIXO_DIAGNOSTICO_CONCLUIDO: "CONCLUIDA",

    removerSufixoIdDiagnostico(texto) {
        return String(texto).replace(/\s*\(\d+\)\s*$/, "").trim();
    },

    diagnosticoExcluidoDaProximaTarefa(diagnosticoNome) {
        const diagnosticoNormalizado = normalizarTexto(this.removerSufixoIdDiagnostico(diagnosticoNome));
        return DIAGNOSTICOS_SEM_PROXIMA_TAREFA_ESPERADA.some(
            chave => normalizarTexto(chave) === diagnosticoNormalizado
        );
    },

    regraParaDiagnostico(diagnosticoNome) {
        if (!diagnosticoNome) return null;

        const diagnosticoBase = this.removerSufixoIdDiagnostico(diagnosticoNome);
        const diagnosticoNormalizado = normalizarTexto(diagnosticoBase);

        if (this.diagnosticoExcluidoDaProximaTarefa(diagnosticoNome)) return null;

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

    assuntoEhOrdemDeEstrutura(assunto) {
        if (!assunto) return false;
        const assuntoNormalizado = normalizarTexto(assunto);
        return ASSUNTOS_ORDEM_ESTRUTURA.some(chave => assuntoNormalizado.includes(normalizarTexto(chave)));
    },

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

    textoProximaTarefaEsperada(regra) {
        return regra.proximaTarefaContemAlgum ?? regra.proximaTarefaEsperada;
    },

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

            return {
                status: "sem-regra",
                diagnostico: diagnosticoNome,
                foraDoEscopo: this.diagnosticoExcluidoDaProximaTarefa(diagnosticoNome)
            };
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

    REGRA_ID_DUPLICIDADE_EQUIPAMENTO: "equipamento-troca-ou-recolhimento",

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

            const diagnosticoNome = AuditEngine.resolverReferencia(
                APP.referencias.diagnosticos, info.fechamentoEfetivo?.diagnostico, CONFIG_BASE.diagnosticos.nome
            );

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

    ROTULOS_MOTIVO_REABERTURA_ENGINE: {
        erro_processo: "Erro de processo",
        servico_nao_executado: "Serviço não executado (refazer)",
        tecnico_errado: "Técnico errado no fechamento",
        indefinido: "não identificado"
    },

    auditarReaberturaComDataDiferente(ordens, analise) {
        const achados = [];

        for (const ordem of ordens.values()) {
            const info = analise.get(ordem.id);
            if (!info?.temReabertura) continue;
            if (!info.primeiroFechamento?.data || !info.ultimoFechamento?.data) continue;
            if (info.primeiroFechamento.data.getTime() === info.ultimoFechamento.data.getTime()) continue;

            const diagnosticoNome = AuditEngine.resolverReferencia(
                APP.referencias.diagnosticos, info.fechamentoEfetivo?.diagnostico, CONFIG_BASE.diagnosticos.nome
            );

            const nomeOperadorReabertura = AuditEngine.resolverReferencia(
                APP.referencias.operadores, info.operadorReabertura, CONFIG_BASE.operadores.nome
            );

            const dataPrimeiro = info.primeiroFechamento.data;
            const dataUltimo = info.ultimoFechamento.data;
            const dias = Math.round((dataUltimo.getTime() - dataPrimeiro.getTime()) / 86400000);
            const rotuloMotivo = this.ROTULOS_MOTIVO_REABERTURA_ENGINE[info.motivoReabertura] ?? "não identificado";

            achados.push({
                ordemId: ordem.id,
                login: ordem.login,
                cliente: ordem.cliente,
                assunto: ordem.assunto,
                tipo: "reabertura-data-diferente",
                regraId: "reabertura-data-diferente",
                severidade: "aviso",
                diagnostico: diagnosticoNome,
                proximaTarefa: null,
                proximaTarefaEsperada: null,
                colaboradorPrimeiro: IndicatorEngine.nomeResponsavelFechamento(info.primeiroFechamento),
                colaboradorUltimo: IndicatorEngine.nomeResponsavelFechamento(info.ultimoFechamento),
                operadorReabertura: nomeOperadorReabertura,
                motivoReabertura: info.motivoReabertura,
                mensagemReabertura: info.mensagemReabertura,
                dataFinalizacao: dataPrimeiro,
                dataUltimoFechamento: dataUltimo,
                diferencaDias: dias,
                motivo: `1º fechamento em ${dataPrimeiro.toLocaleDateString("pt-BR")}; último em ${dataUltimo.toLocaleDateString("pt-BR")} (diferença de ${dias} dia(s)). Motivo da reabertura: ${rotuloMotivo}.`
            });
        }

        return achados;
    },

    loginsEmVariasOrdens(ordens, analise) {
        const porLogin = new Map();

        for (const ordem of ordens.values()) {
            if (!ordem.login) continue;
            const chave = normalizarTexto(ordem.login);

            const info = analise.get(ordem.id);
            const efetivo = info?.fechamentoEfetivo;
            const tecnico = efetivo
                ? IndicatorEngine.nomeResponsavelFechamento(efetivo)
                : AuditEngine.resolverReferencia(APP.referencias.operadores, ordem.tecnicoResponsavel, CONFIG_BASE.operadores.nome);
            const terceiraId = tecnico ? TerceirasEngine.terceiraDoNome(tecnico) : null;

            const grupo = porLogin.get(chave) ?? { login: ordem.login, cliente: ordem.cliente, ordens: [] };
            grupo.ordens.push({
                id: ordem.id,
                assunto: ordem.assunto ?? null,
                abertura: ordem.dataAbertura ?? null,
                fechamento: efetivo?.data ?? null,
                tecnico: tecnico || null,
                terceiraId,
                empresa: terceiraId ? TerceirasEngine.nomeTerceira(terceiraId) : "Nossa equipe"
            });
            porLogin.set(chave, grupo);
        }

        return [...porLogin.values()]
            .filter(g => g.ordens.length >= 2)
            .map(g => ({ ...g, ordens: g.ordens.sort((a, b) => (a.abertura?.getTime() ?? 0) - (b.abertura?.getTime() ?? 0)) }))
            .sort((a, b) => b.ordens.length - a.ordens.length || String(a.login).localeCompare(String(b.login)));
    },

    auditar(ordens) {
        const analise = IndicatorEngine.analisarEventosDeTodas(ordens);

        const resumo = {
            totalOS: ordens.size,
            semFechamento: 0,
            totalAuditadas: 0,
            semErro: 0,
            comErro: 0,
            semRegraMapeada: 0,
            duplicidades: 0,

            reaberturasOutroColaborador: 0,
            reaberturasDataDiferente: 0,

            corrigidos: 0
        };

        const achados = [];
        const porTipoErro = new Map();
        const semRegraDiagnosticos = new Map();

        for (const ordem of ordens.values()) {
            const info = analise.get(ordem.id);

            const fechamento = info?.fechamentoEfetivo;

            if (!fechamento) {
                resumo.semFechamento++;
                continue;
            }

            if (this.assuntoEhOrdemDeEstrutura(ordem.assunto)) {
                resumo.semRegraMapeada++;
                continue;
            }

            const resultado = this.auditarFechamento(fechamento);

            if (resultado.status === "sem-regra") {
                resumo.semRegraMapeada++;

                if (!resultado.foraDoEscopo) {
                    semRegraDiagnosticos.set(resultado.diagnostico, (semRegraDiagnosticos.get(resultado.diagnostico) ?? 0) + 1);
                }
                continue;
            }

            resumo.totalAuditadas++;

            if (resultado.status === "ok") {
                resumo.semErro++;
                continue;
            }

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

            const subcategoria = resultado.achado.tipo === "inconsistencia"
                ? this.subcategoriaErroInconsistencia(info)
                : null;

            const operadorReabertura = info.temReabertura
                ? AuditEngine.resolverReferencia(APP.referencias.operadores, info.operadorReabertura, CONFIG_BASE.operadores.nome)
                : null;

            const operadorCorrecaoCodigo = corrigidoAutomaticamente ? (info.ultimoFechamento.operador ?? null) : null;

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
                operadorCorrecaoCodigo,
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

        const achadosReaberturaData = this.auditarReaberturaComDataDiferente(ordens, analise);
        for (const achado of achadosReaberturaData) {
            const correcao = this.buscarCorrecaoAchado(achado.ordemId, achado.tipo);
            if (correcao) {
                resumo.corrigidos++;
            } else {
                resumo.reaberturasDataDiferente++;
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

    buscarCorrecaoAchado(ordemId, tipoAchado) {
        return APP.correcoesAuditoria?.get(chaveCorrecaoAuditoria(ordemId, tipoAchado)) ?? null;
    },

    subcategoriaErroInconsistencia(info) {
        const mensagem = normalizarTexto(info?.mensagemReabertura ?? "");
        return mensagem.includes("DIAGNOSTICO") ? "erro_diagnostico" : "erro_proxima_tarefa";
    },

    contarOrdensAcertadasCopDetalhado(ordens) {
        const relatorio = this.auditar(ordens);
        const porColaborador = new Map();

        for (const achado of relatorio.achados) {
            if (!achado.corrigidoAutomaticamente) continue;
            if (!IndicatorEngine.operadorEhDoCop(achado.operadorCorrecaoCodigo)) continue;

            const nome = AuditEngine.resolverReferencia(
                APP.referencias.operadores, achado.operadorCorrecaoCodigo, CONFIG_BASE.operadores.nome
            );

            if (!porColaborador.has(nome)) porColaborador.set(nome, []);
            porColaborador.get(nome).push({
                ordemId: achado.ordemId,
                assunto: achado.assunto,
                tipo: achado.tipo
            });
        }

        return porColaborador;
    }

};
