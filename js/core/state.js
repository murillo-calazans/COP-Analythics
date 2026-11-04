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

    usuario: null,

    referencias: {

        operadores: new Map(),

        eventos: new Map(),

        diagnosticos: new Map(),

        colaboradoresResponsaveis: new Map()

    },

    dados: {

        ordens: new Map(),

        tecnicos: new Map()

    },

    indicadores: {},

    alertas: [],

    correcoesAuditoria: new Map(),

    configuracoes: {},

    filtrosGlobais: {

        dataInicio: inicioMesAtual(),
        dataFim: fimDeHoje(),
        assuntos: [],
        cidades: [],
        bairros: [],
        operadores: [],
        setores: [],
        diagnosticosOcultos: []

    },

    filtrosAlertas: {

        dataInicio: null,
        dataFim: null

    }

};
