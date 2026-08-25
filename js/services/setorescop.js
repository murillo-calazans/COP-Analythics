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
