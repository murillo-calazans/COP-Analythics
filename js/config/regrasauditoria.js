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
 * Cada entrada usa UM dos dois pares abaixo pro lado do diagnóstico (nunca
 * os dois juntos) e UM dos dois pares abaixo pro lado da Próxima Tarefa:
 * - diagnostico (texto EXATO, sem diferenciar acento/maiúscula) OU
 *   diagnosticoContemAlgum (lista de palavras/trechos — a regra vale se o
 *   diagnóstico CONTIVER qualquer uma delas). Use "ContemAlgum" quando o
 *   texto varia bastante nos dados reais (plural, "trocado" vs "troca",
 *   sufixo "(terceirizado)"/"- equipe interna" etc.) e o que importa é só
 *   a ideia central, não a grafia exata.
 * - proximaTarefaEsperada (lista de textos EXATOS aceitos) OU
 *   proximaTarefaContemAlgum (lista de palavras/trechos — a Próxima
 *   Tarefa é aceita se CONTIVER qualquer uma delas). Mesma lógica: use
 *   "ContemAlgum" quando não faz sentido travar num texto único.
 *
 * Demais campos:
 * - id: identificador curto, único, usado internamente (não aparece pro usuário).
 * - severidade: "erro" (por enquanto é a única usada na Auditoria).
 * - mensagem: texto mostrado no achado quando a regra é violada.
 */
const REGRAS_AUDITORIA_DIAGNOSTICO = [
    {
        id: "equipamento-troca-ou-recolhimento",
        // Cobre qualquer variação que fale em troca ou recolhimento de
        // equipamento — ex.: "TROCA DE EQUIPAMENTO", "EQUIPAMENTO
        // TROCADO", "EQUIPAMENTO RECOLHIDO (TERCEIRIZADO)", "EQUIPAMENTO
        // RECOLHIDO - EQUIPE INTERNA". Antes eram 3 regras de texto EXATO
        // (troca-equipamento/equipamento-recolhido-terceirizado/
        // equipamento-recolhido-equipe-interna) — trocadas por esta única
        // regra "contém" porque o nome do diagnóstico varia demais nos
        // dados reais pra travar numa lista fechada de textos.
        // "TROCA DE EQUIPAMENTO" já casa com o plural "...EQUIPAMENTOS"
        // (é um prefixo dele), mas "EQUIPAMENTO TROCADO"/"EQUIPAMENTO
        // RECOLHIDO" não casam com "EQUIPAMENTOS TROCADOS"/"EQUIPAMENTOS
        // RECOLHIDOS" (o "S" de EQUIPAMENTOS quebra o "includes") — por
        // isso as variantes no plural entram explícitas também.
        diagnosticoContemAlgum: [
            "TROCA DE EQUIPAMENTO", "EQUIPAMENTO TROCADO", "EQUIPAMENTOS TROCADOS",
            "EQUIPAMENTO RECOLHIDO", "EQUIPAMENTOS RECOLHIDOS"
        ],
        // Mesma ideia do lado da Próxima Tarefa: aceita qualquer uma que
        // mencione recolhimento ou troca de equipamento, sem exigir o
        // texto inteiro batendo (ex.: "RECOLHIDO - CONFERÊNCIA DE
        // EQUIPAMENTOS", "EQUIPAMENTO TROCADO - IR PARA CONFERÊNCIA",
        // "TROCA DE EQUIPAMENTO - ATUALIZAÇÃO DE PLANO" — todas batem).
        // "CONFERÊNCIA DE EQUIPAMENTOS" sozinho (sem "recolhido"/"troca")
        // também entra — era o 2º caminho válido já conferido nos dados
        // reais pras regras antigas de equipamento recolhido; sem essa
        // entrada, todo fechamento que usa só esse texto passaria a
        // virar erro por engano.
        proximaTarefaContemAlgum: [
            "RECOLHIDO", "RECOLHIDOS", "TROCA DE EQUIPAMENTO", "EQUIPAMENTO TROCADO",
            "EQUIPAMENTOS TROCADOS", "CONFERÊNCIA DE EQUIPAMENTOS"
        ],
        severidade: "erro",
        mensagem: "Diagnóstico indica troca ou recolhimento de equipamento — a Próxima Tarefa deveria mencionar troca ou recolhimento de equipamento (ex.: abrir a conferência de estoque)."
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
