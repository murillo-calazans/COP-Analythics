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
 *
 * Duas coisas exigem cuidado especial por causa do volume de dados
 * (dezenas de milhares de movimentações não é incomum aqui):
 * - LEITURA: o PostgREST do Supabase limita cada resposta a um teto de
 *   linhas (1000 por padrão) — um único .select("*") silenciosamente
 *   devolveria só a primeira página, sem erro nenhum. buscarTodasLinhas
 *   pagina com .range() até esgotar.
 * - ESCRITA: mandar dezenas de milhares de linhas numa upsert/insert só
 *   trava o navegador por muito tempo sem feedback nenhum (parece
 *   travado, mesmo funcionando). enviarEmLotes quebra em pedaços
 *   menores e reporta progresso.
 */

const TAMANHO_PAGINA_LEITURA = 1000;
const TAMANHO_LOTE_ESCRITA = 500;

/**
 * Paginação por "keyset" (WHERE chave > última_vista ORDER BY chave
 * LIMIT n), não por .range()/OFFSET — com OFFSET, cada página fica mais
 * lenta que a anterior, porque o Postgres precisa varrer e descartar
 * todas as linhas de trás antes de chegar na página pedida; numa tabela
 * grande (dezenas de milhares de movimentações não é incomum aqui) isso
 * é lento o bastante pra estourar o tempo limite da consulta. Keyset usa
 * o índice da chave direto, então toda página é igualmente rápida,
 * não importa o tamanho da tabela.
 */
async function buscarTodasLinhas(tabela, colunas, colunaOrdem) {
    const linhas = [];
    let ultimoValor = null;

    while (true) {
        let consulta = supabaseClient.from(tabela).select(colunas).order(colunaOrdem).limit(TAMANHO_PAGINA_LEITURA);
        if (ultimoValor !== null) consulta = consulta.gt(colunaOrdem, ultimoValor);

        const { data, error } = await consulta;
        if (error) throw error;

        linhas.push(...data);
        if (data.length < TAMANHO_PAGINA_LEITURA) break;

        ultimoValor = data[data.length - 1][colunaOrdem];
    }

    return linhas;
}

/**
 * Executa "operacao" em pedaços de "linhas", chamando aoProgredir(feitas,
 * total) depois de cada lote — pra UI conseguir mostrar progresso em vez
 * de parecer travada numa importação grande.
 */
async function enviarEmLotes(linhas, operacao, aoProgredir) {
    if (linhas.length === 0) return;

    for (let inicio = 0; inicio < linhas.length; inicio += TAMANHO_LOTE_ESCRITA) {
        const lote = linhas.slice(inicio, inicio + TAMANHO_LOTE_ESCRITA);
        await operacao(lote);

        if (aoProgredir) aoProgredir(Math.min(inicio + TAMANHO_LOTE_ESCRITA, linhas.length), linhas.length);
    }
}

async function buscarReferencias() {
    const [operadores, eventos, diagnosticos] = await Promise.all([
        buscarTodasLinhas("ref_operadores", "chave, dados", "chave"),
        buscarTodasLinhas("ref_eventos", "chave, dados", "chave"),
        buscarTodasLinhas("ref_diagnosticos", "chave, dados", "chave")
    ]);

    return {
        operadores: new Map(operadores.map(linha => [linha.chave, linha.dados])),
        eventos: new Map(eventos.map(linha => [linha.chave, linha.dados])),
        diagnosticos: new Map(diagnosticos.map(linha => [linha.chave, linha.dados]))
    };
}

async function buscarOrdens() {
    const [linhasOrdens, linhasMovimentacoes] = await Promise.all([
        buscarTodasLinhas("ordens", "*", "id"),
        buscarTodasLinhas("movimentacoes", "*", "id")
    ]);

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
 * Registra no log qual arquivo foi importado, por quem e um resumo —
 * mostrado no popup de Importar Dados ("Arquivos no banco"). Não
 * interrompe a importação se falhar (log é informativo, não crítico).
 */
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

/** Últimos logs de importação, mais recente primeiro — pro popup de Importar Dados. */
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

/**
 * Registra no log quem entrou no sistema e quando — mostrado no popup
 * de Logs, aba "Logins". Só em login de verdade (envio do formulário),
 * não em toda sessão restaurada por F5 (ver js/ui/login.js). Não
 * interrompe o login se falhar (log é informativo, não crítico).
 */
async function registrarLogLogin(emailUsuario) {
    try {
        const { error } = await supabaseClient.from("logs_login").insert({ usuario_email: emailUsuario });
        if (error) throw error;
    } catch (erro) {
        console.error("Falha ao registrar log de login:", erro);
    }
}

/** Últimos logins, mais recente primeiro — pro popup de Logs. */
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

/**
 * Upsert das referências (Base.xlsx) no Supabase — chamado por
 * importarBase() em js/services/importador.js. Guarda a linha bruta
 * inteira em JSONB, exatamente como já vem de ReferenceEngine.carregar.
 * Em lotes (ver enviarEmLotes) — Base.xlsx costuma ser pequena, mas não
 * custa nada ficar consistente com o resto.
 */
async function persistirReferenciasNoSupabase(referencias, aoProgredir) {
    const paraLinhas = mapa => [...mapa.entries()].map(([chave, dados]) => ({ chave: String(chave), dados }));

    const gravar = async (tabela, linhas, rotulo) => {
        await enviarEmLotes(
            linhas,
            lote => supabaseClient.from(tabela).upsert(lote, { onConflict: "chave" }).then(({ error }) => {
                if (error) throw error;
            }),
            aoProgredir ? (feitas, total) => aoProgredir(`Salvando ${rotulo}: ${feitas}/${total}`) : null
        );
    };

    await gravar("ref_operadores", paraLinhas(referencias.operadores), "operadores");
    await gravar("ref_eventos", paraLinhas(referencias.eventos), "eventos");
    await gravar("ref_diagnosticos", paraLinhas(referencias.diagnosticos), "diagnósticos");
}

/**
 * Chave de comparação de uma movimentação, usada só pra detectar
 * duplicata (mesma OS + mesmo evento real) entre o que já está no
 * banco e o que acabou de ser lido do Excel — não é um ID de verdade,
 * é uma "impressão digital" dos campos que identificam um evento real
 * (reimportar o mesmo arquivo, ou um arquivo com linhas sobrepostas,
 * gera a mesma chave e cai fora).
 */
function chaveMovimentacao(mov) {
    return [
        mov.data instanceof Date ? mov.data.getTime() : mov.data,
        mov.evento,
        mov.operador,
        mov.status,
        mov.diagnostico,
        mov.respostaPadrao
    ].join("|");
}

/**
 * Upsert das OS + insert das movimentações NOVAS no Supabase —
 * chamado por importarOrdens() depois do merge local
 * (DataEngine.mesclarOrdens). "ordensNovas" é o resultado cru dessa
 * importação (antes do merge) — usamos ele pra saber quais IDs foram
 * tocados. "movimentacoesExistentesPorOrdem" é um snapshot (Map id ->
 * array de Movimentacao) de como cada uma dessas OS estava ANTES do
 * merge, ou seja, o que já estava persistido no banco — usamos pra
 * pular (ignorar) qualquer movimentação que já exista, em vez de
 * duplicar. Isso é o que permite reimportar o mesmo arquivo, ou um mês
 * já coberto, sem inflar a tabela: só entra o que é genuinamente novo
 * (ex.: uma OS aberta em um mês que só fecha no mês seguinte continua
 * ganhando as movimentações novas normalmente).
 * O snapshot da OS em si (cliente/status/etc.) vem do estado JÁ
 * mesclado em APP.dados.ordens, que é o mais atualizado. Em lotes (ver
 * enviarEmLotes) — um Ordens.xlsx grande facilmente passa de dezenas de
 * milhares de movimentações, e mandar tudo numa chamada só trava o
 * navegador por muito tempo sem dar nenhum retorno visual.
 * Retorna { inseridas, ignoradas } (contagem de movimentações), pra
 * importador.js poder mostrar "tantas carregadas, tantas ignoradas".
 */
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

    await enviarEmLotes(
        linhasMovimentacoes,
        lote => supabaseClient.from("movimentacoes").insert(lote).then(({ error }) => {
            if (error) throw error;
        }),
        aoProgredir ? (feitas, total) => aoProgredir(`Salvando movimentações: ${feitas}/${total}`) : null
    );

    return { inseridas: linhasMovimentacoes.length, ignoradas };
}

/**
 * Busca tudo do Supabase e popula APP.referencias/APP.dados.ordens.
 * Chamado uma vez ao logar (ver js/ui/login.js), não a cada troca de
 * tela — a partir daí o app trabalha em memória, igual sempre fez.
 */
async function tentarRestaurarEstado() {
    for (let tentativa = 1; tentativa <= 2; tentativa++) {
        try {
            const [referencias, ordens] = await Promise.all([buscarReferencias(), buscarOrdens()]);

            const vazio = ordens.size === 0 && referencias.operadores.size === 0 &&
                referencias.eventos.size === 0 && referencias.diagnosticos.size === 0;

            console.log(
                `tentarRestaurarEstado (tentativa ${tentativa}): ${ordens.size} ordens, ` +
                `${referencias.operadores.size} operadores, ${referencias.eventos.size} eventos, ` +
                `${referencias.diagnosticos.size} diagnósticos.`
            );

            // Se veio tudo vazio na primeira tentativa, pode ser uma corrida
            // entre a sessão recém-restaurada (F5) e o token de autenticação
            // ainda não anexado às consultas — nesse caso a RLS filtra tudo
            // silenciosamente (sem erro nenhum) e pareceria "os dados
            // sumiram". Espera um instante e tenta de novo antes de concluir
            // que realmente não há nada no banco.
            if (vazio && tentativa === 1) {
                console.warn("Leitura veio vazia na primeira tentativa — tentando de novo em 500ms...");
                await new Promise(resolve => setTimeout(resolve, 500));
                continue;
            }

            APP.referencias.operadores = referencias.operadores;
            APP.referencias.eventos = referencias.eventos;
            APP.referencias.diagnosticos = referencias.diagnosticos;
            APP.dados.ordens = ordens;
            APP.status.baseCarregada = !vazio;

            return APP.status.baseCarregada;

        } catch (erro) {
            console.error(`Falha ao buscar dados do Supabase (tentativa ${tentativa}):`, erro);
            if (tentativa === 2) return false;
        }
    }

    return false;
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
            supabaseClient.from("ref_diagnosticos").delete().neq("chave", ""),
            supabaseClient.from("logs_importacao").delete().neq("id", 0)
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

    abrirModalImportar();
}
