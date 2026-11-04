const REGRAS_AUDITORIA_DIAGNOSTICO = [
    {
        id: "equipamento-troca-ou-recolhimento",

        diagnosticoContemAlgum: [
            "TROCA DE EQUIPAMENTO", "EQUIPAMENTO TROCADO", "EQUIPAMENTOS TROCADOS",
            "EQUIPAMENTO RECOLHIDO", "EQUIPAMENTOS RECOLHIDOS", "EQUIPAMENTO DEVOLVIDO"
        ],

        proximaTarefaContemAlgum: [
            "RECOLHIDO", "RECOLHIDOS", "TROCA DE EQUIPAMENTO", "EQUIPAMENTO TROCADO",
            "EQUIPAMENTOS TROCADOS", "CONFERÊNCIA DE EQUIPAMENTOS", "GERAR BOLETO", "FATURAR EQUIPAMENTO"
        ],
        severidade: "erro",
        mensagem: "Diagnóstico indica troca ou recolhimento de equipamento — a Próxima Tarefa deveria mencionar troca ou recolhimento de equipamento (ex.: abrir a conferência de estoque)."
    },

    {
        id: "mudanca-tecnologia-concluida",
        diagnostico: "MUDANÇA DE TECNOLOGIA CONCLUÍDA",
        proximaTarefaEsperada: ["CONCLUÍDA"],
        severidade: "erro",
        mensagem: "Diagnóstico indica mudança de tecnologia concluída — a Próxima Tarefa esperada é \"CONCLUÍDA\"."
    },
    {
        id: "mudanca-tecnologia-nao-concluida",
        diagnostico: "MUDANÇA DE TECNOLOGIA NÃO CONCLUÍDA",
        proximaTarefaEsperada: ["NÃO CONCLUÍDA"],
        severidade: "erro",
        mensagem: "Diagnóstico indica mudança de tecnologia NÃO concluída — a Próxima Tarefa esperada é \"NÃO CONCLUÍDA\"."
    },

    {
        id: "reparo-campo-concluido",
        diagnosticoContemAlgum: [
            "CABO NA PORTA ERRADA", "CLIENTE AUSENTE",
            "CONECTOR CTO", "CONFIGURAÇÃO DE ROTEADOR JUNTO A ONU",
            "EQUIPAMENTO DESLIGADO", "EQUIPAMENTO PESSOAL / IPTV", "FIBRA ATENUADA",
            "PROBLEMAS NO EQUIPAMENTO DO CLIENTE",
            "PROBLEMAS RELACIONADOS A CONEXÃO - RESOLVIDO",
            "RECONFIGURAÇÃO DE ROTEADOR", "ROMPIMENTO DE FIBRA", "TROCA DE CONECTOR"
        ],

        proximaTarefaContemAlgum: [
            "POS ATENDIMENTO", "PÓS ATENDIMENTO", "PESQUISA DE SATISFAÇÃO", "A.O.M",
            "MANUTENÇÃO CONCLUIDA - NÃO FOI TROCADO EQUIPAMENTO"
        ],
        severidade: "erro",
        mensagem: "Diagnóstico indica reparo de campo concluído — a Próxima Tarefa deveria ser o fechamento padrão de pós-atendimento (ex.: \"POS ATENDIMENTO\")."
    },

    {
        id: "cabeamento-remanejado",
        diagnostico: "CABEAMENTO REMANEJADO",
        proximaTarefaContemAlgum: [
            "POS ATENDIMENTO", "PÓS ATENDIMENTO", "PESQUISA DE SATISFAÇÃO", "A.O.M",
            "GERAR BOLETO TROCA DE COMODO", "GERAR BOLETO TROCA DE CÔMODO"
        ],
        severidade: "erro",
        mensagem: "Diagnóstico indica cabeamento remanejado — a Próxima Tarefa deveria ser o fechamento padrão de pós-atendimento ou, se envolveu comodato, gerar o boleto da troca."
    },

    {
        id: "instalacao-viabilidade-nao-concluida",
        diagnosticoContemAlgum: [
            "DESISTÊNCIA - TRANSFERÊNCIA DE ENDEREÇO", "DESISTÊNCIA DE INSTALAÇÃO",
            "INVIABILIDADE", "INVIABILIDADE - ÁREA DE RISCO"
        ],
        proximaTarefaContemAlgum: ["SEM VIABILIDADE", "INVIABILIDADE", "NÃO CONCLUÍDA", "DESISTÊNCIA"],
        severidade: "erro",
        mensagem: "Diagnóstico indica instalação/transferência não concluída por desistência ou inviabilidade — a Próxima Tarefa deveria refletir isso (ex.: \"SEM VIABILIDADE / DESISTÊNCIA\")."
    },

    {
        id: "equipamento-nao-devolvido",
        diagnosticoContemAlgum: [
            "3 TENTATIVAS DE RECOLHIMENTO", "CLIENTE SE NEGOU ENTREGAR O EQUIPAMENTO",
            "EQUIPAMENTO DO PROPRIO CLIENTE", "EQUIPAMENTO NÃO RECOLHIDO"
        ],
        proximaTarefaContemAlgum: ["FATURAR EQUIPAMENTO", "EQUIPAMENTO RECOLHIDO", "CONFERÊNCIA DE EQUIPAMENTOS"],
        severidade: "erro",
        mensagem: "Diagnóstico indica equipamento não devolvido pelo cliente — a Próxima Tarefa deveria mencionar faturamento do equipamento (ex.: \"FATURAR EQUIPAMENTO NÃO DEVOLVIDO\")."
    },

    {
        id: "comodato-realizado",
        diagnostico: "TROCA DE COMODO REALIZADA",
        proximaTarefaContemAlgum: [
            "GERAR BOLETO TROCA DE COMODO", "GERAR BOLETO TROCA DE CÔMODO",
            "EQUIPAMENTO RECOLHIDO", "EQUIPAMENTO TROCADO", "CONFERÊNCIA DE EQUIPAMENTOS"
        ],
        severidade: "erro",
        mensagem: "Diagnóstico indica troca de comodato realizada — a Próxima Tarefa esperada é gerar o boleto do novo comodato ou, se envolveu devolução do equipamento físico, mandar pra conferência."
    }

];

const DIAGNOSTICOS_SEM_PROXIMA_TAREFA_ESPERADA = [
    "CTO SEM POTÊNCIA",
    "CTO SEM VAGA",
    "EXPANSÃO CONCLUÍDA",
    "ORDEM CANCELADA PELO CLIENTE"
];

const ASSUNTOS_ORDEM_ESTRUTURA = [
    "CONSTRUÇÃO DE REDE",
    "MELHORIA DE REDE",
    "ÁREA DE MANUTENÇÃO - ROTA ALARMADA",
    "AJUSTE DE POTÊNCIA DA CTO",
    "ÁREA DE MANUTENÇÃO - PREVENTIVA",
    "EXCLUSÃO DE ACESSO E EQUIPAMENTOS"
];

window.REGRAS_AUDITORIA_DIAGNOSTICO = REGRAS_AUDITORIA_DIAGNOSTICO;
window.DIAGNOSTICOS_SEM_PROXIMA_TAREFA_ESPERADA = DIAGNOSTICOS_SEM_PROXIMA_TAREFA_ESPERADA;
window.ASSUNTOS_ORDEM_ESTRUTURA = ASSUNTOS_ORDEM_ESTRUTURA;
