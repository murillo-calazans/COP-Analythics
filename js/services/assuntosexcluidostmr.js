/**
 * ==========================================================
 * Serviço de Configuração — Assuntos Excluídos do TMR
 * ==========================================================
 * Persiste, no localStorage, quais assuntos (ex.: "Retirada de
 * Equipamentos", "Mudança de Tecnologia") NÃO devem contar no TMR —
 * são tarefas administrativas/logísticas, sem urgência de resposta
 * a cliente, então demoram semanas pra agendar naturalmente; misturar
 * isso com assuntos de atendimento (ex.: "Sem Conexão") distorce a
 * média pra cima e some parecer que o atendimento está lento.
 * Lista negra: por padrão nada está excluído, tudo conta normalmente
 * até alguém marcar manualmente. Fica configurável porque o texto
 * exato do assunto varia — não dá pra fixar no código com segurança.
 *
 * Os valores são guardados normalizados (ver js/utils/texto.js)
 * pra não depender de acento/caixa na hora de comparar.
 */

const ASSUNTOS_EXCLUIDOS_TMR_CHAVE_STORAGE = "cop_analytics_assuntos_excluidos_tmr";

function carregarAssuntosExcluidosTMR() {
    const bruta = localStorage.getItem(ASSUNTOS_EXCLUIDOS_TMR_CHAVE_STORAGE);
    if (!bruta) return new Set();

    try {
        return new Set(JSON.parse(bruta));
    } catch (erro) {
        console.error("Falha ao carregar assuntos excluídos do TMR:", erro);
        return new Set();
    }
}

function salvarAssuntosExcluidosTMR(assuntosExcluidos) {
    localStorage.setItem(
        ASSUNTOS_EXCLUIDOS_TMR_CHAVE_STORAGE,
        JSON.stringify([...assuntosExcluidos])
    );
}
