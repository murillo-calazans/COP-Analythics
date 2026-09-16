/**
 * ==========================================================
 * COP Analytics
 * Estado Global da Aplicação
 * ==========================================================
 */

/**
 * Período padrão do Filtro Global (ver filtrosGlobais mais abaixo):
 * mês atual, do dia 1 até agora. Existe só por desempenho — com o
 * histórico inteiro acumulado (meses de OS), cada renderização do
 * Dashboard/Indicadores/Auditoria pode levar vários segundos; olhando
 * só o mês atual esse volume cai bastante. O usuário pode trocar pra
 * qualquer outro período, ou limpar o filtro pra ver tudo, a qualquer
 * momento — isso aqui só define o que aparece na primeira tela.
 */
function inicioMesAtual() {
    const agora = new Date();
    return new Date(agora.getFullYear(), agora.getMonth(), 1, 0, 0, 0, 0);
}

function fimDeHoje() {
    const agora = new Date();
    return new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 23, 59, 59, 999);
}

const APP = {

    info: {

        nome: "COP Analytics",

        versao: "0.1.0",

        empresa: null

    },

    status: {

        inicializado: false,

        carregando: false,

        baseCarregada: false,

        autenticado: false

    },

    // Preenchido após login bem-sucedido: { id, email, papel }.
    // papel "admin" importa/apaga; papel "leitor" só pesquisa/analisa.
    usuario: null,

    referencias: {

        operadores: new Map(),

        eventos: new Map(),

        diagnosticos: new Map(),

        // Cadastro separado do de operadores (aba própria na Base.xlsx,
        // sem coluna de SETOR) — ver js/config/colunas.js.
        colaboradoresResponsaveis: new Map()

    },

    dados: {

        ordens: new Map(),

        tecnicos: new Map()

    },

    indicadores: {},

    alertas: [],

    // Correções manuais de achados da Auditoria Operacional — Map<`${ordemId}||${tipoAchado}`, {corrigidoPor, corrigidoEm}>.
    // Compartilhado (Supabase), qualquer usuário logado marca/desmarca —
    // ver js/services/auditoriacorrecoes.js.
    correcoesAuditoria: new Map(),

    configuracoes: {},

    // Filtro Global: recorta o que aparece em Dashboard/Auditoria/Técnicos/
    // Indicadores ao mesmo tempo. dataInicio/dataFim são Date e filtram
    // pela data de FINALIZAÇÃO da OS (não a de abertura); os demais são
    // arrays de texto exibido (resolvido, não o código bruto da planilha)
    // — seleção múltipla, uma OS entra se bater com QUALQUER valor
    // escolhido dentro do mesmo campo. Operador e setor também são
    // amarrados ao fechamento (quem finalizou a OS, não qualquer um que
    // só abriu/assumiu/movimentou ela) — ver js/engine/filtroengine.js.
    //
    // "diagnosticosOcultos" é o único campo com lógica invertida (lista
    // negra, não branca): por padrão nada está oculto (mostra tudo);
    // marcar um diagnóstico aqui ESCONDE as OS com aquele diagnóstico no
    // fechamento, em vez de restringir só a eles — ver js/ui/filtroperiodo.js.
    filtrosGlobais: {

        // Padrão: mês atual (ver inicioMesAtual/fimDeHoje acima) — não
        // "Todos", por desempenho. Trocável a qualquer momento no modal
        // do Filtro Global, inclusive voltando pra "Todos" (Limpar filtro).
        dataInicio: inicioMesAtual(),
        dataFim: fimDeHoje(),
        assuntos: [],
        cidades: [],
        bairros: [],
        operadores: [],
        setores: [],
        diagnosticosOcultos: []

    },

    // Alertas (recorrência) é de propósito INDEPENDENTE do Filtro Global
    // (cidade/setor/assunto/período/etc. não se aplicam) — só as próprias
    // configurações da recorrência (Assuntos que Contam / Diagnósticos
    // Excluídos da Recorrência) e esse período local valem. Sem período
    // definido, considera o histórico inteiro. Ver js/ui/alertas.js.
    filtrosAlertas: {

        dataInicio: null,
        dataFim: null

    }

};