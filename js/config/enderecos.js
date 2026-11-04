const CONFIG_ENDERECOS = {

    limiteKm: 30,

    margemKm: 15,

    minimoOSCentro: 15,

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

    cidadesSempreAlerta: ["Rio de Janeiro"],

    minimoLoginsPontoRepetido: 5,

    caixaValida: { latMin: -24.5, latMax: -20.5, lngMin: -46.5, lngMax: -40.5 }
};

window.CONFIG_ENDERECOS = CONFIG_ENDERECOS;
