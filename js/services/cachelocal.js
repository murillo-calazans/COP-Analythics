/**
 * ==========================================================
 * Cache Local (IndexedDB)
 * ==========================================================
 * Guarda a última leitura completa do Supabase neste navegador, pra
 * "mostrar na hora, atualizar depois": ao abrir o app, js/services/
 * armazenamento.js aplica isso direto (sem esperar rede nenhuma)
 * enquanto busca a versão atual do Supabase por trás e substitui
 * quando terminar. É puramente um acelerador de tela — o Supabase
 * continua sendo a única fonte de verdade compartilhada; se esse
 * cache falhar, estiver ausente ou vier vazio, não quebra nada, só
 * faz a primeira tela demorar como demorava antes.
 * Guarda as linhas BRUTAS (o mesmo formato que vem do Supabase),
 * não os Maps/OrdemServico/Movimentacao já reconstruídos — assim
 * reaproveita exatamente a mesma reconstrução (reconstruirReferencias/
 * reconstruirOrdens em armazenamento.js) nos dois casos.
 * localStorage não dá conta do volume (dezenas de milhares de
 * movimentações passam fácil de 10-20MB) — por isso IndexedDB.
 * Não é um cofre: não é criptografado nem some no logout (mesmo
 * modelo de confiança do token de sessão do Supabase, que já fica no
 * localStorage). A segurança de verdade é a RLS no banco, não isso.
 */

const CACHE_DB_NOME = "cop-analytics-cache";
const CACHE_DB_VERSAO = 1;
const CACHE_STORE = "snapshot";
const CACHE_CHAVE = "atual";

function abrirBancoCacheLocal() {
    return new Promise((resolve, reject) => {
        const pedido = indexedDB.open(CACHE_DB_NOME, CACHE_DB_VERSAO);

        pedido.onupgradeneeded = () => {
            if (!pedido.result.objectStoreNames.contains(CACHE_STORE)) {
                pedido.result.createObjectStore(CACHE_STORE);
            }
        };

        pedido.onsuccess = () => resolve(pedido.result);
        pedido.onerror = () => reject(pedido.error);
    });
}

/**
 * Salva o snapshot bruto (referências + ordens/movimentações) que acabou
 * de vir do Supabase. Best-effort: falha aqui não impede o app de
 * funcionar, só faz o próximo carregamento não ter cache pra usar.
 */
async function salvarCacheLocal(referenciasBrutas, ordensBrutas) {
    try {
        const banco = await abrirBancoCacheLocal();

        await new Promise((resolve, reject) => {
            const transacao = banco.transaction(CACHE_STORE, "readwrite");
            transacao.objectStore(CACHE_STORE).put({
                operadores: referenciasBrutas.operadores,
                eventos: referenciasBrutas.eventos,
                diagnosticos: referenciasBrutas.diagnosticos,
                linhasOrdens: ordensBrutas.linhasOrdens,
                linhasMovimentacoes: ordensBrutas.linhasMovimentacoes,
                salvoEm: new Date().toISOString()
            }, CACHE_CHAVE);

            transacao.oncomplete = resolve;
            transacao.onerror = () => reject(transacao.error);
        });

        banco.close();
    } catch (erro) {
        console.error("Falha ao salvar cache local:", erro);
    }
}

/** Retorna o snapshot salvo, ou null se não houver (ou der erro). */
async function carregarCacheLocal() {
    try {
        const banco = await abrirBancoCacheLocal();

        const resultado = await new Promise((resolve, reject) => {
            const transacao = banco.transaction(CACHE_STORE, "readonly");
            const pedido = transacao.objectStore(CACHE_STORE).get(CACHE_CHAVE);
            pedido.onsuccess = () => resolve(pedido.result ?? null);
            pedido.onerror = () => reject(pedido.error);
        });

        banco.close();
        return resultado;
    } catch (erro) {
        console.error("Falha ao ler cache local:", erro);
        return null;
    }
}

/** Apaga o cache local — chamado junto de limparDadosImportados(), senão o próximo F5 ressuscitaria o que acabou de ser apagado do banco. */
async function limparCacheLocal() {
    try {
        const banco = await abrirBancoCacheLocal();

        await new Promise((resolve, reject) => {
            const transacao = banco.transaction(CACHE_STORE, "readwrite");
            transacao.objectStore(CACHE_STORE).delete(CACHE_CHAVE);
            transacao.oncomplete = resolve;
            transacao.onerror = () => reject(transacao.error);
        });

        banco.close();
    } catch (erro) {
        console.error("Falha ao limpar cache local:", erro);
    }
}
