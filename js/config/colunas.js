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
    operador: "ID OPERADOR",
    equipe: "EQUIPE",                  // <- AJUSTAR se o cabeçalho real vier diferente — quem trabalhou junto no fechamento
    evento: "EVENTO",
    diagnostico: "DIAGNASTICO",        // sic — cabeçalho real da planilha
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
