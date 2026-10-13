/**
 * ==========================================================
 * Escala do dia (regras compartilhadas)
 * ==========================================================
 * Como fica cada técnico numa data, a partir da linha do Supabase que a
 * escala.html edita (escala_tecnicos_dados, ver database/patch-14).
 *
 * Usado por:
 * - js/ui/escalahoje.js (tela "Escala de hoje");
 * - agendador.html (pré-agendamento, sem precisar exportar a escala);
 * - supabase/functions/publicar-agenda (publicação automática da agenda).
 *
 * As regras são as da escala.html (getDiaData, horarioEfetivo,
 * ehFolgaPadraoNaoEditado, getTempCidadeEfetiva, getSetorEfetivo,
 * getDuplaInfo) — lá elas vivem presas dentro de um IIFE. Mudou uma regra
 * lá? Muda aqui também.
 *
 * Datas: sempre "meia-noite local" (new Date(ano, mes, dia)); o dia da
 * semana e o ISO saem dos campos locais, então funciona igual no navegador
 * e no servidor (que roda em UTC).
 */
(function (global) {
    "use strict";

    const FERIADOS = {
        "2026-01-01": "Confraternização Universal",
        "2026-02-16": "Carnaval",
        "2026-02-17": "Carnaval",
        "2026-04-03": "Sexta-feira Santa",
        "2026-04-21": "Tiradentes",
        "2026-05-01": "Dia do Trabalho",
        "2026-06-04": "Corpus Christi",
        "2026-09-07": "Independência do Brasil",
        "2026-10-12": "Nossa Senhora Aparecida",
        "2026-11-02": "Finados",
        "2026-11-15": "Proclamação da República",
        "2026-12-25": "Natal"
    };

    const DIAS_JS = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];

    const isoData = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    const regras = {
        dentroDoPeriodo(data, inicioIso, fimIso) {
            if (!inicioIso || !fimIso) return false;
            const [a1, m1, d1] = inicioIso.split("-").map(Number);
            const [a2, m2, d2] = fimIso.split("-").map(Number);
            return data >= new Date(a1, m1 - 1, d1) && data <= new Date(a2, m2 - 1, d2);
        },

        diaData(tech, diaKey, dataIso) {
            return tech.excecoes?.[dataIso] || tech.horarios?.[diaKey] || {};
        },

        horario(tech, dia) {
            if (dia.custom) return { inicio: dia.inicio, fim: dia.fim };
            return { inicio: tech.horarioPadrao?.inicio ?? "07:00", fim: tech.horarioPadrao?.fim ?? "15:00" };
        },

        folgaPadrao(tech, diaKey, dataIso, dia) {
            const temExcecao = !!tech.excecoes?.[dataIso];
            const intocado = !dia.custom && !dia.folga && !dia.atestado && !dia.outras;
            return !temExcecao && intocado && (diaKey === "sab" || diaKey === "dom" || !!FERIADOS[dataIso]);
        },

        cidadeTemporaria(tech, diaKey, dataIso) {
            const exc = tech.excecoes?.[dataIso];
            if (exc && Object.prototype.hasOwnProperty.call(exc, "tempCidadeOverride")) return exc.tempCidadeOverride || null;
            return (tech.alocacoesTemporarias || []).find(a => a.dias.includes(diaKey))?.cidade ?? null;
        },

        setor(tech, dataIso) {
            return tech.excecoes?.[dataIso]?.setorOverride || tech.setor;
        },

        temDuplaOverride(tech, dataIso) {
            const exc = tech.excecoes?.[dataIso];
            return !!(exc && Object.prototype.hasOwnProperty.call(exc, "duplaOverride"));
        },

        /**
         * Mesma precedência de getDuplaInfo na escala.html. Devolve
         * { parceiro, papel } — quem TEM o parceiro configurado (no dia ou no
         * cadastro) é o "auxiliar"; quem foi ESCOLHIDO é o "principal", o nome
         * que vale pras OS. Sem dupla: null.
         */
        dupla(tech, techs, dataIso) {
            const porId = id => techs.find(t => t.id === id);
            const exc = tech.excecoes?.[dataIso];

            if (this.temDuplaOverride(tech, dataIso)) {
                const p = exc.duplaOverride ? porId(exc.duplaOverride) : null;
                return p ? { parceiro: p, papel: "auxiliar" } : null;
            }

            const escolheu = techs.find(o => o.id !== tech.id && this.temDuplaOverride(o, dataIso) && o.excecoes[dataIso].duplaOverride === tech.id);
            if (escolheu) return { parceiro: escolheu, papel: "principal" };

            if (tech.dupla) {
                const fixo = porId(tech.dupla);
                return fixo && !this.temDuplaOverride(fixo, dataIso) ? { parceiro: fixo, papel: "auxiliar" } : null;
            }
            const apontou = techs.find(o => o.id !== tech.id && o.dupla === tech.id && !this.temDuplaOverride(o, dataIso));
            return apontou ? { parceiro: apontou, papel: "principal" } : null;
        },

        parceiro(tech, techs, dataIso) {
            return this.dupla(tech, techs, dataIso)?.parceiro ?? null;
        },

        /** { situacao, cidade, temporaria, inicio, fim } do técnico na data. */
        resumo(tech, data) {
            const diaKey = DIAS_JS[data.getDay()];
            const dataIso = isoData(data);

            if (tech.status === "ferias" && this.dentroDoPeriodo(data, tech.feriasInicio, tech.feriasFim)) return { situacao: "ferias" };

            const dia = this.diaData(tech, diaKey, dataIso);
            if (this.folgaPadrao(tech, diaKey, dataIso, dia) || dia.folga) return { situacao: "folga" };
            if (dia.atestado) return { situacao: "atestado" };
            if (dia.outras) return { situacao: "outras" };

            const { inicio, fim } = this.horario(tech, dia);
            if (!inicio || !fim) return { situacao: "folga" };

            const temporaria = this.cidadeTemporaria(tech, diaKey, dataIso);
            return {
                situacao: this.setor(tech, dataIso) === "Manutenção" ? "manutencao" : "instalador",
                cidade: temporaria || tech.cidade,
                temporaria: !!temporaria,
                inicio,
                fim
            };
        }
    };

    const trabalhaNoDia = resumo => resumo.situacao === "instalador" || resumo.situacao === "manutencao";

    /** Lista { tech, resumo, trabalha, parceiro, papel } de todos os técnicos na data. */
    function montarDia(techs, data) {
        const dataIso = isoData(data);
        return techs.map(tech => {
            const resumo = regras.resumo(tech, data);
            const trabalha = trabalhaNoDia(resumo);
            let dupla = trabalha ? regras.dupla(tech, techs, dataIso) : null;
            if (dupla && !trabalhaNoDia(regras.resumo(dupla.parceiro, data))) dupla = null;
            return { tech, resumo, trabalha, parceiro: dupla?.parceiro ?? null, papel: dupla?.papel ?? null };
        });
    }

    /**
     * Equipes do dia no formato que o motor do agendador usa (o mesmo que
     * ele lia do HTML exportado da escala): uma linha por equipe — a dupla
     * entra pelo técnico principal, com o auxiliar em "dupla".
     */
    function equipesParaAgendador(techs, data) {
        return montarDia(techs, data)
            .filter(d => d.trabalha && d.papel !== "auxiliar")
            .map(d => ({
                id: d.tech.id,
                nome: d.tech.nome,
                setor: d.resumo.situacao,
                secao: d.resumo.cidade,
                horario: `${d.resumo.inicio}–${d.resumo.fim}`,
                dupla: d.parceiro ? d.parceiro.nome : null,
                temporario: d.resumo.temporaria,
                regiao: d.tech.regiao || null
            }));
    }

    const api = { FERIADOS, DIAS_JS, isoData, regras, montarDia, equipesParaAgendador };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else global.EscalaDia = api;
})(this);
