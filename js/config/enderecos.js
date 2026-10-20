/**
 * ==========================================================
 * Configuração — Endereços a corrigir (Gestão de Clientes)
 * ==========================================================
 * Regras do EnderecoEngine (js/engine/enderecoengine.js), que compara a
 * coordenada da OS no IXC (ordens.lat/lng, patch-30) com a cidade
 * cadastrada. Edite aqui, não no engine.
 *
 * Calibrado com ~18 mil OS com GPS (ago–out/2026): em todas as cidades
 * atendidas, 99% das OS ficam a menos de ~27 km do centro da própria
 * cidade (Cachoeiras de Macacu, a maior, chega a 26 km) — acima de 30 km
 * já é outra cidade.
 */
const CONFIG_ENDERECOS = {

    // OS a mais que isso do centro da cidade cadastrada é suspeita...
    limiteKm: 30,

    // ...desde que o centro de OUTRA cidade esteja pelo menos isso mais
    // perto (senão é só um ponto afastado da própria cidade, sem cidade
    // melhor pra sugerir).
    margemKm: 15,

    // Centro de cidade calculado pela mediana das próprias OS só quando a
    // cidade tem pelo menos isso de OS com GPS (amostra pequena engana).
    minimoOSCentro: 15,

    // Centro fixo (lat, lng) — vale ANTES da mediana. Obrigatório pra
    // cidade cujo cadastro costuma estar errado (a mediana sairia do
    // próprio erro: ex.: as sirenes da GRIDLAB cadastradas no Rio de
    // Janeiro ficam todas na Serra, e a mediana delas "moveria" o Rio pra lá).
    centrosFixos: {
        "rio de janeiro": [-22.9068, -43.1729],
        "petropolis": [-22.5050, -43.1787],
        "teresopolis": [-22.4165, -42.9752],
        "itaborai": [-22.7444, -42.8597],
        "casimiro de abreu": [-22.4806, -42.2042],
        "guaratingueta": [-22.8164, -45.1925],
        "queluz": [-22.5372, -44.7744],
        "lavrinhas": [-22.5700, -44.9025],
        "macae": [-22.3708, -41.7869],
        "marica": [-22.9194, -42.8186],
        "niteroi": [-22.8832, -43.1034],
        "sao goncalo": [-22.8268, -43.0634]
    },

    // Cidades em que TODA OS vira alerta, mesmo sem GPS — fora da área de
    // atendimento: normalmente é o endereço da SEDE do cliente, não do
    // local atendido (ex.: GRIDLAB, sede na Penha, sirenes na Serra).
    cidadesSempreAlerta: ["Rio de Janeiro"],

    // Ponto de GPS (arredondado a ~10 m) que aparece em OS de pelo menos
    // tantos logins DIFERENTES não é a casa de ninguém: é base/escritório
    // de onde a OS foi registrada (ex.: um ponto em Cachoeiras de Macacu
    // com 86 OS de clientes de Rio das Ostras e Guapimirim). Ignorado.
    minimoLoginsPontoRepetido: 5,

    // Coordenada válida = dentro desta caixa (RJ + Vale do Paraíba). Fora
    // disso é GPS zerado/lixo, não endereço errado.
    caixaValida: { latMin: -24.5, latMax: -20.5, lngMin: -46.5, lngMax: -40.5 }
};

window.CONFIG_ENDERECOS = CONFIG_ENDERECOS;
