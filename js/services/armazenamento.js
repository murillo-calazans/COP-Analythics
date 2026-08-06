/**
 * ==========================================================
 * Serviço de Armazenamento (IndexedDB)
 * ==========================================================
 * Persiste APP.referencias e APP.dados.ordens entre sessões,
 * pra não precisar reimportar um arquivo de dezenas/centenas
 * de MB toda vez que a página é recarregada.
 *
 * IndexedDB clona os objetos (structured clone) e, ao fazer
 * isso, instâncias de OrdemServico/Movimentacao perdem seus
 * métodos (viram Object puro). Por isso, ao carregar de volta,
 * reconstruímos cada uma com "new OrdemServico(...)"/"new
 * Movimentacao(...)" — mantendo o restante do sistema livre
 * pra chamar métodos do modelo sem se preocupar com a origem
 * dos dados (import fresco ou carregado do armazenamento).
 */

const ARMAZENAMENTO_DB = "cop_analytics";
const ARMAZENAMENTO_VERSAO = 1;
const ARMAZENAMENTO_STORE = "estado";
const ARMAZENAMENTO_CHAVE = "app";

function abrirBancoArmazenamento() {
    return new Promise((resolve, reject) => {
        const requisicao = indexedDB.open(ARMAZENAMENTO_DB, ARMAZENAMENTO_VERSAO);

        requisicao.onupgradeneeded = () => {
            requisicao.result.createObjectStore(ARMAZENAMENTO_STORE);
        };

        requisicao.onsuccess = () => resolve(requisicao.result);
        requisicao.onerror = () => reject(requisicao.error);
    });
}

async function salvarEstado() {
    const db = await abrirBancoArmazenamento();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(ARMAZENAMENTO_STORE, "readwrite");

        tx.objectStore(ARMAZENAMENTO_STORE).put(
            {
                referencias: APP.referencias,
                ordens: APP.dados.ordens,
                salvoEm: new Date()
            },
            ARMAZENAMENTO_CHAVE
        );

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function carregarEstado() {
    const db = await abrirBancoArmazenamento();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(ARMAZENAMENTO_STORE, "readonly");
        const requisicao = tx.objectStore(ARMAZENAMENTO_STORE).get(ARMAZENAMENTO_CHAVE);

        requisicao.onsuccess = () => resolve(requisicao.result ?? null);
        requisicao.onerror = () => reject(requisicao.error);
    });
}

async function limparEstado() {
    const db = await abrirBancoArmazenamento();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(ARMAZENAMENTO_STORE, "readwrite");
        tx.objectStore(ARMAZENAMENTO_STORE).delete(ARMAZENAMENTO_CHAVE);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

function reconstruirOrdens(mapaBruto) {
    const ordens = new Map();

    for (const [id, bruta] of mapaBruto) {
        const ordem = new OrdemServico({
            id: bruta.id,
            cliente: bruta.cliente,
            login: bruta.login,
            cidade: bruta.cidade,
            bairro: bruta.bairro,
            assunto: bruta.assunto,
            dataAbertura: bruta.dataAbertura
        });

        ordem.dataFechamento = bruta.dataFechamento;
        ordem.statusAtual = bruta.statusAtual;
        ordem.tecnicoResponsavel = bruta.tecnicoResponsavel;
        ordem.indicadores = bruta.indicadores;
        ordem.alertas = bruta.alertas;
        ordem.auditoriaIA = bruta.auditoriaIA;
        ordem.movimentacoes = bruta.movimentacoes.map(m => new Movimentacao(m));

        ordens.set(id, ordem);
    }

    return ordens;
}

async function tentarRestaurarEstado() {
    try {
        const estado = await carregarEstado();
        if (!estado) return false;

        APP.referencias.operadores = estado.referencias.operadores;
        APP.referencias.eventos = estado.referencias.eventos;
        APP.referencias.diagnosticos = estado.referencias.diagnosticos;
        APP.dados.ordens = reconstruirOrdens(estado.ordens);
        APP.status.baseCarregada = true;

        console.log(`Estado restaurado do armazenamento local (salvo em ${estado.salvoEm.toLocaleString("pt-BR")}).`);
        return true;

    } catch (erro) {
        console.error("Falha ao restaurar estado salvo:", erro);
        return false;
    }
}

/**
 * Apaga Base + Ordens importadas (memória e IndexedDB) pra recomeçar do
 * zero. NÃO mexe em configurações (colunas, assuntos p/ recorrência,
 * funil de assuntos, tema) — isso é preferência do usuário, não dado
 * importado, e apagar junto seria surpresa desagradável.
 */
async function limparDadosImportados() {
    const confirmado = confirm(
        "Isso vai apagar todas as Ordens e a Base importadas (inclusive o que está salvo localmente). " +
        "Suas configurações (colunas, filtros, tema) não são afetadas. Confirmar?"
    );

    if (!confirmado) return;

    APP.dados.ordens = new Map();
    APP.referencias.operadores = new Map();
    APP.referencias.eventos = new Map();
    APP.referencias.diagnosticos = new Map();
    APP.indicadores = {};
    APP.status.baseCarregada = false;

    try {
        await limparEstado();
    } catch (erro) {
        console.error("Falha ao limpar estado salvo:", erro);
    }

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
    if (status) status.textContent = 'Dados limpos. Selecione os arquivos e clique em "Gerar Relatório".';

    abrirModal("modalImportar");
}
