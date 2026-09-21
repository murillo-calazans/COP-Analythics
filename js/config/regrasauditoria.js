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
        // "EQUIPAMENTO DEVOLVIDO EM LOJA" entra aqui também — cliente
        // devolveu na loja em vez do técnico recolher em campo, mas o
        // próximo passo é o mesmo (conferência de estoque): 95% dos
        // casos reais fecham com "EQUIPAMENTO RECOLHIDO - IR PARA
        // CONFERÊNCIA".
        diagnosticoContemAlgum: [
            "TROCA DE EQUIPAMENTO", "EQUIPAMENTO TROCADO", "EQUIPAMENTOS TROCADOS",
            "EQUIPAMENTO RECOLHIDO", "EQUIPAMENTOS RECOLHIDOS", "EQUIPAMENTO DEVOLVIDO"
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
        //
        // "GERAR BOLETO" é um 3º caminho válido, DIFERENTE dos de cima:
        // não é troca/recolhimento de equipamento com defeito, é
        // ADIÇÃO de equipamento novo em comodato (ex.: OS 1901247 —
        // assunto "ADICIONAR REPETIDOR - COMODATO", diagnóstico "TROCA
        // DE EQUIPAMENTO" só porque é a categoria genérica usada pra
        // qualquer alteração de equipamento; a Próxima Tarefa correta
        // aqui é faturar o comodato novo, não mandar pra conferência de
        // estoque). Confirmado com o usuário que isso não é erro.
        proximaTarefaContemAlgum: [
            "RECOLHIDO", "RECOLHIDOS", "TROCA DE EQUIPAMENTO", "EQUIPAMENTO TROCADO",
            "EQUIPAMENTOS TROCADOS", "CONFERÊNCIA DE EQUIPAMENTOS", "GERAR BOLETO"
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
    },
    /**
     * Famílias abaixo levantadas cruzando os diagnósticos com ~47 mil
     * fechamentos reais (Downloads/ORDENS_REABERTAS...) — cada uma
     * cobre vários diagnósticos que já mostraram o MESMO padrão de
     * Próxima Tarefa esperada nos dados, confirmado com o usuário.
     */
    // Família "reparo de campo concluído" — diagnóstico descreve um
    // problema técnico resolvido na visita (não troca/recolhimento de
    // equipamento, não instalação nova) — o esperado é só o
    // fechamento padrão de pós-atendimento, não um texto específico.
    {
        id: "reparo-campo-concluido",
        diagnosticoContemAlgum: [
            "CABEAMENTO REMANEJADO", "CABO NA PORTA ERRADA", "CLIENTE AUSENTE",
            "CONECTOR CTO", "CONFIGURAÇÃO DE ROTEADOR JUNTO A ONU",
            "EQUIPAMENTO DESLIGADO", "EQUIPAMENTO PESSOAL / IPTV", "FIBRA ATENUADA",
            "PROBLEMAS NO EQUIPAMENTO DO CLIENTE",
            "PROBLEMAS RELACIONADOS A CONEXÃO - RESOLVIDO",
            "RECONFIGURAÇÃO DE ROTEADOR", "ROMPIMENTO DE FIBRA", "TROCA DE CONECTOR"
        ],
        // "MANUTENÇÃO CONCLUIDA - NÃO FOI TROCADO EQUIPAMENTO" é um
        // caminho válido À PARTE (149 casos reais) — resolveu o
        // problema sem precisar trocar equipamento, só com texto
        // diferente do fechamento padrão de pós-atendimento.
        proximaTarefaContemAlgum: [
            "POS ATENDIMENTO", "PÓS ATENDIMENTO", "PESQUISA DE SATISFAÇÃO", "A.O.M",
            "MANUTENÇÃO CONCLUIDA - NÃO FOI TROCADO EQUIPAMENTO"
        ],
        severidade: "erro",
        mensagem: "Diagnóstico indica reparo de campo concluído — a Próxima Tarefa deveria ser o fechamento padrão de pós-atendimento (ex.: \"POS ATENDIMENTO\")."
    },
    // Família "instalação/viabilidade não concluída" — cliente desistiu,
    // ou a instalação/transferência não pôde ser concluída por
    // inviabilidade técnica.
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
    // Família "equipamento não devolvido" — cliente não devolveu (ou se
    // negou a devolver) o equipamento — vira cobrança, não conferência
    // de estoque (esse é o caminho de EQUIPAMENTO RECOLHIDO, regra
    // "equipamento-troca-ou-recolhimento" acima).
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
    // Troca de comodato — o caminho MAIS comum é faturar o comodato
    // novo, mas às vezes a troca envolve devolver/trocar o equipamento
    // físico de verdade, não só cobrar (ex.: OS 1826293 — assunto
    // "RETIRADA DE EQUIPAMENTOS", fechada com "EQUIPAMENTO RECOLHIDO -
    // IR PARA CONFERÊNCIA" — confirmado com o usuário que não é erro;
    // batia com o 2º padrão mais comum nos dados reais, 15 dos 170
    // casos). Mesmos caminhos aceitos da família de equipamento acima.
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
    // Novas exceções entram aqui. Ex.:
    // {
    //     id: "outro-diagnostico",
    //     diagnostico: "TEXTO EXATO DO DIAGNÓSTICO (sem o sufixo de ID, se houver)",
    //     proximaTarefaEsperada: ["TEXTO EXATO DA PRÓXIMA TAREFA"],
    //     severidade: "erro",
    //     mensagem: "Explicação mostrada no achado."
    // }
];

/**
 * Diagnósticos que NUNCA esperam Próxima Tarefa — não entram na
 * Auditoria de jeito nenhum (nem regra específica acima, nem a regra
 * genérica de "CONCLUÍDA", que sem essa lista pegaria "EXPANSÃO
 * CONCLUÍDA" por engano). Dois grupos:
 *
 * - "Ordens de estrutura" (conceito do usuário): ordens INTERNAS pra
 *   corrigir um problema da rede/infraestrutura (CTO, switch...), não
 *   do cliente — não levam nome de cliente, só o diagnóstico já basta,
 *   não faz sentido cobrar Próxima Tarefa.
 * - Diagnósticos confirmados nos dados reais como "a Próxima Tarefa
 *   sempre vem vazia e está certo assim" (ex.: EXPANSÃO CONCLUÍDA — só
 *   7 casos, mas os 7 sem Próxima Tarefa nenhuma).
 * - Diagnósticos HETEROGÊNEOS demais pra ter UM próximo passo esperado
 *   (ex.: ORDEM CANCELADA PELO CLIENTE — o cancelamento pode acontecer
 *   no meio de qualquer tipo de visita — retirada de equipamento,
 *   instalação, comodato, transferência — cada uma com um fechamento
 *   válido diferente; ver OS 1549361, cancelamento durante retirada de
 *   equipamento, fechada certinho com "FATURAR EQUIPAMENTO NÃO
 *   DEVOLVIDO", que a regra de "reparo de campo" não previa).
 */
const DIAGNOSTICOS_SEM_PROXIMA_TAREFA_ESPERADA = [
    "CTO SEM POTÊNCIA",           // ordem de estrutura
    "CTO SEM VAGA",                // ordem de estrutura
    "EXPANSÃO CONCLUÍDA",          // confirmado nos dados: Próxima Tarefa sempre vazia
    "ORDEM CANCELADA PELO CLIENTE" // próximo passo varia demais conforme o tipo de visita cancelada
];

/**
 * Assuntos de "ordem de estrutura" — o problema é da REDE/infraestrutura
 * (CTO, cabeamento, rota de fibra alarmada...), não do cliente. Diferente
 * de DIAGNOSTICOS_SEM_PROXIMA_TAREFA_ESPERADA acima (que exclui pelo
 * DIAGNÓSTICO do fechamento), aqui a exclusão é pelo ASSUNTO da OS —
 * porque o diagnóstico usado nessas ordens pode ser QUALQUER diagnóstico
 * de reparo normal (ex.: "ÁREA DE MANUTENÇÃO - ROTA ALARMADA" fecha na
 * maioria das vezes com "ROMPIMENTO DE FIBRA"/"FIBRA ATENUADA" — os
 * MESMOS diagnósticos que, numa OS de cliente comum, exigem Próxima
 * Tarefa preenchida pela regra "reparo-campo-concluido" acima). Sem
 * essa exclusão por assunto, toda ordem de estrutura com esses
 * diagnósticos virava erro de "Próxima Tarefa ausente" por engano —
 * confirmado nos dados reais: Próxima Tarefa vem 100% vazia nos 6
 * assuntos abaixo (492 casos de ROTA ALARMADA, 68 de AJUSTE DE
 * POTÊNCIA DA CTO etc.), e está certo assim.
 *
 * "EXCLUSÃO DE ACESSO E EQUIPAMENTOS" é ainda mais radical: nem
 * diagnóstico nem Próxima Tarefa — o processo termina ali (confirmado:
 * 3.274 de 3.300 fechamentos reais sem diagnóstico nenhum).
 *
 * Checada ANTES de tudo em AuditoriaOperacionalEngine.auditar() — a OS
 * nem chega a passar por auditarFechamento.
 */
const ASSUNTOS_ORDEM_ESTRUTURA = [
    "CONSTRUÇÃO DE REDE", // cobre também "CONSTRUÇÃO DE REDE FTTH" (contém)
    "MELHORIA DE REDE",
    "ÁREA DE MANUTENÇÃO - ROTA ALARMADA",
    "AJUSTE DE POTÊNCIA DA CTO",
    "ÁREA DE MANUTENÇÃO - PREVENTIVA",
    "EXCLUSÃO DE ACESSO E EQUIPAMENTOS"
];

window.REGRAS_AUDITORIA_DIAGNOSTICO = REGRAS_AUDITORIA_DIAGNOSTICO;
window.DIAGNOSTICOS_SEM_PROXIMA_TAREFA_ESPERADA = DIAGNOSTICOS_SEM_PROXIMA_TAREFA_ESPERADA;
window.ASSUNTOS_ORDEM_ESTRUTURA = ASSUNTOS_ORDEM_ESTRUTURA;
