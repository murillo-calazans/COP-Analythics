/**
 * ==========================================================
 * Mapeamento de Colunas das Planilhas
 * ==========================================================
 * Ponto único de ajuste: se os cabeçalhos das planilhas
 * mudarem, corrija apenas aqui — nenhum Engine deve conhecer
 * o nome literal de uma coluna.
 *
 * A comparação ignora maiúsculas/minúsculas e acentuação
 * (ver js/utils/texto.js), então "Descrição" já casa com
 * "DESCRICAO", "descrição" etc. — não precisa ficar 100%
 * idêntico ao cabeçalho da planilha, só com o mesmo sentido.
 */

// Base.xlsx (abas: Operadores, Eventos, Diagnósticos)
const CONFIG_BASE = {
    operadores: {
        chave: "ID",
        nome: "NOME",
        setor: "SETOR"          // <- AJUSTAR se o cabeçalho real vier diferente — ex.: "Controle de Operações", "Técnico"
    },
    eventos: {
        chave: "ID",
        nome: "DESCRIAAO"      // sic — cabeçalho real da planilha, não é erro de digitação nosso
    },
    diagnosticos: {
        chave: "ID DIAGNASTICO DETALHADO", // sic — cabeçalho real da planilha
        nome: "DESCRIAAO"      // sic — cabeçalho real da planilha
    },
    // Aba própria (ex.: "Coloborador Responsável", com esse erro de
    // digitação mesmo — ver ReferenceEngine.carregar, que casa pelo
    // trecho "RESPONS" pra não depender de acertar a grafia exata).
    // Cadastro SEPARADO do de Operadores — o mesmo número de ID pode
    // ser pessoas diferentes nas duas abas, não dá pra resolver um
    // Colaborador Responsável pela aba de Operadores. Sem coluna de
    // SETOR (por isso setor/RLS continuam vindo do Operador, nunca do
    // Colaborador Responsável — ver IndicatorEngine.agregarPorSetor).
    colaboradoresResponsaveis: {
        chave: "ID",
        nome: "NOME"
    }
};

// Ordens.xlsx (movimentações das Ordens de Serviço)
const CONFIG_ORDENS = {
    id: "ID OS",
    cliente: "CLIENTE",                // <- AJUSTAR se o cabeçalho real vier diferente
    login: "LOGIN",                    // <- AJUSTAR se o cabeçalho real vier diferente — chave de recorrência
    cidade: "CIDADE",
    bairro: "BAIRRO",
    assunto: "ASSUNTO",
    operador: "ID OPERADOR",           // quem executou a movimentação (deslocamento, execução, agendamento, reagendamento...) — no Fechamento nem sempre é quem foi a campo, ver colaboradorResponsavel
    colaboradorResponsavel: "COLABORADOR RESPONSAVEL", // <- AJUSTAR se o cabeçalho real vier diferente — quem de fato atendeu/fechou a OS (ID, resolvido pela aba PRÓPRIA "Coloborador Responsável" da Base.xlsx, NÃO a de Operadores — ver CONFIG_BASE.colaboradoresResponsaveis); só usado no Fechamento
    equipe: "EQUIPE",                  // <- AJUSTAR se o cabeçalho real vier diferente — quem trabalhou junto no fechamento
    evento: "EVENTO",
    diagnostico: "DIAGNOSTICO",        // <- CONFIRMAR: cabeçalho corrigido (era "DIAGNASTICO" — sic) conforme export real mais recente conferido; hoje já vem como NOME/descrição (não mais ID), ver CONFIG_BASE.diagnosticos
    proximaTarefa: "PRAXIMA TAREFA",   // sic — cabeçalho real da planilha — processo a seguir após a OS finalizar; só relevante no Fechamento (ver AuditoriaOperacionalEngine)
    status: "STATUS",
    respostaPadrao: "RESPOSTA PADRAO",
    mensagem: "MENSAGEM",
    historico: "HISTARICO",            // sic — cabeçalho real da planilha
    data: "DATA"                       // data/hora do evento (a Ordem também tem "DATA/HORA ABERTURA", não usada aqui)
};

// Expostos em window para a tela de Configurações conseguir ler/gravar
// esses valores dinamicamente por caminho de string (ex.: "CONFIG_ORDENS.id").
// "const" no topo de um script comum NÃO vira propriedade de window sozinho.
window.CONFIG_BASE = CONFIG_BASE;
window.CONFIG_ORDENS = CONFIG_ORDENS;
