/**
 * ==========================================================
 * Serviço de Configuração — Setor do COP
 * ==========================================================
 * Persiste, no localStorage, qual(is) setor(es) da Base.xlsx contam
 * como "Controle de Operações" pros TMRs de agendamento/reagendamento
 * por colaborador (ver IndicatorEngine.operadorEhDoCop). Fica
 * configurável porque setor é texto livre — em dados reais já
 * apareceram tanto "Controle de Operações" quanto "COP - B2B" como
 * setores distintos, não dá pra fixar um só no código com segurança.
 */

const SETORES_COP_CHAVE_STORAGE = "cop_analytics_setores_cop";

function carregarSetoresCop() {
    const bruta = localStorage.getItem(SETORES_COP_CHAVE_STORAGE);
    if (!bruta) return [];

    try {
        const salvo = JSON.parse(bruta);
        return Array.isArray(salvo) ? salvo : [];
    } catch (erro) {
        console.error("Falha ao carregar configuração de setor do COP:", erro);
        return [];
    }
}

function salvarSetoresCop(setores) {
    localStorage.setItem(SETORES_COP_CHAVE_STORAGE, JSON.stringify(setores));
}

/**
 * Assuntos que pertencem ao COP (setor 52 no IXC). Como o pré-agendamento
 * não exporta o setor, só o assunto, identificamos a OS do COP pelo assunto —
 * e no IXC cada assunto pertence a um único setor, então a lista é estável.
 * Vem um default no código (funciona pra todos sem configurar); o usuário pode
 * sobrescrever pelo site, e aí fica no localStorage. Ver assuntoEhDoCop().
 */
const ASSUNTOS_COP_CHAVE_STORAGE = "cop_analytics_assuntos_cop";

const ASSUNTOS_COP_PADRAO = [
    "AUDITORIA INSTALAÇÃO/TRANSFERÊNCIA",
    "AUDITORIA MANUTENÇÃO",
    "EXCLUSÃO DE ACESSO E EQUIPAMENTOS",
    "CLIENTE INDISPONÍVEL",
    "MANUTENÇÃO - CHIP",
    "CONFIGURAÇÃO TELEFONIA VOIP - SUPORTE",
    "TROCA DE PACOTE - CHIP",
    "CONFIGURAR CONEXÃO - TROCA DE TITULARIDADE",
    "VERIFICAR TROCA DE PLANO - ATUALIZAÇÃO",
    "NOVA TENTATIVA DE INSTALAÇÃO",
    "REMOÇÃO DE CHIP",
    "CONFIGURAÇÃO DE ESIM",
    "REMOÇÃO TELEFONIA VOIP"
];

function carregarAssuntosCop() {
    const bruta = localStorage.getItem(ASSUNTOS_COP_CHAVE_STORAGE);
    if (!bruta) return ASSUNTOS_COP_PADRAO.slice();
    try {
        const salvo = JSON.parse(bruta);
        return Array.isArray(salvo) && salvo.length ? salvo : ASSUNTOS_COP_PADRAO.slice();
    } catch (erro) {
        console.error("Falha ao carregar assuntos do COP:", erro);
        return ASSUNTOS_COP_PADRAO.slice();
    }
}

function salvarAssuntosCop(assuntos) {
    localStorage.setItem(ASSUNTOS_COP_CHAVE_STORAGE, JSON.stringify(assuntos));
}
