/**
 * ==========================================================
 * Infográficos — Auditoria
 * ==========================================================
 * Painéis no topo das abas Auditoria (Diagnóstico × Próxima Tarefa e
 * demais achados) e Auditor IA (vereditos salvos em ordem.auditoriaIA).
 * Desenho em js/ui/infograficos.js; lista de OS em igrListaOS
 * (js/ui/info-relatorios.js), que abre o modal da ordem no clique.
 */
(() => {
    const norm = s => (typeof normalizarTexto === "function" ? normalizarTexto(String(s ?? "")) : String(s ?? "").toUpperCase().trim());
    const ehErro = l => String(l.resultadoAuditoria ?? "").startsWith("Erro");
    const semCodigo = s => String(s ?? "").replace(/\s*\(\d+\)/g, "").trim();
    const nomeDono = l => l.tecnicoAuditado || l.tecnico || "";
    const abrirLista = (titulo, descricao, linhas) => linhas.length && typeof igrListaOS === "function"
        ? (() => igrListaOS(titulo, descricao, linhas)) : undefined;
    const abrirOS = id => typeof abrirModalOS === "function" ? (() => abrirModalOS(id)) : undefined;

    // ---------- Auditoria ----------
    registrarInfografico("auditoria", async () => {
        const linhas = igLinhasDoRecorte();
        if (!linhas) return [];
        const fin = linhas.filter(l => norm(l.status) === "FINALIZADA");
        if (!fin.length) return [{
            titulo: "Sem OS finalizadas no recorte", sub: "Ajuste o Filtro Global", cor: "cinza", icone: "lupa",
            blocos: [{ t: "nota", html: "Nenhuma OS finalizada no período e filtros escolhidos — a auditoria aparece assim que houver." }]
        }];

        const erros = fin.filter(ehErro);
        const ok = fin.filter(l => l.resultadoAuditoria === "OK");
        const auditadas = erros.length + ok.length;
        const corrigidas = fin.filter(l => l.resultadoAuditoria === "Corrigido").length;

        // erros por tipo
        const porTipo = new Map();
        for (const l of erros) {
            const tipo = String(l.resultadoAuditoria).replace(/^Erro\s*-\s*/, "") || "Erro";
            if (!porTipo.has(tipo)) porTipo.set(tipo, []);
            porTipo.get(tipo).push(l);
        }
        const tipos = [...porTipo].sort((a, b) => b[1].length - a[1].length);

        // quem errou
        const origem = l => l.tipoDono === "Campo" ? "Técnico de campo" : l.tipoDono === "Administrativo" ? "COP / suporte" : "Não identificado";
        const CORES_ORIGEM = { "Técnico de campo": "azul", "COP / suporte": "roxo", "Não identificado": "cinza" };
        const quem = ["Técnico de campo", "COP / suporte", "Não identificado"]
            .map(r => ({ rotulo: r, linhas: erros.filter(l => origem(l) === r) }))
            .filter(q => q.linhas.length);
        const copErros = quem.find(q => q.rotulo === "COP / suporte")?.linhas.length ?? 0;

        // outros achados
        const refechadas = fin.filter(l => l.refechadaOutro);
        const duplicidade = fin.filter(l => l.duplicidade);
        const motivos = new Map();
        for (const l of fin) {
            if (!l.reaberta) continue;
            const m = l.motivoReabertura || "Não classificado";
            if (!motivos.has(m)) motivos.set(m, []);
            motivos.get(m).push(l);
        }
        const listaMotivos = [...motivos].sort((a, b) => b[1].length - a[1].length);

        // técnicos de campo com mais erros (15+ auditados)
        const porTec = new Map();
        for (const l of fin) {
            if (l.tipoDono !== "Campo") continue;
            const nome = nomeDono(l);
            if (!nome) continue;
            if (!porTec.has(nome)) porTec.set(nome, { nome, aud: 0, erros: [] });
            const t = porTec.get(nome);
            if (ehErro(l)) { t.erros.push(l); t.aud++; } else if (l.resultadoAuditoria === "OK") t.aud++;
        }
        const tecnicosErro = [...porTec.values()]
            .filter(t => t.aud >= 15 && t.erros.length)
            .sort((a, b) => b.erros.length - a.erros.length || b.erros.length / b.aud - a.erros.length / a.aud)
            .slice(0, 8);
        const pilula = taxa => ({ txt: IG.pct(taxa), cor: taxa >= 15 ? "vermelho" : taxa >= 5 ? "laranja" : "verde" });

        const semRegra = IG.contar(fin.filter(l => l.resultadoAuditoria === "Sem regra"), l => semCodigo(l.diagnosticoAuditado) || null, 6);
        const totalSemRegra = fin.filter(l => l.resultadoAuditoria === "Sem regra").length;

        return [
            {
                titulo: "Fechamentos auditados", sub: "Diagnóstico × Próxima Tarefa", cor: "vermelho", icone: "escudo",
                blocos: auditadas ? [
                    {
                        t: "destaque", fatias: [
                            { n: ok.length, cor: "verde", rotulo: "OK" },
                            { n: erros.length, cor: "vermelho", rotulo: "Com erro" }
                        ],
                        centro: IG.fmt(auditadas), sub: "auditados", valor: IG.pctDe(erros.length, auditadas), corValor: "vermelho",
                        texto: `com erro · <b>${IG.fmt(erros.length)} OS</b> para corrigir`
                    },
                    {
                        t: "linhas", itens: tipos.map(([tipo, ls]) => ({
                            rotulo: tipo, n: ls.length, cor: "vermelho", extra: IG.pctDe(ls.length, erros.length),
                            acao: abrirLista(tipo, "Fechamentos com esse erro", ls)
                        }))
                    },
                    ...(corrigidas ? [{ t: "nota", html: `${IG.fmt(corrigidas)} OS já corrigidas não entram na conta.` }] : [])
                ] : [{ t: "nota", html: "Nenhum fechamento auditável no recorte (sem regra, fora do escopo ou ordens de estrutura)." }]
            },
            {
                titulo: "Quem errou", sub: "Erro de fechamento por origem", cor: "laranja", icone: "pessoa",
                blocos: quem.length ? [
                    { t: "empilhada", grupos: quem.map(q => ({ rotulo: q.rotulo, n: q.linhas.length, cor: CORES_ORIGEM[q.rotulo] })) },
                    {
                        t: "linhas", itens: quem.map(q => ({
                            rotulo: q.rotulo, n: q.linhas.length, cor: CORES_ORIGEM[q.rotulo], extra: IG.pctDe(q.linhas.length, erros.length),
                            acao: abrirLista(`Erros — ${q.rotulo}`, "Fechamentos com erro por origem", q.linhas)
                        }))
                    },
                    { t: "nota", html: `<b>${IG.pctDe(copErros, erros.length)}</b> dos erros vêm de fechamentos feitos pelo COP/suporte no lugar do técnico.` }
                ] : [{ t: "nota", html: "Nenhum erro de fechamento no recorte." }]
            },
            {
                titulo: "Outros achados", sub: "Além do Diagnóstico × Próxima Tarefa", cor: "roxo", icone: "alerta",
                blocos: [{
                    t: "kpis", itens: [
                        { rotulo: "Refechadas por outro", valor: IG.fmt(refechadas.length), cor: "laranja", acao: abrirLista("Refechadas por outro colaborador", "Reaberta e fechada de novo por outra pessoa", refechadas) },
                        { rotulo: "Duplicidade de equip.", valor: IG.fmt(duplicidade.length), acao: abrirLista("Duplicidade de equipamento", "Mesmo equipamento em mais de uma OS", duplicidade) },
                        ...listaMotivos.map(([m, ls]) => ({
                            rotulo: `Reaberta: ${m.charAt(0).toLowerCase()}${m.slice(1)}`, valor: IG.fmt(ls.length),
                            acao: abrirLista(`Reabertas — ${m}`, "OS reabertas por esse motivo", ls)
                        }))
                    ]
                }]
            },
            {
                titulo: "Técnicos com mais erros", sub: "Técnicos de campo com 15+ fechamentos auditados", cor: "vermelho", icone: "pessoa", span: 2,
                blocos: tecnicosErro.length ? [
                    {
                        t: "tabela", cab: ["Técnico", "Erros", "Auditados", "Taxa"], num: [1, 2],
                        linhas: tecnicosErro.map(t => ({
                            celulas: [t.nome, t.erros.length, t.aud, pilula(t.erros.length / t.aud * 100)],
                            acao: abrirLista(`Erros — ${t.nome}`, "Fechamentos com erro desse técnico", t.erros)
                        }))
                    },
                    { t: "nota", html: "Clique no técnico para ver as OS com erro." }
                ] : [{ t: "nota", html: "Nenhum técnico de campo com 15+ fechamentos auditados e erro no recorte." }]
            },
            {
                titulo: "Diagnósticos sem regra", sub: `Candidatos a regra nova · ${IG.fmt(totalSemRegra)} OS`, cor: "cinza", icone: "lupa",
                blocos: [{
                    t: "linhas", itens: semRegra.map(d => ({
                        rotulo: d.rotulo, n: d.n, cor: "cinza",
                        acao: abrirLista(`Sem regra — ${d.rotulo}`, "Diagnóstico sem regra de Próxima Tarefa", fin.filter(l => l.resultadoAuditoria === "Sem regra" && semCodigo(l.diagnosticoAuditado) === d.rotulo))
                    }))
                }]
            }
        ];
    });

    // ---------- Auditor IA ----------
    registrarInfografico("auditoria-ia", async () => {
        if (!APP?.status?.baseCarregada || !APP.dados?.ordens?.size) return [];
        const ordens = FiltroEngine.ordensFiltradas();
        const ROT = { ok: "OK", questionavel: "Questionável", problematico: "Problemático" };
        const COR = { ok: "verde", questionavel: "laranja", problematico: "vermelho" };
        const avaliadas = [...ordens.values()].filter(o => o?.auditoriaIA && ROT[o.auditoriaIA.veredito]);

        if (!avaliadas.length) return [{
            titulo: "Avaliações da IA", sub: "Veredito por OS analisada", cor: "roxo", icone: "robo", span: 3,
            blocos: [{ t: "nota", html: `Nenhuma das ${IG.fmt(ordens.size)} OS do recorte foi avaliada pelo Auditor IA ainda. Abra uma OS e use <b>Rodar Auditor IA</b> (admin) — os vereditos aparecem aqui assim que existirem.` }]
        }];

        const cont = { ok: 0, questionavel: 0, problematico: 0 };
        for (const o of avaliadas) cont[o.auditoriaIA.veredito]++;
        const atencao = cont.questionavel + cont.problematico;
        const quando = o => { const t = new Date(o.auditoriaIA.avaliadoEm).getTime(); return Number.isNaN(t) ? 0 : t; };
        const ultimas = avaliadas
            .filter(o => o.auditoriaIA.veredito !== "ok")
            .sort((a, b) => (b.auditoriaIA.veredito === "problematico") - (a.auditoriaIA.veredito === "problematico") || quando(b) - quando(a))
            .slice(0, 15);
        const corte = (s, n) => { const t = String(s ?? "").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t || "—"; };
        const dataCurta = o => { const t = quando(o); return t ? new Date(t).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—"; };

        return [
            {
                titulo: "Avaliações da IA", sub: "Veredito por OS analisada", cor: "roxo", icone: "robo",
                blocos: [
                    {
                        t: "destaque", fatias: ["ok", "questionavel", "problematico"].map(v => ({ n: cont[v], cor: COR[v], rotulo: ROT[v] })),
                        centro: IG.fmt(avaliadas.length), sub: "avaliadas", valor: IG.pctDe(atencao, avaliadas.length), corValor: atencao ? "laranja" : "verde",
                        texto: "questionáveis ou problemáticas"
                    },
                    { t: "linhas", itens: ["ok", "questionavel", "problematico"].map(v => ({ rotulo: ROT[v], n: cont[v], cor: COR[v], extra: IG.pctDe(cont[v], avaliadas.length) })) },
                    { t: "nota", html: `${IG.fmt(avaliadas.length)} de ${IG.fmt(ordens.size)} OS do recorte já passaram pelo Auditor IA.` }
                ]
            },
            {
                titulo: "Para olhar primeiro", sub: "Problemáticas e questionáveis mais recentes", cor: "roxo", icone: "lista", span: 2,
                blocos: ultimas.length ? [
                    {
                        t: "tabela", cab: ["OS", "Assunto", "Veredito", "Avaliada", "Justificativa"],
                        linhas: ultimas.map(o => ({
                            celulas: [String(o.id), IG.assuntoCurto(o.assunto), { txt: ROT[o.auditoriaIA.veredito], cor: COR[o.auditoriaIA.veredito] }, dataCurta(o), corte(o.auditoriaIA.justificativa, 140)],
                            acao: abrirOS(o.id)
                        }))
                    },
                    { t: "nota", html: "Clique na OS para abrir a ordem completa com a justificativa inteira." }
                ] : [{ t: "nota", html: "Todas as OS avaliadas no recorte receberam <b>OK</b>." }]
            }
        ];
    });
})();
