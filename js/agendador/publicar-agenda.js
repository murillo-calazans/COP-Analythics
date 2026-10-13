/**
 * ==========================================================
 * Publicação automática da agenda (rotina)
 * ==========================================================
 * Gera o pré-agendamento de um dia e grava em agenda_publicada, sem
 * ninguém abrir o agendador.html. Mesmo caminho do botão "Gerar" +
 * "Publicar agenda":
 *   OS em aberto (os_pendentes, que o robô atualiza de hora em hora)
 *   + escala do dia (escala_tecnicos_dados, a mesma da escala.html)
 *   + mapa de regiões + histórico das OS (ordens)
 *   -> Motor.planejar -> AgendaPublicacao.montarAgenda -> agenda_publicada.
 *
 * Quem chama: supabase/functions/publicar-agenda (todo dia no fim da
 * tarde, pelo pg_cron, para o dia seguinte). A função baixa este arquivo e
 * o motor do próprio site, então melhorias no agendador já valem aqui.
 *
 * Regra: agenda publicada à mão (botão "Publicar agenda") NUNCA é
 * substituída — a automática só grava se o dia estiver vazio ou se a
 * agenda existente também for automática.
 *
 * Não usa supabase-js: fala com o REST do Supabase via fetch, então roda
 * igual no servidor (Deno) e num teste local (Node).
 */
(function (global) {
    "use strict";

    const DIA_MS = 864e5;

    /** "AAAA-MM-DD" de amanhã no horário de Brasília (o servidor roda em UTC). */
    function amanhaEmBrasilia(agora = new Date()) {
        const brasilia = new Date(agora.getTime() - 3 * 3600e3);
        const amanha = new Date(brasilia.getTime() + DIA_MS);
        return amanha.toISOString().slice(0, 10);
    }

    function criarRest(url, chave) {
        const base = url.replace(/\/+$/, "") + "/rest/v1/";
        const cabecalhos = extra => ({ apikey: chave, Authorization: `Bearer ${chave}`, "Content-Type": "application/json", ...extra });
        return {
            async get(caminho) {
                const r = await fetch(base + caminho, { headers: cabecalhos() });
                if (!r.ok) throw new Error(`GET ${caminho.split("?")[0]}: ${r.status} ${await r.text()}`);
                return r.json();
            },
            async upsert(tabela, linha, conflito) {
                const r = await fetch(`${base}${tabela}?on_conflict=${conflito}`, {
                    method: "POST",
                    headers: cabecalhos({ Prefer: "resolution=merge-duplicates,return=minimal" }),
                    body: JSON.stringify(linha)
                });
                if (!r.ok) throw new Error(`POST ${tabela}: ${r.status} ${await r.text()}`);
            }
        };
    }

    async function todasAsLinhas(rest, caminho, porPagina = 1000) {
        const linhas = [];
        for (let de = 0; ; de += porPagina) {
            const pagina = await rest.get(`${caminho}&limit=${porPagina}&offset=${de}`);
            linhas.push(...pagina);
            if (pagina.length < porPagina) break;
        }
        return linhas;
    }

    const listaIn = valores => `(${valores.map(v => `"${String(v).replace(/"/g, "")}"`).join(",")})`;

    /** Histórico das OS dos clientes (últimos 60 dias), com o nome do técnico — igual buscarHistorico do agendador. */
    async function buscarHistorico(rest, logins, ref, norm) {
        const desde = new Date(ref.getTime() - 60 * DIA_MS).toISOString();
        const todos = [];
        for (let i = 0; i < logins.length; i += 150) {
            const lote = logins.slice(i, i + 150);
            todos.push(...await rest.get(
                `ordens?select=id,login,assunto,data_abertura,data_fechamento,status_atual,tecnico_responsavel` +
                `&login=in.${encodeURIComponent(listaIn(lote))}&data_abertura=gte.${encodeURIComponent(desde)}&limit=10000`));
        }
        const ids = [...new Set(todos.map(o => o.tecnico_responsavel).filter(v => v != null && v !== ""))].map(String);
        const nomes = {};
        for (let i = 0; i < ids.length; i += 150) {
            const linhas = await rest.get(`ref_operadores?select=chave,dados&chave=in.${encodeURIComponent(listaIn(ids.slice(i, i + 150)))}`);
            linhas.forEach(l => {
                const col = l.dados && Object.keys(l.dados).find(k => norm(k) === "nome");
                if (col && l.dados[col]) nomes[String(l.chave)] = l.dados[col];
            });
        }
        todos.forEach(o => { const n = nomes[String(o.tecnico_responsavel)]; if (n) o.tecnico_responsavel = n; });
        return todos;
    }

    /**
     * Gera e (a menos que simular) publica a agenda de "data" (AAAA-MM-DD;
     * padrão: amanhã em Brasília). mods = { Motor, EscalaDia, AgendaPublicacao }.
     * Devolve um resumo do que fez.
     */
    async function publicarAgenda({ url, chave, data, simular = false, mods }) {
        const { Motor, EscalaDia, AgendaPublicacao } = mods;
        const rest = criarRest(url, chave);
        const dataIso = data || amanhaEmBrasilia();
        const [a, m, d] = dataIso.split("-").map(Number);
        const ref = new Date(a, m - 1, d);

        const existente = (await rest.get(`agenda_publicada?select=publicado_por,atualizado_em&data=eq.${dataIso}`))[0];
        if (existente && !AgendaPublicacao.ehAutomatica(existente)) {
            return { data: dataIso, status: "mantida", motivo: `já publicada à mão por ${existente.publicado_por || "alguém"}` };
        }

        const [pendentes, escalaLinha] = await Promise.all([
            todasAsLinhas(rest, "os_pendentes?select=dados&order=id"),
            rest.get("escala_tecnicos_dados?select=dados&id=eq.default")
        ]);
        const linhasOS = pendentes.map(p => p.dados);
        const escala = Array.isArray(escalaLinha[0]?.dados) ? escalaLinha[0].dados : [];
        if (!linhasOS.length) throw new Error("os_pendentes está vazia (o robô rodou?)");
        if (!escala.length) throw new Error("escala_tecnicos_dados está vazia");

        let idxMapa = null, fonteMapa = "sem mapa";
        try {
            const r = await fetch(AgendaPublicacao.URL_MAPA_REGIOES, { cache: "no-store" });
            const dados = r.ok ? Motor.lerMapaRegioes(await r.text()) : null;
            if (dados) { idxMapa = Motor.indiceMapa(dados); fonteMapa = "site"; }
        } catch (e) { /* segue sem o mapa: o motor usa só o GPS das OS */ }

        const params = { ...Motor.PADRAO_PARAMS };
        const { os } = Motor.montarOS(linhasOS, ref, params, idxMapa);
        const logins = [...new Set(os.filter(o => o.campo && o.login).map(o => o.login))];
        let historico = 0;
        try {
            const hist = await buscarHistorico(rest, logins, ref, Motor.norm);
            Motor.aplicarHistorico(os, hist, ref);
            historico = hist.length;
        } catch (e) { /* sem histórico o plano sai igual, só sem "último atendimento" */ }

        const equipes = EscalaDia.equipesParaAgendador(escala, ref);
        const plano = Motor.planejar(os, equipes, AgendaPublicacao.MAPA_PADRAO, params, ref, AgendaPublicacao.REGIOES_PADRAO);
        const { itens, resumo } = AgendaPublicacao.montarAgenda(plano);

        const saida = {
            data: dataIso, status: simular ? "simulada" : "publicada",
            equipes: equipes.length, osPendentes: os.filter(o => o.campo).length, historico, mapa: fonteMapa, ...resumo
        };
        if (simular) return { ...saida, amostra: itens.slice(0, 3) };

        await rest.upsert("agenda_publicada", {
            data: dataIso, itens, resumo,
            publicado_por: AgendaPublicacao.PUBLICADOR_AUTOMATICO,
            atualizado_em: new Date().toISOString()
        }, "data");
        return saida;
    }

    const api = { publicarAgenda, amanhaEmBrasilia };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else global.PublicarAgenda = api;
})(this);
