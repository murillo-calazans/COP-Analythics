/**
 * ==========================================================
 * Infográficos — Gestão de Relatórios
 * ==========================================================
 * Painéis no topo das abas Dashboard, Tempos, Indicadores, Ordens,
 * Técnicos e Mapa de calor (desenho em js/ui/infograficos.js). Tudo
 * calculado ao vivo sobre as OS FINALIZADAS do recorte do Filtro Global
 * (igLinhasDoRecorte -> montarLinhasDetalheOS).
 *
 * Cliques: barra/linha de assunto, cidade, diagnóstico e técnico aplicam
 * o filtro interativo (cliqueFiltroInterativo, o mesmo dos gráficos);
 * faixas de tempo e contagens abrem a lista das OS (igrListaOS), e cada
 * OS da lista abre o modal da ordem (abrirModalOS).
 */

/**
 * Popup com a lista de OS (mesmo visual dos popups da tela inicial).
 * Global: também usado por js/ui/info-auditoria.js.
 */
function igrListaOS(titulo, descricao, linhas) {
    if (typeof document === "undefined" || !document.body) return;
    if (typeof fecharPopupPainel === "function") fecharPopupPainel();
    const TETO = 300;
    const lista = linhas.slice(0, TETO);
    const esc = s => IG.esc(s);
    const dataCurta = d => d instanceof Date && !Number.isNaN(d.getTime())
        ? d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
    const itens = lista.map(l => `
        <li class="ixc-os ixc-os-click" data-igr-os="${esc(l.id)}" title="Ver a ordem completa">
            <div class="ixc-os-linha"><span class="ixc-os-cliente">#${esc(l.id)} · ${esc(l.cliente || "—")}</span>
                ${l.fechamento ? `<span class="escala-tag ixc-feita-hora">✔ ${esc(dataCurta(l.fechamento))}</span>` : ""}</div>
            <div class="ixc-os-sub">${esc(l.cidade || "—")}${l.bairro ? " · " + esc(l.bairro) : ""} · ${esc(IG.assuntoCurto(l.assunto))}</div>
            <div class="ixc-os-sub">${esc(l.tecnicoAuditado || l.tecnico || "—")}${l.diagnosticoAuditado ? " · " + esc(l.diagnosticoAuditado) : ""}</div>
        </li>`).join("");
    const fundo = document.createElement("div");
    fundo.className = "ixc-popup-fundo painel-popup-fundo";
    fundo.innerHTML = `
      <div class="ixc-popup" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
        <div class="ixc-popup-topo">
          <div><h2>${esc(titulo)} <span class="escala-pilula">${linhas.length.toLocaleString("pt-BR")} OS</span></h2>
            <p>${esc(descricao)}${linhas.length > TETO ? ` — mostrando as ${TETO} primeiras` : ""}</p></div>
          <button type="button" class="ixc-popup-fechar" aria-label="Fechar">✕</button>
        </div>
        <div class="ixc-popup-corpo">${lista.length ? `<ul class="ixc-lista">${itens}</ul>` : '<p class="alerta-vazio">Nenhuma OS aqui.</p>'}</div>
      </div>`;
    const fechar = () => {
        fundo.remove();
        if (!document.querySelector(".ixc-popup-fundo")) document.body.classList.remove("ixc-popup-aberto");
    };
    document.body.appendChild(fundo);
    document.body.classList.add("ixc-popup-aberto");
    fundo.addEventListener("click", e => { if (e.target === fundo) fechar(); });
    fundo.querySelector(".ixc-popup-fechar").addEventListener("click", fechar);
    fundo.querySelectorAll("[data-igr-os]").forEach(li => li.addEventListener("click", () => {
        if (typeof abrirModalOS !== "function") return;
        const original = lista.find(l => String(l.id) === li.dataset.igrOs);
        abrirModalOS(original ? original.id : li.dataset.igrOs);
    }));
    fundo.querySelector(".ixc-popup-fechar").focus();
}

(() => {
    // ---------- base comum ----------
    const norm = s => (typeof normalizarTexto === "function" ? normalizarTexto(String(s ?? "")) : String(s ?? "").toUpperCase().trim());
    const ehErro = l => String(l.resultadoAuditoria ?? "").startsWith("Erro");
    const ehAuditada = l => ehErro(l) || l.resultadoAuditoria === "OK";
    const semCodigo = s => String(s ?? "").replace(/\s*\(\d+\)/g, "").trim();
    const minTxt = v => v === null || v === undefined ? "—" : `${IG.fmt(Math.round(v))} min`;
    const nomeDono = l => l.tecnicoAuditado || l.tecnico || "";

    /** Só as finalizadas do recorte (mesma base do CSV do Dashboard que gerou os protótipos). */
    function finalizadas() {
        const linhas = igLinhasDoRecorte();
        if (!linhas) return null;
        return linhas.filter(l => norm(l.status) === "FINALIZADA");
    }

    const vazio = (titulo = "Sem OS finalizadas no recorte") => [{
        titulo, sub: "Ajuste o Filtro Global", cor: "cinza", icone: "lupa",
        blocos: [{ t: "nota", html: "Nenhuma OS finalizada no período e filtros escolhidos — os indicadores aparecem assim que houver." }]
    }];

    const filtrar = (campo, valor) => typeof cliqueFiltroInterativo === "function" && valor
        ? (() => cliqueFiltroInterativo(campo, valor)) : undefined;
    const abrirLista = (titulo, descricao, linhas) => linhas.length ? (() => igrListaOS(titulo, descricao, linhas)) : undefined;

    const FAIXAS = [
        { rotulo: "< 15 min", teste: v => v < 15 },
        { rotulo: "15–30", teste: v => v >= 15 && v < 30 },
        { rotulo: "30–60", teste: v => v >= 30 && v < 60 },
        { rotulo: "60–90", teste: v => v >= 60 && v < 90 },
        { rotulo: "+ 90 min", teste: v => v >= 90 }
    ];
    const ROTULO_TIPO = { Campo: "Técnico de campo", Administrativo: "COP / suporte" };

    // ---------- cartões reaproveitados ----------
    function cartaoAssuntos(fin, titulo, sub) {
        const top = IG.contar(fin, "assunto", 8);
        return {
            titulo, sub, cor: "verde", icone: "lista",
            blocos: [{
                t: "linhas", itens: top.map(a => ({
                    rotulo: IG.assuntoCurto(a.rotulo), titulo: a.rotulo, n: a.n, cor: "verde",
                    extra: IG.pctDe(a.n, fin.length), acao: filtrar("assuntos", a.rotulo)
                }))
            }]
        };
    }

    function porCidade(fin, topo) {
        return IG.contar(fin, l => l.cidade || "Sem cidade", topo);
    }

    // ---------- Dashboard ----------
    registrarInfografico("dashboard", async () => {
        const fin = finalizadas();
        if (!fin) return [];
        if (!fin.length) return vazio();
        const total = fin.length;

        const campo = fin.filter(l => l.tipoDono === "Campo");
        const admin = fin.filter(l => l.tipoDono === "Administrativo");
        const semDono = fin.filter(l => l.tipoDono !== "Campo" && l.tipoDono !== "Administrativo");
        const reabertas = fin.filter(l => l.reaberta);
        const reagendadas = fin.filter(l => l.reagendada);
        const tma = IG.mediana(fin.map(l => l.tmaMin));
        const tms = IG.mediana(fin.map(l => l.tmsMin));

        // fechamentos por dia (ordem cronológica)
        const dias = new Map();
        for (const l of fin) {
            const d = l.fechamento instanceof Date && !Number.isNaN(l.fechamento.getTime()) ? l.fechamento : null;
            if (!d) continue;
            const chave = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
            if (!dias.has(chave)) dias.set(chave, []);
            dias.get(chave).push(l);
        }
        const diario = [...dias].sort((a, b) => a[0] - b[0]).map(([t, ls]) => {
            const d = new Date(t);
            const rot = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
            return { rotulo: rot, n: ls.length, acao: abrirLista(`Fechadas em ${rot}`, "OS finalizadas no dia", ls) };
        });
        const mediaDia = diario.length ? Math.round(diario.reduce((s, d) => s + d.n, 0) / diario.length) : 0;

        const diagnosticos = IG.contar(fin, "diagnosticoAuditado", 6);
        const equipes = IG.contar(fin, l => l.equipe || "Não identificado", 8);
        const corEquipe = (eq, i) => eq === "Interna" ? "azul" : eq === "Não identificado" ? "cinza" : IG_PALETA[(i % (IG_PALETA.length - 2)) + 1];
        const gruposEquipe = equipes.map((e, i) => ({ rotulo: e.rotulo, n: e.n, cor: corEquipe(e.rotulo, i) }));

        const fatias = [
            { n: campo.length, cor: "azul", rotulo: "Técnico de campo" },
            { n: admin.length, cor: "roxo", rotulo: "COP / suporte" },
            { n: semDono.length, cor: "cinza", rotulo: "Não identificado" }
        ];

        return [
            {
                titulo: "Visão do período", sub: "OS finalizadas e o que aconteceu com elas", cor: "azul", icone: "prancheta",
                blocos: [
                    {
                        t: "destaque", fatias, centro: IG.fmt(total), sub: "finalizadas",
                        valor: IG.pctDe(admin.length, total),
                        texto: `foram <b>fechadas pelo COP ou suporte</b>, não pelo técnico de campo${semDono.length ? ` · ${IG.fmt(semDono.length)} sem setor identificado` : ""}`
                    },
                    {
                        t: "kpis", itens: [
                            { rotulo: "Reabertas", valor: IG.fmt(reabertas.length), sub: IG.pctDe(reabertas.length, total), acao: abrirLista("Reabertas", "OS finalizadas que foram reabertas", reabertas) },
                            { rotulo: "Reagendadas", valor: IG.fmt(reagendadas.length), sub: IG.pctDe(reagendadas.length, total), cor: "laranja", acao: abrirLista("Reagendadas", "OS finalizadas que passaram por reagendamento", reagendadas) },
                            { rotulo: "TMA mediano", valor: minTxt(tma) },
                            { rotulo: "TMS mediano", valor: minTxt(tms) }
                        ]
                    }
                ]
            },
            {
                titulo: "Fechamentos por dia", sub: "Volume diário de OS finalizadas", cor: "azul", icone: "grafico", span: 2,
                blocos: [
                    { t: "colunas", itens: diario, cor: "azul" },
                    { t: "nota", html: `Média de <b>${IG.fmt(mediaDia)} OS por dia</b> no período (${IG.fmt(diario.length)} dia${diario.length === 1 ? "" : "s"} com fechamento). Clique numa coluna para ver as OS do dia.` }
                ]
            },
            cartaoAssuntos(fin, "Assuntos com mais volume", "Top 8 do período"),
            {
                titulo: "Diagnósticos mais usados", sub: "No fechamento que vale para a auditoria", cor: "roxo", icone: "lupa",
                blocos: [{
                    t: "linhas", itens: diagnosticos.map(d => ({
                        rotulo: semCodigo(d.rotulo), titulo: d.rotulo, n: d.n, cor: "roxo",
                        extra: IG.pctDe(d.n, total), acao: filtrar("diagnosticos", d.rotulo)
                    }))
                }]
            },
            {
                titulo: "Quem executou", sub: "Equipe interna × terceirizadas", cor: "ciano", icone: "equipe",
                blocos: [
                    { t: "empilhada", grupos: gruposEquipe },
                    {
                        t: "linhas", itens: gruposEquipe.map(g => ({
                            ...g, extra: IG.pctDe(g.n, total),
                            acao: abrirLista(`Equipe: ${g.rotulo}`, "OS finalizadas por essa equipe", fin.filter(l => (l.equipe || "Não identificado") === g.rotulo))
                        }))
                    }
                ]
            }
        ];
    });

    // ---------- Tempos ----------
    registrarInfografico("tempos", async () => {
        const fin = finalizadas();
        if (!fin) return [];
        if (!fin.length) return vazio();

        const comTma = fin.filter(l => l.tmaMin !== null && l.tmaMin !== undefined);
        const comTms = fin.filter(l => l.tmsMin !== null && l.tmsMin !== undefined);
        const faixas = (lista, campo) => FAIXAS.map(f => ({ rotulo: f.rotulo, linhas: lista.filter(l => f.teste(l[campo])) }));
        const fTma = faixas(comTma, "tmaMin");
        const fTms = faixas(comTms, "tmsMin");
        const tma = IG.mediana(comTma.map(l => l.tmaMin));
        const tms = IG.mediana(comTms.map(l => l.tmsMin));

        const tmaBaixo = fTma[0].linhas.length;
        const tmaMeio = fTma[1].linhas.length + fTma[2].linhas.length + fTma[3].linhas.length;
        const tmaAlto = fTma[4].linhas.length;
        const tmsAlto = fTms[4].linhas.length;
        const tmsAte90 = comTms.length - tmsAlto;

        const corTma = (i) => i === 0 ? "vermelho" : i === 4 ? "laranja" : "verde";
        const corTms = (i) => i === 4 ? "laranja" : "azul";
        const lista = (sigla, desc) => (f) => abrirLista(`${sigla} ${f.rotulo}`, desc, f.linhas);

        return [
            {
                titulo: "TMA", sub: "Execução → finalização", cor: "verde", icone: "relogio",
                blocos: comTma.length ? [
                    {
                        t: "destaque", fatias: [
                            { n: tmaBaixo, cor: "vermelho", rotulo: "< 15 min" },
                            { n: tmaMeio, cor: "verde", rotulo: "15–90 min" },
                            { n: tmaAlto, cor: "laranja", rotulo: "+90 min" }
                        ],
                        centro: minTxt(tma), sub: "mediana", valor: IG.pctDe(tmaBaixo, comTma.length), corValor: "vermelho",
                        texto: "das OS com TMA abaixo de 15 min, <b>rápido demais</b> para um atendimento real"
                    },
                    { t: "colunas", itens: fTma.map((f, i) => ({ rotulo: f.rotulo, n: f.linhas.length, cor: corTma(i), acao: lista("TMA", "Tempo de execução → finalização")(f) })) }
                ] : [{ t: "nota", html: "Nenhuma OS do recorte tem TMA calculado." }]
            },
            {
                titulo: "TMS", sub: "Deslocamento → finalização", cor: "azul", icone: "caminhao",
                blocos: comTms.length ? [
                    {
                        t: "destaque", fatias: [
                            { n: tmsAte90, cor: "azul", rotulo: "até 90 min" },
                            { n: tmsAlto, cor: "laranja", rotulo: "+90 min" }
                        ],
                        centro: minTxt(tms), sub: "mediana", valor: IG.pctDe(tmsAlto, comTms.length), corValor: "laranja",
                        texto: "das OS levaram <b>mais de 1h30</b> do deslocamento ao fechamento"
                    },
                    { t: "colunas", itens: fTms.map((f, i) => ({ rotulo: f.rotulo, n: f.linhas.length, cor: corTms(i), acao: lista("TMS", "Tempo de deslocamento → finalização")(f) })) }
                ] : [{ t: "nota", html: "Nenhuma OS do recorte tem TMS calculado." }]
            },
            {
                titulo: "Leitura rápida", sub: "Faixas de tempo", cor: "roxo", icone: "grafico",
                blocos: [
                    {
                        t: "linhas", itens: [
                            ...fTma.map((f, i) => ({ rotulo: `TMA ${f.rotulo}`, n: f.linhas.length, cor: corTma(i), extra: IG.pctDe(f.linhas.length, comTma.length), acao: lista("TMA", "Tempo de execução → finalização")(f) })),
                            ...fTms.map((f, i) => ({ rotulo: `TMS ${f.rotulo}`, n: f.linhas.length, cor: corTms(i), extra: IG.pctDe(f.linhas.length, comTms.length), acao: lista("TMS", "Tempo de deslocamento → finalização")(f) }))
                        ]
                    },
                    { t: "nota", html: `Clique numa faixa para abrir as OS dela. ${IG.fmt(fin.length - comTma.length)} OS sem TMA e ${IG.fmt(fin.length - comTms.length)} sem TMS (sem par de status ou fora do cálculo de tempo).` }
                ]
            }
        ];
    });

    // ---------- Indicadores ----------
    registrarInfografico("indicadores", async () => {
        const fin = finalizadas();
        if (!fin) return [];
        if (!fin.length) return vazio();

        const erros = fin.filter(ehErro);
        const ok = fin.filter(l => l.resultadoAuditoria === "OK");
        const auditadas = erros.length + ok.length;
        const reabertas = fin.filter(l => l.reaberta);
        const refechadas = fin.filter(l => l.refechadaOutro);
        const duplicidade = fin.filter(l => l.duplicidade);
        const logins3 = new Set(fin.filter(l => l.login && (l.osDoLogin ?? 0) >= 3).map(l => l.login));
        const osLogins3 = fin.filter(l => logins3.has(l.login));
        const semTexto = fin.filter(l => String(l.mensagem ?? "").trim().length < 30);

        return [
            {
                titulo: "Qualidade do fechamento", sub: "Diagnóstico × Próxima Tarefa", cor: "vermelho", icone: "escudo",
                blocos: auditadas ? [{
                    t: "destaque", fatias: [
                        { n: ok.length, cor: "verde", rotulo: "OK" },
                        { n: erros.length, cor: "vermelho", rotulo: "Erro" }
                    ],
                    centro: IG.pctDe(erros.length, auditadas), sub: "com erro", valor: IG.fmt(erros.length), corValor: "vermelho",
                    texto: `fechamentos com erro de ${IG.fmt(auditadas)} auditados`
                }, {
                    t: "kpis", itens: [{ rotulo: "Ver as OS com erro", valor: IG.fmt(erros.length), cor: "vermelho", acao: abrirLista("Fechamentos com erro", "Diagnóstico × Próxima Tarefa", erros) }]
                }] : [{ t: "nota", html: "Nenhum fechamento auditável no recorte (sem regra, fora do escopo ou ordens de estrutura)." }]
            },
            {
                titulo: "Reaberturas e retrabalho", sub: "OS que voltaram", cor: "laranja", icone: "alerta",
                blocos: [{
                    t: "kpis", itens: [
                        { rotulo: "Reabertas", valor: IG.fmt(reabertas.length), sub: IG.pctDe(reabertas.length, fin.length), acao: abrirLista("Reabertas", "OS finalizadas que foram reabertas", reabertas) },
                        { rotulo: "Refechadas por outro", valor: IG.fmt(refechadas.length), cor: "laranja", acao: abrirLista("Refechadas por outro colaborador", "Reaberta e fechada de novo por outra pessoa", refechadas) },
                        { rotulo: "Logins com 3+ OS", valor: IG.fmt(logins3.size), sub: "recorrência", cor: "vermelho", acao: abrirLista("Logins com 3+ OS", "OS de clientes com 3 ou mais OS no período", osLogins3) },
                        { rotulo: "Duplicidade de equip.", valor: IG.fmt(duplicidade.length), acao: abrirLista("Duplicidade de equipamento", "Achado da auditoria", duplicidade) }
                    ]
                }]
            },
            {
                titulo: "Mensagem do fechamento", sub: "O técnico escreveu o que fez?", cor: "roxo", icone: "prancheta",
                blocos: [{
                    t: "destaque", fatias: [
                        { n: semTexto.length, cor: "laranja", rotulo: "Vazia ou curta" },
                        { n: fin.length - semTexto.length, cor: "verde", rotulo: "Com texto" }
                    ],
                    centro: IG.pctDe(semTexto.length, fin.length), sub: "sem texto útil", valor: IG.fmt(semTexto.length), corValor: "laranja",
                    texto: "fechamentos vazios ou com menos de 30 caracteres"
                }, {
                    t: "kpis", itens: [{ rotulo: "Ver as OS sem texto útil", valor: IG.fmt(semTexto.length), cor: "laranja", acao: abrirLista("Mensagem vazia ou curta", "Menos de 30 caracteres além do modelo de resposta", semTexto) }]
                }]
            }
        ];
    });

    // ---------- Ordens ----------
    registrarInfografico("ordens", async () => {
        const fin = finalizadas();
        if (!fin) return [];
        if (!fin.length) return vazio();
        const cidades = porCidade(fin, 12);
        return [
            {
                titulo: "Por cidade", sub: "OS finalizadas no período · clique para filtrar", cor: "azul", icone: "mapa", span: 2,
                blocos: [{ t: "colunas", cor: "azul", itens: cidades.map(c => ({ rotulo: c.rotulo, n: c.n, acao: filtrar("cidades", c.rotulo === "Sem cidade" ? "" : c.rotulo) })) }]
            },
            cartaoAssuntos(fin, "Por assunto", "Top 8")
        ];
    });

    // ---------- Técnicos ----------
    registrarInfografico("tecnicos", async () => {
        const fin = finalizadas();
        if (!fin) return [];
        if (!fin.length) return vazio();

        const porTec = new Map();
        for (const l of fin) {
            if (l.tipoDono !== "Campo") continue;
            const nome = nomeDono(l);
            if (!nome) continue;
            if (!porTec.has(nome)) porTec.set(nome, []);
            porTec.get(nome).push(l);
        }
        const tecnicos = [...porTec].map(([nome, ls]) => {
            const dias = new Set(ls.filter(l => l.fechamento instanceof Date).map(l => l.fechamento.toDateString())).size || 1;
            const erros = ls.filter(ehErro).length;
            const aud = ls.filter(ehAuditada).length;
            const tma = IG.mediana(ls.map(l => l.tmaMin));
            return { nome, os: ls.length, osdia: Math.round(ls.length / dias * 10) / 10, tma: tma === null ? null : Math.round(tma), taxa: aud ? Math.round(erros / aud * 1000) / 10 : null };
        }).sort((a, b) => b.os - a.os).slice(0, 12);

        if (!tecnicos.length) return [{
            titulo: "Técnicos de campo", sub: "Nenhum fechamento de técnico de campo no recorte", cor: "cinza", icone: "pessoa",
            blocos: [{ t: "nota", html: "As OS do recorte foram fechadas pelo COP/suporte ou por quem não tem setor no cadastro." }]
        }];

        const pilula = t => t === null ? { txt: "—", cor: "cinza" } : { txt: IG.pct(t), cor: t < 5 ? "verde" : t < 15 ? "laranja" : "vermelho" };
        return [
            {
                titulo: "Técnicos de campo com mais OS", sub: "Fechamentos no próprio nome · taxa de erro da auditoria", cor: "azul", icone: "pessoa", span: 2,
                blocos: [
                    {
                        t: "tabela", cab: ["Técnico", "OS", "OS/dia", "TMA (min)", "Erro"], num: [1, 2, 3],
                        linhas: tecnicos.map(t => ({ celulas: [t.nome, t.os, t.osdia, t.tma ?? "—", pilula(t.taxa)], acao: filtrar("operadores", t.nome) }))
                    },
                    { t: "nota", html: "OS/dia = OS ÷ dias com fechamento. Erro: verde abaixo de 5%, laranja até 15%, vermelho acima. Clique no técnico para filtrar." }
                ]
            },
            {
                titulo: "Volume por técnico", sub: "Top 12", cor: "verde", icone: "grafico",
                blocos: [{ t: "linhas", itens: tecnicos.map(t => ({ rotulo: t.nome, n: t.os, cor: "verde", extra: `${IG.fmt(t.osdia)}/dia`, acao: filtrar("operadores", t.nome) })) }]
            }
        ];
    });

    // ---------- Mapa de calor ----------
    registrarInfografico("mapa-calor", async () => {
        const fin = finalizadas();
        if (!fin) return [];
        if (!fin.length) return vazio();

        const todas = porCidade(fin, Infinity);
        const destaque = todas.slice(0, 7);
        const resto = todas.slice(7).reduce((s, c) => s + c.n, 0);
        const grupos = destaque.map((c, i) => ({ rotulo: c.rotulo, n: c.n, cor: IG_PALETA[i % (IG_PALETA.length - 1)] }));
        if (resto) grupos.push({ rotulo: "Outras cidades", n: resto, cor: "cinza" });
        const brutoEscala = fin.length / 100;
        const escala = brutoEscala <= 1 ? 1 : [2, 5, 10, 20, 25, 50, 100, 200, 500, 1000].find(e => e >= brutoEscala) ?? Math.ceil(brutoEscala);

        return [{
            titulo: "Concentração por cidade", sub: "OS finalizadas no recorte · o mapa interativo continua embaixo", cor: "vermelho", icone: "mapa", span: 3,
            blocos: [
                { t: "waffle", grupos, escala },
                {
                    t: "linhas", itens: todas.slice(0, 12).map((c, i) => ({
                        rotulo: c.rotulo, n: c.n, cor: i < 7 ? IG_PALETA[i % (IG_PALETA.length - 1)] : "cinza",
                        extra: IG.pctDe(c.n, fin.length), acao: filtrar("cidades", c.rotulo === "Sem cidade" ? "" : c.rotulo)
                    }))
                },
                { t: "nota", html: `Cada quadrado = ${escala === 1 ? "1 OS" : `${IG.fmt(escala)} OS`}. ${IG.fmt(todas.length)} cidade${todas.length === 1 ? "" : "s"} no recorte; clique numa cidade para filtrar.` }
            ]
        }];
    });
})();
