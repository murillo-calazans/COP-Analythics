/**
 * ==========================================================
 * Serviço de Armazenamento (Supabase)
 * ==========================================================
 * Busca APP.referencias e APP.dados.ordens do banco compartilhado
 * (Supabase) — substitui o antigo IndexedDB local por navegador.
 * Qualquer usuário autenticado (admin ou leitor) vê os mesmos
 * dados; só admin consegue escrever (RLS, ver
 * database/schema-supabase.sql).
 *
 * "ref_operadores"/"ref_eventos"/"ref_diagnosticos" guardam a
 * linha bruta da planilha inteira em JSONB — reconstruímos
 * APP.referencias.* exatamente como antes (Map<chave, linhaBruta>),
 * então resolverReferencia/encontrarColuna continuam funcionando
 * sem nenhuma mudança. "ordens"/"movimentacoes" já são tipadas, e
 * reconstruímos "new OrdemServico(...)"/"new Movimentacao(...)"
 * igual o restante do sistema já espera.
 */

async function buscarReferencias() {
    const [operadores, eventos, diagnosticos] = await Promise.all([
        supabaseClient.from("ref_operadores").select("chave, dados"),
        supabaseClient.from("ref_eventos").select("chave, dados"),
        supabaseClient.from("ref_diagnosticos").select("chave, dados")
    ]);

    if (operadores.error) throw operadores.error;
    if (eventos.error) throw eventos.error;
    if (diagnosticos.error) throw diagnosticos.error;

    return {
        operadores: new Map(operadores.data.map(linha => [linha.chave, linha.dados])),
        eventos: new Map(eventos.data.map(linha => [linha.chave, linha.dados])),
        diagnosticos: new Map(diagnosticos.data.map(linha => [linha.chave, linha.dados]))
    };
}

async function buscarOrdens() {
    const { data: linhasOrdens, error: erroOrdens } = await supabaseClient.from("ordens").select("*");
    if (erroOrdens) throw erroOrdens;

    const { data: linhasMovimentacoes, error: erroMovs } = await supabaseClient.from("movimentacoes").select("*");
    if (erroMovs) throw erroMovs;

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
        ordem.statusAtual = linha.status_atual;
        ordem.tecnicoResponsavel = linha.tecnico_responsavel;
        ordem.auditoriaIA = linha.auditoria_ia ?? null;

        const movimentacoesBrutas = movimentacoesPorOrdem.get(linha.id) ?? [];
        ordem.movimentacoes = movimentacoesBrutas
            .map(m => new Movimentacao({
                operador: m.operador,
                equipe: m.equipe,
                evento: m.evento,
                diagnostico: m.diagnostico,
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

/**
 * Upsert das referências (Base.xlsx) no Supabase — chamado por
 * importarBase() em js/services/importador.js. Guarda a linha bruta
 * inteira em JSONB, exatamente como já vem de ReferenceEngine.carregar.
 */
async function persistirReferenciasNoSupabase(referencias) {
    const paraLinhas = mapa => [...mapa.entries()].map(([chave, dados]) => ({ chave: String(chave), dados }));

    const [operadores, eventos, diagnosticos] = await Promise.all([
        supabaseClient.from("ref_operadores").upsert(paraLinhas(referencias.operadores), { onConflict: "chave" }),
        supabaseClient.from("ref_eventos").upsert(paraLinhas(referencias.eventos), { onConflict: "chave" }),
        supabaseClient.from("ref_diagnosticos").upsert(paraLinhas(referencias.diagnosticos), { onConflict: "chave" })
    ]);

    if (operadores.error) throw operadores.error;
    if (eventos.error) throw eventos.error;
    if (diagnosticos.error) throw diagnosticos.error;
}

/**
 * Upsert das OS + insert das movimentações NOVAS no Supabase —
 * chamado por importarOrdens() depois do merge local
 * (DataEngine.mesclarOrdens). "ordensNovas" é o resultado cru dessa
 * importação (antes do merge) — usamos ele pra saber quais IDs foram
 * tocados e quais movimentações são realmente novas (evita duplicar no
 * banco movimentações já persistidas em uma importação anterior).
 * O snapshot da OS em si (cliente/status/etc.) vem do estado JÁ
 * mesclado em APP.dados.ordens, que é o mais atualizado.
 */
async function persistirOrdensNoSupabase(ordensNovas) {
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
            atualizado_em: new Date()
        };
    });

    const { error: erroOrdens } = await supabaseClient.from("ordens").upsert(linhasOrdens, { onConflict: "id" });
    if (erroOrdens) throw erroOrdens;

    const linhasMovimentacoes = [];
    for (const [id, ordem] of ordensNovas) {
        for (const mov of ordem.movimentacoes) {
            linhasMovimentacoes.push({
                ordem_id: String(id),
                operador: mov.operador === null || mov.operador === undefined ? null : String(mov.operador),
                equipe: mov.equipe === null || mov.equipe === undefined ? null : String(mov.equipe),
                evento: mov.evento === null || mov.evento === undefined ? null : String(mov.evento),
                diagnostico: mov.diagnostico === null || mov.diagnostico === undefined ? null : String(mov.diagnostico),
                status: mov.status,
                resposta_padrao: mov.respostaPadrao,
                mensagem: mov.mensagem,
                historico: mov.historico,
                data: mov.data
            });
        }
    }

    if (linhasMovimentacoes.length === 0) return;

    const { error: erroMovs } = await supabaseClient.from("movimentacoes").insert(linhasMovimentacoes);
    if (erroMovs) throw erroMovs;
}

/**
 * Busca tudo do Supabase e popula APP.referencias/APP.dados.ordens.
 * Chamado uma vez ao logar (ver js/ui/login.js), não a cada troca de
 * tela — a partir daí o app trabalha em memória, igual sempre fez.
 */
async function tentarRestaurarEstado() {
    try {
        const [referencias, ordens] = await Promise.all([buscarReferencias(), buscarOrdens()]);

        APP.referencias.operadores = referencias.operadores;
        APP.referencias.eventos = referencias.eventos;
        APP.referencias.diagnosticos = referencias.diagnosticos;
        APP.dados.ordens = ordens;
        APP.status.baseCarregada = ordens.size > 0 || referencias.operadores.size > 0;

        return APP.status.baseCarregada;

    } catch (erro) {
        console.error("Falha ao buscar dados do Supabase:", erro);
        return false;
    }
}

/**
 * Apaga Base + Ordens compartilhadas (banco Supabase — pra TODO MUNDO
 * que usa o sistema, não só quem clicou) pra recomeçar do zero. Só
 * admin chega a essa função (botão escondido pra leitor, ver
 * js/ui/login.js -> aplicarGateDePapel; e a RLS recusaria a escrita de
 * qualquer forma). NÃO mexe em configurações (colunas, assuntos p/
 * recorrência, funil de assuntos, tema) — isso é preferência local do
 * navegador de cada um, não dado compartilhado.
 */
async function limparDadosImportados() {
    if (!ehAdmin()) {
        alert("Só administradores podem apagar os dados compartilhados.");
        return;
    }

    const confirmado = confirm(
        "Isso vai apagar TODAS as Ordens e a Base compartilhadas — pra TODO MUNDO que usa o " +
        "sistema, não só o seu navegador. Suas configurações pessoais (colunas, filtros, tema) " +
        "não são afetadas. Confirmar?"
    );

    if (!confirmado) return;

    try {
        await supabaseClient.from("movimentacoes").delete().neq("id", 0);
        await Promise.all([
            supabaseClient.from("ordens").delete().neq("id", ""),
            supabaseClient.from("ref_operadores").delete().neq("chave", ""),
            supabaseClient.from("ref_eventos").delete().neq("chave", ""),
            supabaseClient.from("ref_diagnosticos").delete().neq("chave", "")
        ]);
    } catch (erro) {
        console.error("Falha ao apagar dados no Supabase:", erro);
        alert("Não foi possível apagar os dados compartilhados. Veja o console pra detalhes.");
        return;
    }

    APP.dados.ordens = new Map();
    APP.referencias.operadores = new Map();
    APP.referencias.eventos = new Map();
    APP.referencias.diagnosticos = new Map();
    APP.indicadores = {};
    APP.status.baseCarregada = false;

    atualizarBadgeAlertas();
    renderizarDashboard();
    renderizarAlertas();
    renderizarSecaoTecnicos();
    renderizarSecaoIndicadores();

    const inputBase = document.getElementById("arquivoBase");
    const inputOrdens = document.getElementById("arquivoOrdens");
    if (inputBase) inputBase.value = "";
    if (inputOrdens) inputOrdens.value = "";

    const status = document.getElementById("status");
    if (status) status.textContent = 'Dados limpos pra todo mundo. Selecione os arquivos e clique em "Gerar Relatório".';

    abrirModal("modalImportar");
}
