/**
 * ==========================================================
 * Assuntos Equivalentes — normalização de categoria
 * ==========================================================
 * Alguns assuntos são a MESMA categoria de trabalho, só que marcada
 * como feita por equipe terceirizada em vez de própria (ex.:
 * "Instalação Novo Cliente" x "Instalação Novo Cliente -
 * Terceirizado") — isso fragmenta contagens/rankings por assunto em
 * duas categorias que deveriam ser uma só. Essa tabela diz, pra cada
 * assunto bruto (comparado sem acento/maiúscula — ver
 * js/utils/texto.js), qual o assunto CANÔNICO que ele deve virar —
 * ver AssuntoEngine.normalizarAssuntos.
 *
 * Pra adicionar um novo mapeamento, só acrescentar um objeto aqui,
 * sem mexer no Engine.
 */
const ASSUNTOS_EQUIVALENTES = [
    { de: "INSTALAÇÃO NOVO CLIENTE - TERCEIRIZADO (70)", para: "INSTALAÇÃO NOVO CLIENTE (70)" },
    { de: "TRANSFERÊNCIA DE ENDEREÇO - TERCEIRIZADA (150)", para: "TRANSFERÊNCIA DE ENDEREÇO (150)" },
    { de: "REPARO PÓS INSTALAÇÃO TERCEIRIZADA - ATÉ 15 DIAS", para: "GARANTIA TERCEIRIZADA" }
    // Novos mapeamentos entram aqui. Ex.:
    // { de: "TEXTO EXATO DO ASSUNTO DE ORIGEM", para: "TEXTO EXATO DO ASSUNTO CANÔNICO" }
];

window.ASSUNTOS_EQUIVALENTES = ASSUNTOS_EQUIVALENTES;
