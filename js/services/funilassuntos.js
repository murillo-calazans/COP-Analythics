/**
 * ==========================================================
 * Serviço de Configuração — Funil de Assuntos
 * ==========================================================
 * Persiste, no localStorage, quais assuntos contam como "origem"
 * e "destino" pro indicador de funil (ex.: Instalação Novo
 * Cliente/Transferência de Endereço → Verificar Conexão/Sem
 * Conexão LOS). Fica configurável porque o texto exato do
 * assunto varia — não dá pra fixar no código com segurança.
 */

const FUNIL_ASSUNTOS_CHAVE_STORAGE = "cop_analytics_funil_assuntos";

function carregarFunilAssuntos() {
    const bruta = localStorage.getItem(FUNIL_ASSUNTOS_CHAVE_STORAGE);
    if (!bruta) return { origem: [], destino: [] };

    try {
        const salvo = JSON.parse(bruta);
        return {
            origem: Array.isArray(salvo.origem) ? salvo.origem : [],
            destino: Array.isArray(salvo.destino) ? salvo.destino : []
        };
    } catch (erro) {
        console.error("Falha ao carregar configuração do funil de assuntos:", erro);
        return { origem: [], destino: [] };
    }
}

function salvarFunilAssuntos(configuracao) {
    localStorage.setItem(FUNIL_ASSUNTOS_CHAVE_STORAGE, JSON.stringify(configuracao));
}
