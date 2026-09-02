/**
 * ==========================================================
 * Regras de Auditoria Operacional — Diagnóstico x Próxima Tarefa
 * ==========================================================
 * Ponto único de ajuste pras regras da Auditoria Operacional (ver
 * js/engine/auditoriaoperacionalengine.js) — só dados aqui, nenhuma
 * lógica. Pra adicionar uma regra nova não precisa mexer no Engine.
 *
 * REGRA PADRÃO (não precisa de entrada aqui — já embutida no Engine):
 * todo diagnóstico terminado em "CONCLUÍDA" espera a Próxima Tarefa
 * IGUAL ao próprio diagnóstico (comparação sem acento/maiúscula) —
 * ex.: "INSTALAÇÃO CONCLUÍDA" → Próxima Tarefa esperada
 * "INSTALAÇÃO CONCLUÍDA". Só cadastre um diagnóstico aqui quando o
 * próximo passo esperado for DIFERENTE do próprio texto do
 * diagnóstico (uma EXCEÇÃO à regra padrão).
 *
 * Cada entrada:
 * - id: identificador curto, único, usado internamente (não aparece pro usuário).
 * - diagnostico: texto exato do diagnóstico que essa regra cobre
 *   (comparado sem diferenciar acento/maiúscula — ver normalizarTexto).
 * - proximaTarefaEsperada: lista de textos aceitos como Próxima
 *   Tarefa (normalmente só 1 — é lista pra já deixar aberto o caso de
 *   mais de um próximo passo válido pro mesmo diagnóstico).
 * - severidade: "erro" (por enquanto é a única usada na Auditoria).
 * - mensagem: texto mostrado no achado quando a regra é violada.
 */
const REGRAS_AUDITORIA_DIAGNOSTICO = [
    {
        id: "troca-equipamento",
        diagnostico: "TROCA DE EQUIPAMENTO",
        // Dois caminhos válidos conferidos nos dados reais: troca comum
        // (maioria) e troca junto de upgrade de plano.
        proximaTarefaEsperada: ["EQUIPAMENTO TROCADO - IR PARA CONFERÊNCIA", "TROCA DE EQUIPAMENTO - ATUALIZAÇÃO DE PLANO"],
        severidade: "erro",
        mensagem: "Diagnóstico indica troca de equipamento — a Próxima Tarefa deveria abrir a conferência de estoque (ou, se houve upgrade de plano junto, seguir esse fluxo)."
    },
    {
        id: "equipamento-recolhido-terceirizado",
        diagnostico: "EQUIPAMENTO RECOLHIDO (TERCEIRIZADO)",
        proximaTarefaEsperada: ["CONFERÊNCIA DE EQUIPAMENTOS", "RECOLHIDO - CONFERÊNCIA DE EQUIPAMENTOS"],
        severidade: "erro",
        mensagem: "Diagnóstico indica equipamento recolhido por terceirizado — a Próxima Tarefa deveria abrir a conferência de estoque."
    },
    {
        id: "equipamento-recolhido-equipe-interna",
        // Sem o "(8)" do fim — o sufixo com o ID do diagnóstico já é
        // removido antes de comparar, ver removerSufixoIdDiagnostico.
        diagnostico: "EQUIPAMENTO RECOLHIDO - EQUIPE INTERNA",
        proximaTarefaEsperada: ["CONFERÊNCIA DE EQUIPAMENTOS", "RECOLHIDO - CONFERÊNCIA DE EQUIPAMENTOS"],
        severidade: "erro",
        mensagem: "Diagnóstico indica equipamento recolhido pela equipe interna — a Próxima Tarefa deveria abrir a conferência de estoque."
    },
    // "Mudança de Tecnologia" tem convenção PRÓPRIA, diferente da regra
    // padrão (que espera a Próxima Tarefa igual ao diagnóstico
    // inteiro): aqui o esperado é só a palavra curta "CONCLUÍDA" (ou
    // "NÃO CONCLUÍDA") — confirmado nos dados reais (26/40 e 9/10 dos
    // casos, respectivamente). Por isso essas duas entradas específicas
    // sobrescrevem a regra genérica só pra esses dois diagnósticos.
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
    }
    // Novas exceções entram aqui. Ex.:
    // {
    //     id: "outro-diagnostico",
    //     diagnostico: "TEXTO EXATO DO DIAGNÓSTICO (sem o sufixo de ID, se houver)",
    //     proximaTarefaEsperada: ["TEXTO EXATO DA PRÓXIMA TAREFA"],
    //     severidade: "erro",
    //     mensagem: "Explicação mostrada no achado."
    // }
];

window.REGRAS_AUDITORIA_DIAGNOSTICO = REGRAS_AUDITORIA_DIAGNOSTICO;
