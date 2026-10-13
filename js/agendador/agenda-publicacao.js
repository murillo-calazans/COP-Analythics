/**
 * ==========================================================
 * Publicação da agenda (compartilhado)
 * ==========================================================
 * Padrões do pré-agendamento e o formato da agenda publicada
 * (tabela agenda_publicada, ver database/patch-15) — o mesmo para o
 * botão "Publicar agenda" do agendador.html e para a publicação
 * automática (supabase/functions/publicar-agenda), que roda todo dia
 * sem ninguém abrir a página.
 */
(function (global) {
    "use strict";

    // Cidade da OS = seções da escala que atendem (exceções; cidade com o mesmo
    // nome de uma seção da escala é ligada sozinha).
    const MAPA_PADRAO = [
        "Cachoeiras de Macacu = Cachoeiras de Macacu; Japuíba; Papucaia",
        "Itaboraí = Cachoeiras de Macacu; Japuíba; Papucaia",
        "Magé = Guapimirim",
        "Cruzeiro = São Paulo",
        "Guaratinguetá = São Paulo",
        "Lavrinhas = São Paulo",
        "Queluz = São Paulo"
    ].join("\n");

    // Bairros que vão para o mesmo técnico.
    const REGIOES_PADRAO = [
        "Agro Brasil e Sambaetiba = Agro Brasil; Sambaetiba",
        "Japuíba e Papucaia = Japuíba; Papucaia",
        // A Região Sul de Friburgo no mapa junta dois lados da cidade: Olaria/Cônego e Ponte da Saudade/Mury
        // ficam perto em linha reta, mas pela estrada é preciso atravessar o Centro.
        "Sul - Mury / Ponte da Saudade = Ponte da Saudade; Mury; Stucky"
    ].join("\n");

    const URL_MAPA_REGIOES = "https://murillo-calazans.github.io/mapa-logistico-cop/mapa-regioes.html";

    // Valor de "publicado_por" da publicação automática. Agenda com outro valor
    // foi publicada à mão pelo botão — a automática não substitui.
    const PUBLICADOR_AUTOMATICO = "Agenda automática (IA)";

    const ehAutomatica = linha => !linha || linha.publicado_por === PUBLICADOR_AUTOMATICO;

    /**
     * Linhas da agenda publicada a partir do plano do motor
     * (Motor.planejar): uma por parada, mais as OS que não couberam.
     * Devolve { itens, resumo } prontos para a tabela agenda_publicada.
     */
    function montarAgenda(plano) {
        // Dados da rota (repetidos em cada parada): jornada, ocupação (mesma conta da barra "carga" da aba
        // Rotas) e se a última OS termina depois do fim da jornada — a Agenda do dia usa pra barra e o filtro.
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
        // Da OS: há quanto tempo está aberta (até o dia do plano) e quantas vezes já foi reagendada/visitada.
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
