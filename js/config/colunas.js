const CONFIG_BASE = {
    operadores: {
        chave: "ID",
        nome: "NOME",
        setor: "DESCRIAAO"
    },
    eventos: {
        chave: "ID",
        nome: "DESCRIAAO"
    },
    diagnosticos: {
        chave: "ID DIAGNASTICO DETALHADO",
        nome: "DESCRIAAO"
    },

    colaboradoresResponsaveis: {
        chave: "ID",
        nome: "NOME"
    }
};

const CONFIG_ORDENS = {
    id: "ID OS",
    cliente: "CLIENTE",
    login: "LOGIN",
    cidade: "CIDADE",
    bairro: "BAIRRO",
    assunto: "ASSUNTO",
    operador: "ID OPERADOR",
    colaboradorResponsavel: "COLABORADOR RESPONSAVEL",
    equipe: "EQUIPE",
    evento: "EVENTO",
    diagnostico: "DIAGNOSTICO",
    proximaTarefa: "PRAXIMA TAREFA",
    status: "STATUS",
    respostaPadrao: "RESPOSTA PADRAO",
    mensagem: "MENSAGEM",
    historico: "HISTARICO",
    data: "DATA"
};

window.CONFIG_BASE = CONFIG_BASE;
window.CONFIG_ORDENS = CONFIG_ORDENS;
