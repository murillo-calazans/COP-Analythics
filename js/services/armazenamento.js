const TAMANHO_PAGINA_LEITURA = 5000;
const TAMANHO_LOTE_ESCRITA = 500;

async function buscarTodasLinhas(tabela, colunas, colunaOrdem, aoProgredir, aplicarFiltro) {
    const linhas = [];
    let ultimoValor = null;

    while (true) {
        let consulta = supabaseClient.from(tabela).select(colunas).order(colunaOrdem).limit(TAMANHO_PAGINA_LEITURA);
        if (aplicarFiltro) consulta = aplicarFiltro(consulta);
        if (ultimoValor !== null) consulta = consulta.gt(colunaOrdem, ultimoValor);

        const { data, error } = await consulta;
        if (error) throw error;

        if (data.length === 0) break;

        linhas.push(...data);
        if (aoProgredir) aoProgredir(linhas.length);

        ultimoValor = data[data.length - 1][colunaOrdem];
    }

    return linhas;
}

const CONCORRENCIA_LEITURA = 6;

async function buscarTodasLinhasParalelo(tabela, colunas, colunaOrdem, aoProgredir) {
    const { count, error } = await supabaseClient.from(tabela).select(colunaOrdem, { count: "exact", head: true });
    if (error || count == null) return buscarTodasLinhas(tabela, colunas, colunaOrdem, aoProgredir);

    const TAM = 1000;
    const totalPaginas = Math.ceil(count / TAM);
    const linhas = [];

    for (let i = 0; i < totalPaginas; i += CONCORRENCIA_LEITURA) {
        const lote = [];
        for (let p = i; p < Math.min(i + CONCORRENCIA_LEITURA, totalPaginas); p++) {
            const de = p * TAM;
            lote.push(
                supabaseClient.from(tabela).select(colunas).order(colunaOrdem).range(de, de + TAM - 1)
                    .then(({ data, error: e }) => { if (e) throw e; return data || []; })
            );
        }
        const feitos = await Promise.all(lote);
        for (const d of feitos) linhas.push(...d);
        if (aoProgredir) aoProgredir(linhas.length);
    }

    return linhas;
}

async function buscarTodasLinhasKeysetParalelo(tabela, colunas, colunaId, aoProgredir) {
    const { count, error } = await supabaseClient.from(tabela).select(colunaId, { count: "exact", head: true });
    if (error || !count) return buscarTodasLinhas(tabela, colunas, colunaId, aoProgredir);

    const [extMin, extMax] = await Promise.all([
        supabaseClient.from(tabela).select(colunaId).order(colunaId, { ascending: true }).limit(1),
        supabaseClient.from(tabela).select(colunaId).order(colunaId, { ascending: false }).limit(1)
    ]);
    const minId = extMin.data?.[0]?.[colunaId], maxId = extMax.data?.[0]?.[colunaId];

    if (typeof minId !== "number" || typeof maxId !== "number") {
        return buscarTodasLinhas(tabela, colunas, colunaId, aoProgredir);
    }

    const LINHAS_POR_FAIXA = 8000;
    const nFaixas = Math.max(1, Math.ceil(count / LINHAS_POR_FAIXA));
    const passo = Math.max(1, Math.ceil((maxId - minId + 1) / nFaixas));

    let carregadas = 0;
    async function puxarFaixa(lo, hi) {
        const out = [];
        let ultimo = lo - 1;
        while (true) {
            const { data, error: e } = await supabaseClient.from(tabela).select(colunas)
                .gt(colunaId, ultimo).lte(colunaId, hi).order(colunaId).limit(TAMANHO_PAGINA_LEITURA);
            if (e) throw e;
            if (data.length === 0) break;
            out.push(...data);
            ultimo = data[data.length - 1][colunaId];
            carregadas += data.length;
            if (aoProgredir) aoProgredir(carregadas);
        }
        return out;
    }

    const faixas = [];
    for (let lo = minId; lo <= maxId; lo += passo) faixas.push(puxarFaixa(lo, Math.min(lo + passo - 1, maxId)));
    const partes = await Promise.all(faixas);

    const linhas = [];
    for (const p of partes) linhas.push(...p);
    return linhas;
}

async function enviarEmLotes(linhas, operacao, aoProgredir) {
    if (linhas.length === 0) return;

    for (let inicio = 0; inicio < linhas.length; inicio += TAMANHO_LOTE_ESCRITA) {
        const lote = linhas.slice(inicio, inicio + TAMANHO_LOTE_ESCRITA);
        await operacao(lote);

        if (aoProgredir) aoProgredir(Math.min(inicio + TAMANHO_LOTE_ESCRITA, linhas.length), linhas.length);
    }
}

async function apagarTodasLinhas(tabela, colunaId, aoProgredir) {
    let totalApagado = 0;

    while (true) {
        const { data: lote, error: erroSelect } = await supabaseClient
            .from(tabela)
            .select(colunaId)
            .limit(TAMANHO_LOTE_ESCRITA);

        if (erroSelect) throw erroSelect;
        if (!lote || lote.length === 0) break;

        const ids = lote.map(linha => linha[colunaId]);
        const { error: erroDelete } = await supabaseClient.from(tabela).delete().in(colunaId, ids);
        if (erroDelete) throw erroDelete;

        totalApagado += ids.length;
        if (aoProgredir) aoProgredir(totalApagado);
    }

    return totalApagado;
}

async function buscarLinhasReferencias(aoProgredir) {
    const [operadores, eventos, diagnosticos, colaboradoresResponsaveis] = await Promise.all([
        buscarTodasLinhas("ref_operadores", "chave, dados", "chave", n => aoProgredir?.(`operadores: ${n}`)),
        buscarTodasLinhas("ref_eventos", "chave, dados", "chave", n => aoProgredir?.(`eventos: ${n}`)),
        buscarTodasLinhas("ref_diagnosticos", "chave, dados", "chave", n => aoProgredir?.(`diagnósticos: ${n}`)),
        buscarTodasLinhas("ref_colaboradores_responsaveis", "chave, dados", "chave", n => aoProgredir?.(`colaboradores responsáveis: ${n}`))
    ]);

    return { operadores, eventos, diagnosticos, colaboradoresResponsaveis };
}

function reconstruirReferencias({ operadores, eventos, diagnosticos, colaboradoresResponsaveis }) {
    return {
        operadores: new Map(operadores.map(linha => [linha.chave, linha.dados])),
        eventos: new Map(eventos.map(linha => [linha.chave, linha.dados])),
        diagnosticos: new Map(diagnosticos.map(linha => [linha.chave, linha.dados])),
        colaboradoresResponsaveis: new Map((colaboradoresResponsaveis ?? []).map(linha => [linha.chave, linha.dados]))
    };
}

async function buscarLinhasOrdens(aoProgredir) {
    const [linhasOrdens, linhasMovimentacoes] = await Promise.all([

        buscarTodasLinhasParalelo("ordens", "*", "id", n => aoProgredir?.(`ordens: ${n}`)),

        buscarTodasLinhasKeysetParalelo("movimentacoes", "*", "id", n => aoProgredir?.(`movimentações: ${n}`))
    ]);

    return { linhasOrdens, linhasMovimentacoes };
}

function reconstruirOrdens({ linhasOrdens, linhasMovimentacoes }) {
    const movimentacoesPorOrdem = new Map();
    for (const linha of linhasMovimentacoes) {
        if (!movimentacoesPorOrdem.has(linha.ordem_id)) movimentacoesPorOrdem.set(linha.ordem_id, []);
        movimentacoesPorOrdem.get(linha.ordem_id).push(linha);
    }

    const ordens = new Map();

    for (const linha of linhasOrdens) {
        const ordem = new OrdemServico({
            id: linha.id,
            cliente: linha.cliente,
            login: linha.login,
            cidade: linha.cidade,
            bairro: linha.bairro,
            assunto: linha.assunto,
            dataAbertura: linha.data_abertura ? new Date(linha.data_abertura) : null
        });

        ordem.dataFechamento = linha.data_fechamento ? new Date(linha.data_fechamento) : null;
        ordem.lat = linha.lat ?? null;
        ordem.lng = linha.lng ?? null;
        ordem.statusAtual = linha.status_atual;
        ordem.tecnicoResponsavel = linha.tecnico_responsavel;
        ordem.auditoriaIA = linha.auditoria_ia ?? null;

        const movimentacoesBrutas = movimentacoesPorOrdem.get(linha.id) ?? [];
        ordem.movimentacoes = movimentacoesBrutas
            .map(m => new Movimentacao({
                operador: m.operador,
                colaboradorResponsavel: m.colaborador_responsavel,
                equipe: m.equipe,
                evento: m.evento,
                diagnostico: m.diagnostico,
                proximaTarefa: m.proxima_tarefa,
                status: m.status,
                respostaPadrao: m.resposta_padrao,
                mensagem: m.mensagem ?? "",
                historico: m.historico ?? [],
                data: m.data ? new Date(m.data) : null
            }))
            .sort((a, b) => (a.data ?? 0) - (b.data ?? 0));

        ordens.set(ordem.id, ordem);
    }

    return ordens;
}

function aplicarLinhasAoEstado(referenciasBrutas, ordensBrutas) {
    const referencias = reconstruirReferencias(referenciasBrutas);
    const ordens = reconstruirOrdens(ordensBrutas);

    APP.referencias.operadores = referencias.operadores;
    APP.referencias.eventos = referencias.eventos;
    APP.referencias.diagnosticos = referencias.diagnosticos;
    APP.referencias.colaboradoresResponsaveis = referencias.colaboradoresResponsaveis;
    APP.dados.ordens = ordens;

    BairroEngine.normalizarBairros(APP.dados.ordens);

    AssuntoEngine.normalizarAssuntos(APP.dados.ordens);
}

async function registrarLogImportacao(nomeArquivo, tipo, estatisticas) {
    try {
        const { error } = await supabaseClient.from("logs_importacao").insert({
            nome_arquivo: nomeArquivo,
            tipo,
            importado_por: APP.usuario?.email ?? null,
            estatisticas
        });
        if (error) throw error;
    } catch (erro) {
        console.error("Falha ao registrar log de importação:", erro);
    }
}

async function buscarLogsImportacao(limite = 30) {
    const { data, error } = await supabaseClient
        .from("logs_importacao")
        .select("*")
        .order("importado_em", { ascending: false })
        .limit(limite);

    if (error) {
        console.error("Falha ao buscar logs de importação:", error);
        return [];
    }

    return data;
}

async function registrarLogLogin(emailUsuario) {
    try {
        const { error } = await supabaseClient.from("logs_login").insert({ usuario_email: emailUsuario });
        if (error) throw error;
    } catch (erro) {
        console.error("Falha ao registrar log de login:", erro);
    }
}

async function buscarLogsLogin(limite = 30) {
    const { data, error } = await supabaseClient
        .from("logs_login")
        .select("*")
        .order("logado_em", { ascending: false })
        .limit(limite);

    if (error) {
        console.error("Falha ao buscar logs de login:", error);
        return [];
    }

    return data;
}

async function persistirReferenciasNoSupabase(referencias, aoProgredir) {
    const paraLinhas = mapa => [...mapa.entries()].map(([chave, dados]) => ({ chave: String(chave), dados }));

    const substituir = async (tabela, linhas, rotulo) => {

        if (linhas.length === 0) {
            console.warn(`Nenhuma linha de "${rotulo}" veio nesse arquivo — mantendo o que já estava salvo.`);
            return;
        }

        await enviarEmLotes(
            linhas,
            lote => supabaseClient.from(tabela).upsert(lote, { onConflict: "chave" }).then(({ error }) => {
                if (error) throw error;
            }),
            aoProgredir ? (feitas, total) => aoProgredir(`Salvando ${rotulo}: ${feitas}/${total}`) : null
        );

        const existentes = await buscarTodasLinhas(tabela, "chave", "chave");
        const chavesNovas = new Set(linhas.map(l => l.chave));
        const chavesRemover = existentes.map(l => l.chave).filter(chave => !chavesNovas.has(chave));

        if (chavesRemover.length > 0) {
            await enviarEmLotes(
                chavesRemover,
                lote => supabaseClient.from(tabela).delete().in("chave", lote).then(({ error }) => {
                    if (error) throw error;
                }),
                aoProgredir ? (feitas, total) => aoProgredir(`Removendo ${rotulo} antigos: ${feitas}/${total}`) : null
            );
        }
    };

    await substituir("ref_operadores", paraLinhas(referencias.operadores), "operadores");
    await substituir("ref_eventos", paraLinhas(referencias.eventos), "eventos");
    await substituir("ref_diagnosticos", paraLinhas(referencias.diagnosticos), "diagnósticos");
    await substituir("ref_colaboradores_responsaveis", paraLinhas(referencias.colaboradoresResponsaveis), "colaboradores responsáveis");
}

function chaveMovimentacao(mov) {
    return [
        mov.data instanceof Date ? Math.round(mov.data.getTime() / 1000) : mov.data,
        mov.evento,
        mov.operador,
        mov.status,
        mov.diagnostico,
        mov.respostaPadrao
    ].join("|");
}

async function persistirOrdensNoSupabase(ordensNovas, movimentacoesExistentesPorOrdem, aoProgredir) {
    const idsTocados = [...ordensNovas.keys()];

    const linhasOrdens = idsTocados.map(id => {
        const ordem = APP.dados.ordens.get(id);
        return {
            id: String(ordem.id),
            cliente: ordem.cliente,
            login: ordem.login,
            cidade: ordem.cidade,
            bairro: ordem.bairro,
            assunto: ordem.assunto,
            data_abertura: ordem.dataAbertura,
            data_fechamento: ordem.dataFechamento,
            status_atual: ordem.statusAtual,
            tecnico_responsavel: ordem.tecnicoResponsavel,

            setor: AuditEngine.resolverReferencia(
                APP.referencias.operadores, ordem.tecnicoResponsavel, CONFIG_BASE.operadores.setor
            ),
            atualizado_em: new Date()
        };
    });

    await enviarEmLotes(
        linhasOrdens,
        lote => supabaseClient.from("ordens").upsert(lote, { onConflict: "id" }).then(({ error }) => {
            if (error) throw error;
        }),
        aoProgredir ? (feitas, total) => aoProgredir(`Salvando ordens: ${feitas}/${total}`) : null
    );

    const linhasMovimentacoes = [];
    let ignoradas = 0;

    for (const [id, ordem] of ordensNovas) {
        const existentes = movimentacoesExistentesPorOrdem?.get(id) ?? [];
        const chavesVistas = new Set(existentes.map(chaveMovimentacao));

        for (const mov of ordem.movimentacoes) {
            const chave = chaveMovimentacao(mov);
            if (chavesVistas.has(chave)) {
                ignoradas++;
                continue;
            }
            chavesVistas.add(chave);

            linhasMovimentacoes.push({
                ordem_id: String(id),
                operador: mov.operador === null || mov.operador === undefined ? null : String(mov.operador),
                colaborador_responsavel: mov.colaboradorResponsavel === null || mov.colaboradorResponsavel === undefined
                    ? null : String(mov.colaboradorResponsavel),
                equipe: mov.equipe === null || mov.equipe === undefined ? null : String(mov.equipe),
                evento: mov.evento === null || mov.evento === undefined ? null : String(mov.evento),
                diagnostico: mov.diagnostico === null || mov.diagnostico === undefined ? null : String(mov.diagnostico),
                proxima_tarefa: mov.proximaTarefa === null || mov.proximaTarefa === undefined ? null : String(mov.proximaTarefa),
                status: mov.status,
                resposta_padrao: mov.respostaPadrao,
                mensagem: mov.mensagem,
                historico: mov.historico,
                data: mov.data
            });
        }
    }

    await enviarEmLotes(
        linhasMovimentacoes,
        lote => supabaseClient.from("movimentacoes").insert(lote).then(({ error }) => {
            if (error) throw error;
        }),
        aoProgredir ? (feitas, total) => aoProgredir(`Salvando movimentações: ${feitas}/${total}`) : null
    );

    return { inseridas: linhasMovimentacoes.length, ignoradas };
}

let _ultimoCacheBruto = null;

async function restaurarDoCacheLocal() {
    const cache = await carregarCacheLocal();
    if (!cache) return false;
    _ultimoCacheBruto = cache;

    try {
        aplicarLinhasAoEstado(
            {
                operadores: cache.operadores, eventos: cache.eventos, diagnosticos: cache.diagnosticos,
                colaboradoresResponsaveis: cache.colaboradoresResponsaveis ?? []
            },
            { linhasOrdens: cache.linhasOrdens, linhasMovimentacoes: cache.linhasMovimentacoes }
        );
        APP.status.baseCarregada = APP.dados.ordens.size > 0 || APP.referencias.operadores.size > 0;

        console.log(
            `Restaurado do cache local (salvo em ${cache.salvoEm}): ${APP.dados.ordens.size} ordens, ` +
            `${APP.referencias.operadores.size} operadores, ${APP.referencias.eventos.size} eventos, ` +
            `${APP.referencias.diagnosticos.size} diagnósticos.`
        );

        return APP.status.baseCarregada;
    } catch (erro) {
        console.error("Falha ao restaurar cache local:", erro);
        return false;
    }
}

const IDADE_MAX_INCREMENTAL_MS = 24 * 3600 * 1000;

function _emLotes(arr, n) { const r = []; for (let i = 0; i < arr.length; i += n) r.push(arr.slice(i, i + n)); return r; }

async function atualizarIncremental(cache, aoProgredir) {
    if (!cache || !cache.linhasOrdens || !cache.linhasOrdens.length) return null;
    if (cache.salvoEm && Date.now() - new Date(cache.salvoEm).getTime() > IDADE_MAX_INCREMENTAL_MS) return null;

    let marca = null;
    for (const o of cache.linhasOrdens) { const a = o.atualizado_em; if (a && (!marca || a > marca)) marca = a; }
    if (!marca) return null;

    aoProgredir?.("mudanças recentes");
    const ordensDelta = await buscarTodasLinhas("ordens", "*", "id", null, q => q.gt("atualizado_em", marca));
    const ids = ordensDelta.map(o => o.id);
    const movsDelta = [];
    for (const lote of _emLotes(ids, 150)) {
        const parte = await buscarTodasLinhas("movimentacoes", "*", "id", null, q => q.in("ordem_id", lote));
        movsDelta.push(...parte);
    }

    const ordensMap = new Map(cache.linhasOrdens.map(o => [o.id, o]));
    for (const o of ordensDelta) ordensMap.set(o.id, o);
    const mexidas = new Set(ids);
    const movsMescladas = cache.linhasMovimentacoes.filter(m => !mexidas.has(m.ordem_id)).concat(movsDelta);

    return {
        referenciasBrutas: {
            operadores: cache.operadores, eventos: cache.eventos, diagnosticos: cache.diagnosticos,
            colaboradoresResponsaveis: cache.colaboradoresResponsaveis ?? []
        },
        ordensBrutas: { linhasOrdens: [...ordensMap.values()], linhasMovimentacoes: movsMescladas },
        deltaOrdens: ordensDelta.length, deltaMovs: movsDelta.length
    };
}

async function atualizarDoSupabase(aoProgredir, tinhaCache = false) {

    if (_ultimoCacheBruto) {
        try {
            const inc = await atualizarIncremental(_ultimoCacheBruto, aoProgredir);
            if (inc) {
                aplicarLinhasAoEstado(inc.referenciasBrutas, inc.ordensBrutas);
                APP.status.baseCarregada = APP.dados.ordens.size > 0;
                salvarCacheLocal(inc.referenciasBrutas, inc.ordensBrutas);
                _ultimoCacheBruto = {
                    ...inc.referenciasBrutas,
                    linhasOrdens: inc.ordensBrutas.linhasOrdens, linhasMovimentacoes: inc.ordensBrutas.linhasMovimentacoes,
                    salvoEm: new Date().toISOString()
                };
                console.log(`atualizarDoSupabase (incremental): ${inc.deltaOrdens} ordens mudadas, ${inc.deltaMovs} movimentações; total ${inc.ordensBrutas.linhasOrdens.length} ordens.`);
                return APP.status.baseCarregada;
            }
        } catch (erro) {
            console.warn("Incremental falhou — fazendo o carregamento completo:", erro);
        }
    }

    for (let tentativa = 1; tentativa <= 2; tentativa++) {
        try {
            const [referenciasBrutas, ordensBrutas] = await Promise.all([
                buscarLinhasReferencias(aoProgredir),
                buscarLinhasOrdens(aoProgredir)
            ]);

            const vazio = ordensBrutas.linhasOrdens.length === 0 && referenciasBrutas.operadores.length === 0 &&
                referenciasBrutas.eventos.length === 0 && referenciasBrutas.diagnosticos.length === 0;

            console.log(
                `atualizarDoSupabase (tentativa ${tentativa}): ${ordensBrutas.linhasOrdens.length} ordens, ` +
                `${ordensBrutas.linhasMovimentacoes.length} movimentações, ${referenciasBrutas.operadores.length} operadores, ` +
                `${referenciasBrutas.eventos.length} eventos, ${referenciasBrutas.diagnosticos.length} diagnósticos.`
            );

            if (vazio && tentativa === 1) {
                console.warn("Leitura veio vazia na primeira tentativa — tentando de novo em 500ms...");
                await new Promise(resolve => setTimeout(resolve, 500));
                continue;
            }

            aplicarLinhasAoEstado(referenciasBrutas, ordensBrutas);
            APP.status.baseCarregada = !vazio;

            salvarCacheLocal(referenciasBrutas, ordensBrutas);
            _ultimoCacheBruto = {
                ...referenciasBrutas,
                linhasOrdens: ordensBrutas.linhasOrdens, linhasMovimentacoes: ordensBrutas.linhasMovimentacoes,
                salvoEm: new Date().toISOString()
            };

            return APP.status.baseCarregada;

        } catch (erro) {
            console.error(`Falha ao buscar dados do Supabase (tentativa ${tentativa}):`, erro);
            if (tentativa === 2) return tinhaCache;
        }
    }

    return tinhaCache;
}

async function limparDadosImportados() {
    if (!podeEditarOperacao()) {
        alert("Só administradores e editores podem apagar os dados compartilhados.");
        return;
    }

    const confirmado = confirm(
        "Isso vai apagar TODAS as Ordens e a Base compartilhadas — pra TODO MUNDO que usa o " +
        "sistema, não só o seu navegador. Suas configurações pessoais (colunas, filtros, tema) " +
        "não são afetadas. Confirmar?"
    );

    if (!confirmado) return;

    mostrarCarregandoDados();

    try {

        await apagarTodasLinhas("movimentacoes", "id", n =>
            atualizarTextoCarregando(`Apagando movimentações: ${n}...`)
        );
        await apagarTodasLinhas("ordens", "id", n =>
            atualizarTextoCarregando(`Apagando ordens: ${n}...`)
        );

        atualizarTextoCarregando("Apagando base de referência...");
        const resultados = await Promise.all([
            supabaseClient.from("ref_operadores").delete().neq("chave", ""),
            supabaseClient.from("ref_eventos").delete().neq("chave", ""),
            supabaseClient.from("ref_diagnosticos").delete().neq("chave", ""),
            supabaseClient.from("ref_colaboradores_responsaveis").delete().neq("chave", ""),
            supabaseClient.from("logs_importacao").delete().neq("id", 0)
        ]);
        const falha = resultados.find(r => r.error);
        if (falha) throw falha.error;
    } catch (erro) {
        console.error("Falha ao apagar dados no Supabase:", erro);
        alert("Não foi possível apagar os dados compartilhados. Veja o console pra detalhes.");
        esconderCarregandoDados();
        return;
    }

    esconderCarregandoDados();

    APP.dados.ordens = new Map();
    APP.referencias.operadores = new Map();
    APP.referencias.eventos = new Map();
    APP.referencias.diagnosticos = new Map();
    APP.referencias.colaboradoresResponsaveis = new Map();
    APP.indicadores = {};
    APP.status.baseCarregada = false;

    await limparCacheLocal();

    atualizarBadgeAlertas();
    renderizarDashboard();
    renderizarAlertas();
    renderizarSecaoTecnicos();
    renderizarSecaoIndicadores();
    renderizarPainelAuditoriaOperacional();

    const inputBase = document.getElementById("arquivoBase");
    const inputOrdens = document.getElementById("arquivoOrdens");
    if (inputBase) inputBase.value = "";
    if (inputOrdens) inputOrdens.value = "";

    const status = document.getElementById("status");
    if (status) status.textContent = 'Dados limpos pra todo mundo. Selecione os arquivos e clique em "Gerar Relatório".';

    abrirModalImportar();
}
