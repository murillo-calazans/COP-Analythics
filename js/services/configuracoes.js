/**
 * ==========================================================
 * Serviço de Configurações (mapeamento de colunas)
 * ==========================================================
 * Permite sobrescrever CONFIG_BASE/CONFIG_ORDENS (definidos em
 * js/config/colunas.js) sem editar código, guardando os ajustes
 * no localStorage do navegador. Existe porque o cabeçalho das
 * planilhas exportadas pelo sistema de origem já mudou várias
 * vezes — sem isso, cada mudança exige um ajuste manual no código.
 */

const CONFIGURACOES_CHAVE_STORAGE = "cop_analytics_config_colunas";

function mesclarConfigProfundo(alvo, origem) {
    for (const chave of Object.keys(origem)) {
        const valor = origem[chave];
        if (valor && typeof valor === "object" && !Array.isArray(valor)) {
            mesclarConfigProfundo(alvo[chave], valor);
        } else {
            alvo[chave] = valor;
        }
    }
}

function carregarConfigColunasSalva() {
    const bruta = localStorage.getItem(CONFIGURACOES_CHAVE_STORAGE);
    if (!bruta) return;

    try {
        const salvo = JSON.parse(bruta);
        if (salvo.CONFIG_BASE) mesclarConfigProfundo(CONFIG_BASE, salvo.CONFIG_BASE);
        if (salvo.CONFIG_ORDENS) mesclarConfigProfundo(CONFIG_ORDENS, salvo.CONFIG_ORDENS);
        console.log("Configuração de colunas personalizada carregada do localStorage.");
    } catch (erro) {
        console.error("Falha ao carregar configuração de colunas salva:", erro);
    }
}

function salvarConfigColunas() {
    localStorage.setItem(
        CONFIGURACOES_CHAVE_STORAGE,
        JSON.stringify({ CONFIG_BASE, CONFIG_ORDENS })
    );
}

function restaurarConfigColunasPadrao() {
    localStorage.removeItem(CONFIGURACOES_CHAVE_STORAGE);
}
