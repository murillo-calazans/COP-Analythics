(function (global) {
    "use strict";

    const MAPA_PADRAO = [
        "Cachoeiras de Macacu = Cachoeiras de Macacu; Japuíba; Papucaia",
        "Itaboraí = Cachoeiras de Macacu; Japuíba; Papucaia",
        "Magé = Guapimirim",
        "Cruzeiro = São Paulo",
        "Guaratinguetá = São Paulo",
        "Lavrinhas = São Paulo",
        "Queluz = São Paulo"
    ].join("\n");

    const REGIOES_PADRAO = [
        "Agro Brasil e Sambaetiba = Agro Brasil; Sambaetiba",
        "Japuíba e Papucaia = Japuíba; Papucaia"
    ].join("\n");

    const URL_MAPA_REGIOES = "https://murillo-calazans.github.io/mapa-logistico-cop/mapa-regioes.html";

    const PUBLICADOR_AUTOMATICO = "Agenda automática (IA)";

    const ehAutomatica = linha => !linha || linha.publicado_por === PUBLICADOR_AUTOMATICO;

    function montarAgenda(plano) {

        const daRota = r => {
            const usado = r.paradas.reduce((s, p) => s + p.os.dur, 0);
            const ultima = r.paradas[r.paradas.length - 1];
            return {
                jornada: r.tech.horario || null,
                termino: r.termino || null,
                cargaPct: r.cap ? Math.min(100, Math.round(usado / r.cap * 100)) : null,
                passaJornada: !!(ultima && ultima.fimMin > r.fim)
            };
        };

        const daOS = o => ({
            abertura: o.abertura instanceof Date && !isNaN(o.abertura) ? o.abertura.toISOString() : null,
            idadeDias: o.idadeDias ?? null,
            reagendamentos: o.reagendamentos ?? 0,
            visitas: o.visitas ?? 0
        });

        const itens = [];
        plano.rotas.forEach(r => r.paradas.forEach((p, i) => itens.push({
            ...daRota(r),
            ...daOS(p.os),
            tecnico: r.tech.nome, dupla: r.tech.dupla || null, setor: r.tech.setor, grupo: r.grupo, ordem: i + 1,
            chegada: p.chegada, saida: p.saida, os: p.os.id, cliente: p.os.cliente, login: p.os.login,
            cidade: p.os.cidade, bairro: p.os.bairro, assunto: p.os.assunto, prioridade: p.os.prioridade,
            observacao: [p.alerta, p.foraRota].filter(Boolean).join(" · ") || null
        })));
        plano.semTecnico.forEach(s => itens.push({
            ...daOS(s.os),
            tecnico: null, setor: s.os.setor, os: s.os.id, cliente: s.os.cliente, login: s.os.login,
            cidade: s.os.cidade, bairro: s.os.bairro, assunto: s.os.assunto, prioridade: s.os.prioridade, observacao: s.motivo || null
        }));

        const agendadas = itens.filter(i => i.tecnico).length;
        return {
            itens,
            resumo: { agendadas, semTecnico: itens.length - agendadas, tecnicos: plano.rotas.filter(r => r.paradas.length).length }
        };
    }

    const api = { MAPA_PADRAO, REGIOES_PADRAO, URL_MAPA_REGIOES, PUBLICADOR_AUTOMATICO, ehAutomatica, montarAgenda };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else global.AgendaPublicacao = api;
})(this);
