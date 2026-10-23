/**
 * ==========================================================
 * Infográfico — Gestão de Ordens (seção "agenda-hoje")
 * ==========================================================
 * Retrato do que está EM ABERTO (aba "Em aberto", js/ui/agendabacklog.js):
 * agendadas × sem agendamento, idade das OS, pedidos de prioridade, assunto,
 * cidade e bairros fora do normal.
 *
 * Não faz consulta nova: usa agendaBacklogCache (montado pela aba) ou a
 * mesma busca compartilhada da os_pendentes (buscarOsPendentesCacheado, que
 * guarda a promessa por ~2 min — a aba e o painel inicial pedem a mesma).
 * Agenda IXC / Agenda IA ficam de fora (sem dado pronto pra resumir).
 */

/** Backlog de campo em aberto, reaproveitando o cache da aba. */
async function igoBacklog() {
    if (typeof agendaBacklogCache !== "undefined" && agendaBacklogCache?.itens) return agendaBacklogCache;
    if (typeof buscarOsPendentesCacheado !== "function" || typeof montarBacklog !== "function") return null;
    const linhas = await buscarOsPendentesCacheado();
    // a aba pode ter terminado de montar enquanto a busca (compartilhada) corria
    if (agendaBacklogCache?.itens) return agendaBacklogCache;
    const modelo = montarBacklog(linhas);
    if (!agendaBacklogCache) agendaBacklogCache = modelo;
    return modelo;
}

/** Dias corridos entre a abertura e hoje (0 = aberta hoje). */
function igoDiasAberta(abertura, hoje) {
    if (!abertura) return null;
    const d0 = new Date(abertura.getFullYear(), abertura.getMonth(), abertura.getDate());
    return Math.max(0, Math.round((hoje.getTime() - d0.getTime()) / 86400000));
}

const IGO_FAIXAS_IDADE = [
    { rotulo: "Hoje", cor: "azul", de: 0, ate: 0 },
    { rotulo: "1 dia", cor: "azul", de: 1, ate: 1 },
    { rotulo: "2 dias", cor: "azul", de: 2, ate: 2 },
    { rotulo: "3 dias", cor: "laranja", de: 3, ate: 3 },
    { rotulo: "4–10 dias", cor: "laranja", de: 4, ate: 10 },
    { rotulo: "+10 dias", cor: "vermelho", de: 11, ate: Infinity }
];

const IGO_PRIO_GRUPOS = [
    { id: "semAgenda", rotulo: "Sem agendamento", cor: "vermelho" },
    { id: "agendada", rotulo: "Agendadas", cor: "azul" },
    { id: "assumida", rotulo: "Assumidas", cor: "roxo" },
    { id: "desloc", rotulo: "Em deslocamento", cor: "ciano" },
    { id: "exec", rotulo: "Em execução", cor: "laranja" },
    { id: "finalizada", rotulo: "Finalizadas hoje", cor: "verde" }
];

/**
 * Pedidos de prioridade (PrioridadeEngine) — mesma regra de
 * calcularPrioridadesPainel (js/ui/paineloperacao.js), mas sobre o backlog já
 * montado (sem refazer o montarBacklog).
 */
function igoPrioridades(modelo, hoje) {
    const grupos = Object.fromEntries(IGO_PRIO_GRUPOS.map(g => [g.id, []]));
    if (typeof PrioridadeEngine === "undefined") return null;
    const norm = typeof ixcNorm === "function" ? ixcNorm : (t => String(t ?? "").toLowerCase());
    for (const o of modelo.itens) {
        const pedidos = PrioridadeEngine.pedidosDaOS(modelo.eventosPorOs?.[String(o.id)]);
        if (!pedidos.length) continue;
        const st = norm(o.status);
        const item = { ...o, pedidos };
        if (st === "deslocamento") grupos.desloc.push(item);
        else if (st.includes("execu")) grupos.exec.push(item);
        else if (o.assumida) grupos.assumida.push(item);
        else if (o.agendada) grupos.agendada.push(item);
        else grupos.semAgenda.push(item);
    }
    // finalizadas hoje que tinham pedido (relatório de ordens — já em memória)
    const amanha = hoje.getTime() + 86400000;
    for (const ordem of APP?.dados?.ordens?.values?.() ?? []) {
        const df = ordem.dataFechamento;
        if (!df || df.getTime() < hoje.getTime() || df.getTime() >= amanha || norm(ordem.statusAtual) !== "finalizada") continue;
        const pedidos = PrioridadeEngine.pedidosDaOS(ordem.movimentacoes);
        if (pedidos.length) grupos.finalizada.push({ id: ordem.id, cliente: ordem.cliente, cidade: ordem.cidade, bairro: ordem.bairro, assunto: ordem.assunto, hora: df, pedidos, fechada: true });
    }
    const todos = Object.values(grupos).flat();
    return { grupos, total: todos.length, insistentes: todos.filter(i => i.pedidos.length >= 2).length };
}

const IGO_SITUACAO_PILULA = {
    branco: { txt: "Em branco", cor: "vermelho" },
    "outra-cidade": { txt: "Outra cidade", cor: "vermelho" },
    novo: { txt: "Nunca apareceu", cor: "laranja" },
    raro: { txt: "Raro", cor: "cinza" },
    variacao: { txt: "Escrito diferente", cor: "roxo" }
};

function igoDetalheBairro(s) {
    const partes = [];
    if (s.tipo === "outra-cidade") partes.push(`comum em ${s.cidadeOutra} (${IG.fmt(s.qtdOutra)} OS)`);
    else if (s.tipo === "variacao") partes.push(`costuma vir como ${s.comoCostuma}`);
    else if (s.tipo === "raro") partes.push(`${IG.fmt(s.qtd)} OS no histórico`);
    if (s.regiao) partes.push(`região ${s.regiao}`);
    return partes.join(" · ") || "—";
}

/** Cartão "Bairros fora do normal" (mesma conferência da aba: histórico da cidade + mapa de regiões). */
async function igoCartaoBairros(itens) {
    if (typeof situacaoBairroBacklog !== "function" || typeof historicoBairrosBacklog !== "function") return null;
    const hist = historicoBairrosBacklog();
    let idx = null;
    try { idx = typeof mapaBairrosBacklog === "function" ? await mapaBairrosBacklog() : null; } catch { idx = null; }
    const base = { titulo: "Bairros fora do normal", cor: "roxo", icone: "mapa", span: 3 };
    if (!hist) {
        return { ...base, sub: "Bairro como está na OS × histórico da cidade",
            blocos: [{ t: "nota", html: "Carregue a base de OS (relatório de ordens) pra conferir os bairros com o histórico de cada cidade." }] };
    }

    const grupos = new Map();
    for (const o of itens) {
        const cidade = o.cidade || "—";
        const nome = String(o.bairroOriginal ?? "").trim();
        const chave = `${cidade}|${nome}`;
        if (!grupos.has(chave)) grupos.set(chave, { cidade, nome, oss: [] });
        grupos.get(chave).oss.push(o);
    }
    const lista = [...grupos.values()];
    for (const g of lista) g.situacao = situacaoBairroBacklog(hist, idx, g.cidade, g.nome);
    const ordem = typeof SITUACAO_BAIRRO_BACKLOG !== "undefined" ? SITUACAO_BAIRRO_BACKLOG : {};
    const estranhos = lista.filter(g => IGO_SITUACAO_PILULA[g.situacao.tipo])
        .sort((a, b) => (ordem[a.situacao.tipo]?.ordem ?? 9) - (ordem[b.situacao.tipo]?.ordem ?? 9)
            || b.oss.length - a.oss.length || a.cidade.localeCompare(b.cidade, "pt-BR"));
    const osEstranhas = estranhos.reduce((s, g) => s + g.oss.length, 0);
    const TETO = 12;

    return {
        ...base,
        sub: `${IG.fmt(lista.length)} bairros com OS em aberto · ${IG.fmt(estranhos.length)} fora do normal`,
        selo: estranhos.length ? `${IG.fmt(osEstranhas)} OS` : "",
        blocos: [
            estranhos.length
                ? {
                    t: "tabela", cab: ["Cidade", "Bairro na OS", "OS", "Situação", "Detalhe"], num: [2],
                    linhas: estranhos.slice(0, TETO).map(g => ({
                        celulas: [g.cidade, g.nome || "(em branco)", g.oss.length, IGO_SITUACAO_PILULA[g.situacao.tipo], igoDetalheBairro(g.situacao)],
                        acao: () => abrirPopupBacklog(`${g.nome || "(bairro em branco)"} · ${g.cidade}`, g.oss)
                    }))
                }
                : { t: "nota", html: "Nenhum bairro fora do normal nas OS em aberto." },
            estranhos.length > TETO ? { t: "nota", html: `Mostrando os ${TETO} primeiros — a lista completa está em <b>Bairros em aberto</b>, logo abaixo.` } : null
        ]
    };
}

registrarInfografico("agenda-hoje", async () => {
    const modelo = await igoBacklog();
    if (!modelo || !modelo.total) return [];
    const hoje = typeof ixcMeiaNoite === "function" ? ixcMeiaNoite() : new Date(new Date().setHours(0, 0, 0, 0));
    const itens = modelo.itens;
    const total = itens.length;
    const pop = (titulo, oss) => () => abrirPopupBacklog(titulo, oss);
    const cartoes = [];

    // 1) Agendadas × sem agendamento + KPIs da aba
    const agendadas = itens.filter(i => i.agendada);
    const semAgenda = itens.filter(i => !i.agendada);
    const reagendadas = itens.filter(i => i.reagendamentos > 0);
    const assumidas = itens.filter(i => i.assumida);
    const antigas = itens.filter(i => i.antiga);
    cartoes.push({
        titulo: "OS de campo em aberto", sub: "Agendadas × sem agendamento", cor: "azul", icone: "caixa",
        blocos: [
            { t: "destaque", fatias: [{ rotulo: "Agendadas", n: agendadas.length, cor: "azul" }, { rotulo: "Sem agendamento", n: semAgenda.length, cor: "laranja" }],
                centro: IG.fmt(total), sub: "em aberto", valor: IG.pctDe(semAgenda.length, total), corValor: "laranja", texto: "ainda <b>sem agendamento</b>" },
            { t: "kpis", itens: [
                { rotulo: "Agendadas", valor: IG.fmt(agendadas.length), cor: "azul", acao: pop("Agendadas", agendadas) },
                { rotulo: "Reagendadas", valor: IG.fmt(reagendadas.length), cor: "laranja", acao: pop("Reagendadas", reagendadas) },
                { rotulo: "Assumidas", valor: IG.fmt(assumidas.length), cor: "roxo", acao: pop("Assumidas", assumidas) },
                { rotulo: `+${typeof BACKLOG_DIAS_ANTIGA !== "undefined" ? BACKLOG_DIAS_ANTIGA : 3} dias`, valor: IG.fmt(antigas.length), cor: "vermelho", acao: pop("Mais de 3 dias em aberto", antigas) }
            ] }
        ]
    });

    // 2) Idade pela abertura
    const faixas = IGO_FAIXAS_IDADE.map(f => ({ ...f, oss: [] }));
    let semData = 0;
    for (const o of itens) {
        const d = igoDiasAberta(o.abertura, hoje);
        if (d === null) { semData++; continue; }
        faixas.find(f => d >= f.de && d <= f.ate)?.oss.push(o);
    }
    const velhas = faixas[faixas.length - 1].oss.length;
    cartoes.push({
        titulo: "Há quanto tempo estão abertas", sub: "Idade das OS de campo (pela abertura)", cor: "laranja", icone: "relogio",
        blocos: [
            { t: "colunas", itens: faixas.map(f => ({ rotulo: f.rotulo, n: f.oss.length, cor: f.cor, acao: f.oss.length ? pop(`Abertas: ${f.rotulo}`, f.oss) : null })) },
            { t: "nota", html: (velhas ? `<b>${IG.fmt(velhas)} OS</b> abertas há mais de 10 dias.` : "Nenhuma OS aberta há mais de 10 dias.")
                + (semData ? ` ${IG.fmt(semData)} sem data de abertura.` : "") }
        ]
    });

    // 3) Pedidos de prioridade
    const prio = igoPrioridades(modelo, hoje);
    if (prio) {
        const gruposComOs = IGO_PRIO_GRUPOS.filter(g => prio.grupos[g.id].length);
        const abrir = g => () => {
            const lista = prio.grupos[g.id];
            if (g.id === "finalizada" && typeof abrirPopupPrioridade === "function") abrirPopupPrioridade(`Pedido de prioridade · ${g.rotulo}`, lista);
            else abrirPopupBacklog(`Pedido de prioridade · ${g.rotulo}`, lista);
        };
        cartoes.push({
            titulo: "Pedidos de prioridade", sub: "Com pedido de urgência nas mensagens", cor: "vermelho", icone: "alerta",
            selo: prio.insistentes ? `${IG.fmt(prio.insistentes)} pediram 2x+` : "",
            blocos: prio.total
                ? [
                    { t: "waffle", grupos: gruposComOs.map(g => ({ rotulo: g.rotulo, n: prio.grupos[g.id].length, cor: g.cor })) },
                    { t: "linhas", total: prio.total, itens: gruposComOs.map(g => ({ rotulo: g.rotulo, n: prio.grupos[g.id].length, cor: g.cor, extra: IG.pctDe(prio.grupos[g.id].length, prio.total), acao: abrir(g) })) }
                ]
                : [{ t: "nota", html: "Nenhuma OS de campo em aberto com pedido de prioridade ou urgência nas mensagens." }]
        });
    }

    // 4) Por assunto (assunto unificado: interno + terceirizado juntos)
    const unificar = typeof assuntoUnificado === "function" ? assuntoUnificado : (a => a);
    const porAssunto = new Map();
    for (const o of itens) {
        const k = unificar(o.assunto);
        if (!porAssunto.has(k)) porAssunto.set(k, []);
        porAssunto.get(k).push(o);
    }
    const assuntos = [...porAssunto].sort((a, b) => b[1].length - a[1].length).slice(0, 10);
    cartoes.push({
        titulo: "Por assunto", sub: `Top ${assuntos.length} em aberto`, cor: "verde", icone: "lista",
        blocos: [{ t: "linhas", itens: assuntos.map(([a, oss]) => ({ rotulo: IG.assuntoCurto(a), titulo: a, n: oss.length, cor: "verde", extra: IG.pctDe(oss.length, total), acao: pop(IG.assuntoCurto(a), oss) })) }]
    });

    // 5) Por cidade
    const porCidade = new Map();
    for (const o of itens) { const c = o.cidade || "—"; if (!porCidade.has(c)) porCidade.set(c, []); porCidade.get(c).push(o); }
    const cidades = [...porCidade].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "pt-BR")).slice(0, 12);
    cartoes.push({
        titulo: "Por cidade", sub: "OS de campo em aberto", cor: "azul", icone: "mapa", span: 2,
        blocos: [{ t: "colunas", cor: "azul", itens: cidades.map(([c, oss]) => ({ rotulo: c, n: oss.length, acao: pop(c, oss) })) }]
    });

    // 6) Bairros fora do normal
    const bairros = await igoCartaoBairros(itens);
    if (bairros) cartoes.push(bairros);

    return cartoes;
});
