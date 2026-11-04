const CACHE_DB_NOME = "cop-analytics-cache";
const CACHE_DB_VERSAO = 1;
const CACHE_STORE = "snapshot";
const CACHE_CHAVE = "atual";

function projetoDoCache() {
    try { return typeof SUPABASE_URL === "string" ? SUPABASE_URL : ""; } catch { return ""; }
}

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

async function salvarCacheLocal(referenciasBrutas, ordensBrutas) {
    try {
        const banco = await abrirBancoCacheLocal();

        await new Promise((resolve, reject) => {
            const transacao = banco.transaction(CACHE_STORE, "readwrite");
            transacao.objectStore(CACHE_STORE).put({
                operadores: referenciasBrutas.operadores,
                eventos: referenciasBrutas.eventos,
                diagnosticos: referenciasBrutas.diagnosticos,
                colaboradoresResponsaveis: referenciasBrutas.colaboradoresResponsaveis,
                linhasOrdens: ordensBrutas.linhasOrdens,
                linhasMovimentacoes: ordensBrutas.linhasMovimentacoes,
                salvoEm: new Date().toISOString(),
                projeto: projetoDoCache()
            }, CACHE_CHAVE);

            transacao.oncomplete = resolve;
            transacao.onerror = () => reject(transacao.error);
        });

        banco.close();
    } catch (erro) {
        console.error("Falha ao salvar cache local:", erro);
    }
}

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

        if (resultado && resultado.projeto !== projetoDoCache()) {
            console.warn(`Cache é de outro projeto (${resultado.projeto || "sem marca"}) — ignorando e apagando.`);
            await limparCacheLocal();
            return null;
        }

        return resultado;
    } catch (erro) {
        console.error("Falha ao ler cache local:", erro);
        return null;
    }
}

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
