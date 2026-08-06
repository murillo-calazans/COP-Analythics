/**
 * ==========================================================
 * UI de Configurações (mapeamento de colunas)
 * ==========================================================
 */

function preencherFormularioConfig() {
    document.querySelectorAll("#formConfiguracoes [data-config]").forEach(input => {
        input.value = obterValorConfigPorCaminho(input.dataset.config) ?? "";
    });
}

function registrarFormularioConfig() {
    const form = document.getElementById("formConfiguracoes");
    const botaoRestaurar = document.getElementById("btnRestaurarConfig");

    if (form) {
        form.addEventListener("submit", evento => {
            evento.preventDefault();

            document.querySelectorAll("#formConfiguracoes [data-config]").forEach(input => {
                definirValorConfigPorCaminho(input.dataset.config, input.value);
            });

            salvarConfigColunas();
            alert("Configuração de colunas salva. Ela será usada na próxima importação.");
        });
    }

    if (botaoRestaurar) {
        botaoRestaurar.addEventListener("click", () => {
            restaurarConfigColunasPadrao();
            location.reload();
        });
    }
}

function obterValorConfigPorCaminho(caminho) {
    return caminho.split(".").reduce((obj, chave) => obj?.[chave], window);
}

function definirValorConfigPorCaminho(caminho, valor) {
    const partes = caminho.split(".");
    const ultima = partes.pop();
    const alvo = partes.reduce((obj, chave) => obj?.[chave], window);
    if (alvo) alvo[ultima] = valor;
}
