/**
 * ==========================================================
 * Configuração — Região de atuação dos técnicos
 * ==========================================================
 * Regras usadas pelo RegiaoAtuacaoEngine (js/engine/regiaoatuacaoengine.js)
 * pra descobrir em quais bairros cada técnico mais fecha OS. Edite aqui,
 * não no engine.
 */
const CONFIG_REGIAO_ATUACAO = {

    // Assuntos que não levam técnico ao cliente (trabalho interno do COP,
    // rede/infra, recolhimento): ficam fora da conta, senão quem fecha
    // auditoria ou expansão de rede "parece" atuar em todos os bairros.
    // Comparado com o assunto já normalizado (sem acento, minúsculo).
    assuntosForaDeCampo: [
        "auditoria", "exclusao de acesso", "instalacao nao concluida", "mudanca de tecnologia nao concluida",
        "nova tentativa de instalacao", "configurar conexao", "configuracao telefonia", "verificar troca de plano",
        "chip", "orcamento", "remocao telefonia", "area de manutencao", "expansao de rede", "rearranjo",
        "cto sem potencia", "ajuste de potencia", "melhoria de rede", "cto sem vaga", "verificar viabilidade",
        "pos terceirizada", "esim", "licitacao", "recolhimento", "retirada de equipamento", "cancelamento"
    ],

    // Diagnósticos de fechamento que não contam como atendimento no bairro.
    diagnosticosIgnorados: ["cancelad", "aberto indevid", "aberto errad"],

    // Técnico com menos OS que isso no período não tem amostra pra dizer região.
    minimoOS: 20,

    // Quantos bairros mostrar por técnico no quadro.
    bairrosExibidos: 6,

    // Concentração = parte das OS do técnico que cai nos seus N bairros mais frequentes.
    bairrosNaConcentracao: 3,

    // Perfis pela concentração (do mais concentrado pro menos). O primeiro cujo
    // "minimo" a concentração atingir vale.
    perfis: [
        { chave: "definida", rotulo: "Região definida", minimo: 0.40 },
        { chave: "mista", rotulo: "Região mista", minimo: 0.30 },
        { chave: "coringa", rotulo: "Sem região fixa", minimo: 0 }
    ]
};
