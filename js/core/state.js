/**
 * ==========================================================
 * COP Analytics
 * Estado Global da Aplicação
 * ==========================================================
 */

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

        diagnosticos: new Map()

    },

    dados: {

        ordens: new Map(),

        tecnicos: new Map()

    },

    indicadores: {},

    alertas: [],

    configuracoes: {},

    // Filtro Global: recorta o que aparece em Dashboard/Auditoria/Técnicos
    // ao mesmo tempo. dataInicio/dataFim são Date (período único); os
    // demais são arrays de texto exibido (resolvido, não o código bruto
    // da planilha) — seleção múltipla, uma OS entra se bater com
    // QUALQUER valor escolhido dentro do mesmo campo.
    //
    // "diagnosticosOcultos" é o único campo com lógica invertida (lista
    // negra, não branca): por padrão nada está oculto (mostra tudo);
    // marcar um diagnóstico aqui ESCONDE as OS com aquele diagnóstico no
    // fechamento, em vez de restringir só a eles — ver js/ui/filtroperiodo.js.
    filtrosGlobais: {

        dataInicio: null,
        dataFim: null,
        assuntos: [],
        cidades: [],
        bairros: [],
        eventos: [],
        operadores: [],
        setores: [],
        diagnosticosOcultos: []

    }

};