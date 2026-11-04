const CONFIG_REGIAO_ATUACAO = {

    assuntosForaDeCampo: [
        "auditoria", "exclusao de acesso", "instalacao nao concluida", "mudanca de tecnologia nao concluida",
        "nova tentativa de instalacao", "configurar conexao", "configuracao telefonia", "verificar troca de plano",
        "chip", "orcamento", "remocao telefonia", "area de manutencao", "expansao de rede", "rearranjo",
        "cto sem potencia", "ajuste de potencia", "melhoria de rede", "cto sem vaga", "verificar viabilidade",
        "pos terceirizada", "esim", "licitacao", "recolhimento", "retirada de equipamento", "cancelamento"
    ],

    diagnosticosIgnorados: ["cancelad", "aberto indevid", "aberto errad"],

    minimoOS: 20,

    bairrosExibidos: 6,

    bairrosNaConcentracao: 3,

    perfis: [
        { chave: "definida", rotulo: "Região definida", minimo: 0.40 },
        { chave: "mista", rotulo: "Região mista", minimo: 0.30 },
        { chave: "coringa", rotulo: "Sem região fixa", minimo: 0 }
    ]
};
