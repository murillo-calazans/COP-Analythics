/**
 * ==========================================================
 * Infográficos — Gestão de Clientes
 * ==========================================================
 * Quatro seções:
 * - "clientes-cto": cadastro de CTO/porta/lacre dos logins ativos. Só
 *   contagens (count/head) na clientes_cto, as mesmas da tela — nenhuma
 *   linha desce. Guardadas 10 min em memória.
 * - "ctos-lacres": ocupação das CTOs (logins_ativos ÷ portas do splitter).
 *   Sem baixar a tabela ctos: splitter 4/8/16 (99,6% das caixas) sai de
 *   contagens por faixa (count/head); só as poucas caixas com splitter fora
 *   disso (ou sem splitter, ~60) descem, com 2 colunas. Guardado 30 min (o
 *   robô atualiza a tabela 1x por dia).
 * - "alertas": recorrência já calculada (APP.indicadores.recorrenciaAlertas).
 * - "enderecos": resultado da tela (_enderecosResultado) ou
 *   EnderecoEngine.calcular sobre o recorte do Filtro Global (em memória).
 */

const IGC_TEMPO_CONTAGENS = 10 * 60 * 1000;
const IGC_TEMPO_CTOS = 30 * 60 * 1000;
let _igcContagens = null;   // { em, total, completos, semLacre, inativos, temAtivo }
let _igcOcupacao = null;    // { em, faixas: {...}, total }

// ---------- Cadastro na CTO ----------
async function igcContagensClientesCto() {
    if (_igcContagens && Date.now() - _igcContagens.em < IGC_TEMPO_CONTAGENS) return _igcContagens;
    if (typeof supabaseClient === "undefined" || typeof contarClientesCto !== "function") return null;
    // a tela descobre se a coluna "ativo" existe (patch-26); sem ela, não há o alerta de inativos
    const temAtivo = typeof _clientesCtoTemAtivo === "undefined" ? true : _clientesCtoTemAtivo;
    const [total, completos, semLacre, inativos] = await Promise.all([
        contarClientesCto("todos"),
        contarClientesCto("completo"),
        contarClientesCto("semLacre"),
        temAtivo ? contarClientesCto("inativoCadastrado") : Promise.resolve(0)
    ]);
    return (_igcContagens = { em: Date.now(), total, completos, semLacre, inativos, temAtivo });
}

/** Clique num número do painel = mesmo filtro do card da tela (lista logo abaixo). */
function igcFiltrarClientesCto(filtro) {
    if (typeof buscarListaClientesCto !== "function") return;
    _clientesCtoFiltro = filtro;
    document.querySelectorAll("[data-filtro-clientes-cto]").forEach(b =>
        b.classList.toggle("ativo", b.dataset.filtroClientesCto === filtro));
    buscarListaClientesCto(++_clientesCtoToken);
    document.getElementById("listaClientesCto")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

registrarInfografico("clientes-cto", async () => {
    let c;
    try { c = await igcContagensClientesCto(); } catch (erro) { console.warn("Infográfico Cadastro na CTO:", erro); return []; }
    if (!c || !c.total) return [];
    const semCadastro = Math.max(0, c.total - c.completos);
    const temLacre = c.semLacre < c.total;   // visão sem lacre nenhum = coluna vazia, card some (igual à tela)
    const cartoes = [
        {
            titulo: "Logins com CTO e porta", sub: "Clientes ativos", cor: "verde", icone: "lupa",
            blocos: [{ t: "destaque", fatias: [{ rotulo: "Com CTO e porta", n: c.completos, cor: "verde" }, { rotulo: "Sem cadastro", n: semCadastro, cor: "laranja" }],
                centro: IG.fmt(c.total), sub: "logins ativos", valor: IG.pctDe(c.completos, c.total), corValor: "verde",
                texto: "dos logins ativos têm <b>CTO e porta</b> cadastrados" }]
        },
        {
            titulo: "O que falta cadastrar", sub: "Logins ativos", cor: "laranja", icone: "alerta",
            blocos: [{ t: "linhas", total: c.total, itens: [
                { rotulo: "Sem CTO/porta", n: semCadastro, cor: "laranja", extra: IG.pctDe(semCadastro, c.total), acao: () => igcFiltrarClientesCto("incompleto") },
                temLacre ? { rotulo: "Sem lacre", n: c.semLacre, cor: "roxo", extra: IG.pctDe(c.semLacre, c.total), acao: () => igcFiltrarClientesCto("semLacre") } : null
            ].filter(Boolean) }, { t: "nota", html: "Clique pra filtrar a lista abaixo." }]
        }
    ];
    if (c.temAtivo) {
        cartoes.push({
            titulo: "Inativos ocupando porta", sub: "Login inativo ainda cadastrado na CTO", cor: "vermelho", icone: "cadeado",
            blocos: [
                { t: "kpis", itens: [{ rotulo: "Portas a liberar no IXC", valor: IG.fmt(c.inativos), cor: c.inativos ? "vermelho" : "verde",
                    acao: c.inativos ? () => igcFiltrarClientesCto("inativoCadastrado") : null }] },
                { t: "nota", html: c.inativos ? "Liberar essas portas aumenta a capacidade das CTOs sem obra." : "Nenhum login inativo ocupando porta." }
            ]
        });
    }
    return cartoes;
});

// ---------- CTOs e Lacres: ocupação ----------
const IGC_FAIXAS_OCUPACAO = [
    { id: "lotada", rotulo: "Lotada (100%+)", cor: "vermelho" },
    { id: "f80", rotulo: "80–99%", cor: "laranja" },
    { id: "f50", rotulo: "50–79%", cor: "azul" },
    { id: "f1", rotulo: "1–49%", cor: "verde" },
    { id: "vazia", rotulo: "Vazia", cor: "cinza" },
    { id: "semSplitter", rotulo: "Sem splitter", cor: "#cbd5e1" }
];
const IGC_SPLITTERS_COMUNS = [4, 8, 16];

function igcFaixaOcupacao(logins, portas) {
    if (!portas) return "semSplitter";
    if (!logins) return "vazia";
    const r = logins / portas;
    return r >= 1 ? "lotada" : r >= 0.8 ? "f80" : r >= 0.5 ? "f50" : "f1";
}

async function igcOcupacaoCtos() {
    if (_igcOcupacao && Date.now() - _igcOcupacao.em < IGC_TEMPO_CTOS) return _igcOcupacao;
    if (typeof supabaseClient === "undefined") return null;
    const contar = async (splitter, minimo) => {
        let q = supabaseClient.from("ctos").select("descricao", { count: "exact", head: true }).eq("splitter", String(splitter));
        if (minimo > 0) q = q.gte("logins_ativos", minimo);
        const { count, error } = await q;
        if (error) throw error;
        return count ?? 0;
    };
    const faixas = Object.fromEntries(IGC_FAIXAS_OCUPACAO.map(f => [f.id, 0]));
    // por splitter comum: total e "pelo menos N logins" nos cortes de 1, 50%, 80% e 100%
    await Promise.all(IGC_SPLITTERS_COMUNS.map(async s => {
        const [total, g1, g50, g80, g100] = await Promise.all([0, 1, Math.ceil(s * 0.5), Math.ceil(s * 0.8), s].map(m => contar(s, m)));
        faixas.lotada += g100;
        faixas.f80 += g80 - g100;
        faixas.f50 += g50 - g80;
        faixas.f1 += g1 - g50;
        faixas.vazia += total - g1;
    }));
    // o resto (splitter raro ou vazio) é pouco: desce só splitter + logins
    const { data, error } = await supabaseClient.from("ctos").select("splitter, logins_ativos")
        .or(`splitter.is.null,splitter.not.in.(${IGC_SPLITTERS_COMUNS.join(",")})`).limit(2000);
    if (error) throw error;
    for (const r of data ?? []) faixas[igcFaixaOcupacao(r.logins_ativos || 0, parseInt(r.splitter, 10) || 0)]++;
    const total = Object.values(faixas).reduce((s, n) => s + n, 0);
    return (_igcOcupacao = { em: Date.now(), faixas, total });
}

registrarInfografico("ctos-lacres", async () => {
    let o;
    try { o = await igcOcupacaoCtos(); } catch (erro) { console.warn("Infográfico CTOs:", erro); return []; }
    if (!o || !o.total) return [];
    const f = o.faixas;
    const grupos = IGC_FAIXAS_OCUPACAO.map(x => ({ rotulo: x.rotulo, n: f[x.id], cor: x.cor })).filter(g => g.n || g.rotulo !== "Sem splitter");
    const limite = f.lotada + f.f80;
    return [
        {
            titulo: "Ocupação das CTOs", sub: "Logins ativos ÷ portas do splitter", cor: "ciano", icone: "caixa", span: 2,
            blocos: [
                { t: "empilhada", grupos },
                { t: "colunas", itens: IGC_FAIXAS_OCUPACAO.filter(x => x.id !== "semSplitter").map(x => ({ rotulo: x.rotulo, n: f[x.id], cor: x.cor })) },
                { t: "nota", html: "CTO sem nenhum login ativo não vem na visão do IXC, então “Vazia” só conta as que vieram com 0." }
            ]
        },
        {
            titulo: "CTOs no limite", sub: `${IG.fmt(o.total)} CTOs no IXC`, cor: "vermelho", icone: "alerta",
            blocos: [
                { t: "destaque", fatias: [{ rotulo: "80%+", n: limite, cor: "vermelho" }, { rotulo: "abaixo de 80%", n: o.total - limite, cor: "ciano" }],
                    centro: IG.fmt(limite), sub: "CTOs 80%+", valor: IG.fmt(f.lotada), corValor: "vermelho", texto: "CTOs <b>lotadas</b> (sem porta livre)" },
                { t: "kpis", itens: [
                    { rotulo: "Lotadas", valor: IG.fmt(f.lotada), sub: IG.pctDe(f.lotada, o.total), cor: "vermelho" },
                    { rotulo: "80–99%", valor: IG.fmt(f.f80), sub: IG.pctDe(f.f80, o.total), cor: "laranja" }
                ] }
            ]
        }
    ];
});

// ---------- Alertas (recorrência) ----------
registrarInfografico("alertas", async () => {
    const rec = APP?.indicadores?.recorrenciaAlertas;
    if (!rec || !rec.size) return [];
    const lista = [...rec.values()];
    const ativos = lista.filter(i => !i.cancelado);
    const cancelados = lista.filter(i => i.cancelado);
    const totalOS = lista.reduce((s, i) => s + (i.totalOS || 0), 0);
    const cidades = IG.contar(lista, i => i.cidade || "(sem cidade)", 8);
    const nCidades = new Set(lista.map(i => i.cidade || "(sem cidade)")).size;
    const motor = typeof IndicatorEngine !== "undefined" ? IndicatorEngine : {};
    const qtd = motor.LIMITE_QTD_RECORRENCIA ?? 2, dias = motor.LIMITE_DIAS_RECORRENCIA ?? 90;
    const { dataInicio, dataFim } = APP.filtrosAlertas ?? {};
    const dm = d => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    const periodo = dataInicio || dataFim ? `${dataInicio ? dm(dataInicio) : "início"}–${dataFim ? dm(dataFim) : "hoje"}` : "Histórico inteiro";
    const abrir = login => typeof abrirModalCliente === "function" ? () => abrirModalCliente(login) : null;
    const topo = [...ativos].sort((a, b) => b.totalOS - a.totalOS).slice(0, 6);

    return [
        {
            titulo: "Clientes recorrentes", sub: `Logins com ${qtd}+ OS em ${dias} dias`, cor: "vermelho", icone: "alerta",
            blocos: [
                { t: "destaque", fatias: [{ rotulo: "Ativos recorrentes", n: ativos.length, cor: "vermelho" }, { rotulo: "Cancelados", n: cancelados.length, cor: "cinza" }],
                    centro: IG.fmt(lista.length), sub: "clientes", valor: IG.fmt(cancelados.length), corValor: "cinza", texto: "já <b>cancelaram</b>" },
                { t: "kpis", itens: [
                    { rotulo: "Recorrentes ativos", valor: IG.fmt(ativos.length), cor: "vermelho" },
                    { rotulo: "OS na recorrência", valor: IG.fmt(totalOS) },
                    { rotulo: "Período", valor: periodo }
                ] }
            ]
        },
        {
            titulo: "Por cidade", sub: `Ativos + cancelados · ${IG.fmt(nCidades)} cidades`, cor: "laranja", icone: "mapa",
            blocos: [{ t: "linhas", itens: cidades.map(c => ({ rotulo: c.rotulo, n: c.n, cor: "laranja", extra: IG.pctDe(c.n, lista.length) })) }]
        },
        topo.length ? {
            titulo: "Quem mais voltou", sub: "Ativos com mais OS na janela", cor: "roxo", icone: "pessoa",
            blocos: [{ t: "linhas", itens: topo.map(i => ({ rotulo: i.cliente || i.login, titulo: `${i.cliente ?? ""} (${i.login})`, n: i.totalOS, cor: "roxo", extra: "OS", acao: abrir(i.login) })) },
                { t: "nota", html: "Clique pra abrir a ficha do cliente." }]
        } : null
    ].filter(Boolean);
});

// ---------- Endereços a corrigir ----------
function igcFiltrarEnderecos(filtro) {
    if (typeof desenharListaEnderecos !== "function") return;
    _enderecosFiltro = filtro;
    document.querySelectorAll("[data-filtro-enderecos]").forEach(b => b.classList.toggle("ativo", b.dataset.filtroEnderecos === filtro));
    desenharListaEnderecos();
    document.getElementById("listaEnderecos")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

registrarInfografico("enderecos", async () => {
    let res = typeof _enderecosResultado !== "undefined" ? _enderecosResultado : null;
    if (!res) {
        if (!APP?.status?.baseCarregada || typeof EnderecoEngine === "undefined") return [];
        const ordens = FiltroEngine.ordensFiltradas();
        if (!ordens?.size) return [];
        res = EnderecoEngine.calcular(ordens);
    }
    const r = res.resumo;
    if (!r.logins && !r.jaCorrigidos) return [];

    const rotas = IG.contar(res.logins.filter(l => l.cidadeProvavel),
        l => `${l.cidadeCadastrada || "(em branco)"} → ${l.cidadeProvavel}`, 8);
    const cartoes = [{
        titulo: "Endereços a corrigir", sub: "Cidade do IXC × GPS da OS", cor: "roxo", icone: "mapa",
        blocos: [
            { t: "destaque", fatias: [{ rotulo: "Confiança alta", n: r.confiancaAlta, cor: "vermelho" }, { rotulo: "Média / sem GPS", n: r.logins - r.confiancaAlta, cor: "roxo" }],
                centro: IG.fmt(r.logins), sub: "logins", valor: IG.fmt(r.jaCorrigidos), corValor: "verde", texto: "logins <b>já corrigidos</b> no IXC" },
            { t: "kpis", itens: [
                { rotulo: "OS afetadas", valor: IG.fmt(r.osAfetadas), acao: () => igcFiltrarEnderecos("todos") },
                { rotulo: "Confiança alta", valor: IG.fmt(r.confiancaAlta), cor: "vermelho", acao: () => igcFiltrarEnderecos("alta") },
                { rotulo: "Fora da área", valor: IG.fmt(r.foraDaArea), cor: "laranja", acao: () => igcFiltrarEnderecos("foraDaArea") }
            ] }
        ]
    }];
    if (rotas.length) {
        cartoes.push({
            titulo: "Para onde o GPS aponta", sub: "Cidade cadastrada → cidade pelo GPS", cor: "roxo", icone: "caminhao", span: 2,
            blocos: [{ t: "linhas", itens: rotas.map(x => ({ rotulo: x.rotulo, n: x.n, cor: "roxo", extra: x.n === 1 ? "login" : "logins" })) }]
        });
    }
    return cartoes;
});
