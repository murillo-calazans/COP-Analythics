/**
 * ==========================================================
 * Motivos de Reabertura — classificação por palavra-chave
 * ==========================================================
 * A mensagem do evento "Reabertura" (Evento 3) é texto livre digitado
 * por quem reabriu a OS — não vem num campo fechado/categorizado. Estas
 * listas dizem quais palavras/expressões (comparadas sem acento/
 * maiúscula, por "contém" — ver classificarMotivoReabertura em
 * js/utils/motivoreabertura.js) indicam cada categoria. Como a redação
 * varia de pessoa pra pessoa, é normal ir ACRESCENTANDO expressões aqui
 * conforme aparecerem novos padrões nos dados reais — não precisa mexer
 * no motor (js/engine/indicatorengine.js) pra isso.
 *
 * - ERRO_PROCESSO: a OS foi executada de verdade, só o fechamento (ou
 *   um passo do processo) saiu errado — reabre pro MESMO técnico
 *   corrigir. Não muda quem fica com o crédito: continua o 1º
 *   Fechamento (ver IndicatorEngine.analisarEventosOS -> fechamentoEfetivo).
 *
 * - SERVICO_NAO_EXECUTADO: o operador fechou a OS sem realizar a
 *   visita/serviço de fato — reabre pra OUTRO técnico concluir de
 *   verdade. Muda quem fica com o crédito: passa a ser o ÚLTIMO
 *   Fechamento (quem realmente atendeu).
 *
 * Se a mensagem não bater com nenhuma expressão das duas listas, a
 * classificação fica "indefinido" — tratada igual ERRO_PROCESSO (não
 * muda o crédito), por segurança: só troca pro último fechamento
 * quando há sinal claro de que o serviço não foi executado.
 */
const MOTIVOS_REABERTURA = {
    ERRO_PROCESSO: [
        "ACERTO DE PROXIMA TAREFA",
        "ACERTO DE PRÓXIMA TAREFA",
        "ACERTO DE PROCESSO",
        "AJUSTE DE PROCESSO",
        "AJUSTE DE FECHAMENTO",
        "CORRECAO DE FECHAMENTO",
        "CORREÇÃO DE FECHAMENTO",
        "CORRECAO DE PROCESSO",
        "CORREÇÃO DE PROCESSO",
        "ERRO DE FECHAMENTO",
        "FECHAMENTO INCORRETO",
        "FECHADO ERRADO"
    ],
    SERVICO_NAO_EXECUTADO: [
        "REALIZAR A VISITA",
        "REALIZAR VISITA",
        "VISITA NAO REALIZADA",
        "VISITA NÃO REALIZADA",
        "VISITA SEM SUCESSO",
        "SEM ATENDIMENTO",
        "NAO FOI ATENDIDO",
        "NÃO FOI ATENDIDO",
        "NAO COMPARECEU",
        "NÃO COMPARECEU",
        "A PEDIDO DE",
        "A PEDIDO DO",
        "A PEDIDO DA",
        "SERVICO NAO EXECUTADO",
        "SERVIÇO NÃO EXECUTADO",
        "SEM EXECUCAO",
        "SEM EXECUÇÃO",
        // Cliente inacessível na tentativa original — o técnico não
        // conseguiu prestar o serviço, só depois o cliente reapareceu
        // (ver conversa/exemplo real: OS finalizada como "várias
        // tentativas de contato e visita sem sucesso", reaberta horas
        // depois como "cliente retornou contato").
        "TENTATIVA DE CONTATO",
        "TENTATIVAS DE CONTATO",
        "SEM SUCESSO",
        "RETORNOU CONTATO",
        "RETORNOU O CONTATO",
        "CLIENTE RETORNOU",
        "AGUARDANDO RETORNO",
        "CLIENTE ENTROU EM CONTATO"
    ]
    // Novas expressões entram direto nas listas acima — sem código novo.
};

window.MOTIVOS_REABERTURA = MOTIVOS_REABERTURA;
