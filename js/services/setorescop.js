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
    ConfigRemota.sincronizar(SETORES_COP_CHAVE_STORAGE, setores);
}

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
    ConfigRemota.sincronizar(ASSUNTOS_COP_CHAVE_STORAGE, assuntos);
}
