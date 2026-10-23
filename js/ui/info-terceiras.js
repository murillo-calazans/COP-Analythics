/**
 * ==========================================================
 * Infográficos — Gestão de Terceiras
 * ==========================================================
 * Painéis no topo das abas terceiras, terceiras-fechamento, terceiras-lpu
 * e terceiras-qualidade (desenho: js/ui/infograficos.js).
 *
 * Tudo sai do que a própria Gestão de Terceiras já calcula, no MÊS da tela
 * (mesAtualTerceiras / seletor "Mês"), não do Filtro Global — pagamento
 * não depende do recorte (ver js/engine/terceirasengine.js):
 *   - OS e valor: TerceirasEngine.itensDoMes com a LPU salva no site
 *     (carregarConfigTerceiras); mês já fechado vale o congelado
 *     (carregarFechamentosDoMes), igual ao Painel da aba.
 *   - TMA, erro de fechamento e reabertura: da mesma análise de eventos
 *     (analiseTerceiras) + resultadoAuditoriaOS (js/services/relatorios.js).
 *   - Qualidade: TerceirasEngine.qualidadeDoMes. LPU: TerceirasEngine.catalogo.
 */

const IG_TER_CORES = { AZUL: "azul", VELOZ: "laranja", TECHNOMAIS: "verde" };
const IG_TER_CORES_EXTRA = ["roxo", "ciano", "rosa", "cinza"];
let _igTerMemo = { chave: null, dados: null };

function igTerCor(id) {
    if (IG_TER_CORES[id]) return IG_TER_CORES[id];
    const extras = TERCEIRAS.filter(t => !IG_TER_CORES[t.id]);
    const i = extras.findIndex(t => t.id === id);
    return IG_TER_CORES_EXTRA[Math.max(0, i) % IG_TER_CORES_EXTRA.length];
}

function igTerNomeMes(mes) {
    return typeof nomeMes === "function" ? nomeMes(mes) : mes;
}

/** "R$ 135 mil" pro centro da rosca (cabe no anel); abaixo de mil, o valor cheio. */
function igTerRealCurto(v) {
    if (v >= 1000000) return `R$ ${(v / 1000000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
    if (v >= 1000) return `R$ ${Math.round(v / 1000).toLocaleString("pt-BR")} mil`;
    return IG.real(v);
}

function igTerAbrirFechamento(id) {
    return () => {
        if (typeof terceiraSelecionada !== "undefined") terceiraSelecionada = id;
        if (typeof mostrarSecao === "function") mostrarSecao("terceiras-fechamento");
    };
}

function igTerBaseCarregada() {
    return !!(APP?.status?.baseCarregada && APP.dados?.ordens?.size);
}

/**
 * Dados do mês da tela, por terceirizada. Lê LPU e fechamentos pelos
 * mesmos carregadores (cacheados) da aba. null = sem base carregada.
 */
async function igTerDadosDoMes() {
    if (!igTerBaseCarregada()) return null;
    const mes = mesAtualTerceiras();
    const [config, fechamentos] = await Promise.all([carregarConfigTerceiras(), carregarFechamentosDoMes(mes)]);
    const analise = analiseTerceiras();

    const ordens = APP.dados.ordens;
    const chave = `${mes}|${ordens.size}|${APP.status?.ultimaCarga ?? ""}|${config.atualizado_em ?? ""}|${[...fechamentos.values()].map(f => `${f.terceira}:${f.aprovado_em}`).join(",")}`;
    if (_igTerMemo.chave === chave) return _igTerMemo.dados;

    const itens = TerceirasEngine.itensDoMes(mes, config, analise);

    // OS "do mês" (abertas ou fechadas nele) por login — recorrência do cliente.
    const porLogin = new Map();
    let fechadasNoMes = 0;
    for (const ordem of ordens.values()) {
        const efetivo = analise.get(ordem.id)?.fechamentoEfetivo;
        const fechadaNoMes = !!(efetivo?.data && TerceirasEngine.chaveMes(efetivo.data) === mes);
        if (fechadaNoMes) fechadasNoMes++;
        const abertaNoMes = !!(ordem.dataAbertura && TerceirasEngine.chaveMes(ordem.dataAbertura) === mes);
        if (ordem.login && (fechadaNoMes || abertaNoMes)) porLogin.set(ordem.login, (porLogin.get(ordem.login) ?? 0) + 1);
    }

    const empresas = TERCEIRAS.map(t => {
        const fechado = fechamentos.get(t.id) ?? null;
        const itensT = fechado ? (fechado.itens ?? []) : itens.filter(i => i.terceira === t.id);
        const resumo = TerceirasEngine.resumir(itensT);
        const tmas = [];
        let erros = 0, auditadas = 0, reabertas = 0, loginRepetido = 0;
        for (const item of itensT) {
            const ordem = ordens.get(item.os);
            const info = analise.get(item.os);
            if (!ordem || !info) continue;
            if (info.temReabertura) reabertas++;
            if (!info.excluidoDoTempo) {
                const horas = IndicatorEngine.somarHorasSegmentos(info.segmentosAtendimento ?? []);
                if (horas !== null && !Number.isNaN(horas)) tmas.push(horas * 60);
            }
            if (typeof resultadoAuditoriaOS === "function") {
                const rotulo = resultadoAuditoriaOS(ordem, info).rotulo ?? "";
                if (rotulo === "OK") auditadas++;
                else if (rotulo.startsWith("Erro")) { erros++; auditadas++; }
            }
            if (ordem.login && (porLogin.get(ordem.login) ?? 0) >= 2) loginRepetido++;
        }
        const tma = IG.mediana(tmas);
        return {
            id: t.id, nome: t.nome, cor: igTerCor(t.id), fechado, itens: itensT, resumo,
            os: itensT.length,
            tma: tma === null ? null : Math.round(tma),
            taxaErro: auditadas ? erros / auditadas * 100 : null,
            erros, auditadas, reabertas, loginRepetido,
            pendencias: resumo.semPreco + resumo.diagPendente,
            cidades: IG.contar(itensT, i => i.cidade || null, 4),
            assuntos: IG.contar(itensT, i => i.assunto ? IG.assuntoCurto(i.assunto) : null, 4)
        };
    });

    const dados = { mes, config, analise, empresas, fechadasNoMes, totalOS: empresas.reduce((s, e) => s + e.os, 0) };
    _igTerMemo = { chave, dados };
    return dados;
}

function igTerPillErro(taxa) {
    if (taxa === null) return { txt: "—", cor: "cinza" };
    return { txt: IG.pct(taxa), cor: taxa < 3 ? "verde" : taxa < 15 ? "laranja" : "vermelho" };
}

function igTerCartaoVazio(titulo, mes, texto) {
    return [{ titulo, sub: igTerNomeMes(mes), cor: "cinza", icone: "equipe", span: 3, blocos: [{ t: "nota", html: texto }] }];
}

// ---------- Painel ----------
registrarInfografico("terceiras", async () => {
    const d = await igTerDadosDoMes();
    if (!d) return [];
    const mesTxt = igTerNomeMes(d.mes);
    if (!d.totalOS) return igTerCartaoVazio("OS das terceirizadas", d.mes, `Nenhuma OS fechada por terceirizada em <b>${IG.esc(mesTxt.toLowerCase())}</b>.`);

    const comOS = d.empresas.filter(e => e.os > 0);
    return [
        {
            titulo: "OS das terceirizadas", sub: "Divisão por empresa", cor: "azul", icone: "equipe", selo: mesTxt,
            blocos: [
                {
                    t: "destaque", fatias: d.empresas.map(e => ({ rotulo: e.nome, n: e.os, cor: e.cor })),
                    centro: IG.fmt(d.totalOS), sub: "OS", valor: IG.pctDe(d.totalOS, d.fechadasNoMes),
                    texto: `das ${IG.fmt(d.fechadasNoMes)} OS fechadas no mês foram feitas por terceirizadas`
                },
                { t: "linhas", itens: d.empresas.map(e => ({ rotulo: e.nome, n: e.os, cor: e.cor, extra: IG.pctDe(e.os, d.totalOS), acao: igTerAbrirFechamento(e.id) })) }
            ]
        },
        {
            titulo: "Comparativo", sub: "Tempo, erro e retrabalho", cor: "roxo", icone: "grafico", span: 2,
            blocos: [
                {
                    t: "tabela", cab: ["Empresa", "OS", "TMA (min)", "Erro de fechamento", "Reabertas", "Login com 2+ OS"], num: [1, 2, 4, 5],
                    linhas: comOS.map(e => ({
                        celulas: [{ txt: e.nome, cor: e.cor }, e.os, e.tma ?? "—", igTerPillErro(e.taxaErro), e.reabertas, e.loginRepetido],
                        acao: igTerAbrirFechamento(e.id)
                    }))
                },
                { t: "nota", html: "TMA = mediana do atendimento. Erro = auditoria do fechamento (erros ÷ auditados). Login com 2+ OS = OS cujo cliente teve outra OS aberta ou fechada no mesmo mês. Clique na empresa para ver o fechamento." }
            ]
        }
    ];
});

// ---------- Fechamento ----------
registrarInfografico("terceiras-fechamento", async () => {
    const d = await igTerDadosDoMes();
    if (!d) return [];
    const mesTxt = igTerNomeMes(d.mes);
    if (!d.totalOS) return igTerCartaoVazio("Valor do mês pela LPU", d.mes, `Nenhuma OS fechada por terceirizada em <b>${IG.esc(mesTxt.toLowerCase())}</b> — nada a pagar.`);

    const total = d.empresas.reduce((s, e) => s + e.resumo.total, 0);
    const todasFechadas = d.empresas.every(e => e.fechado);
    const algumaFechada = d.empresas.some(e => e.fechado);
    const pendencias = d.empresas.reduce((s, e) => s + e.pendencias, 0);
    const extraEmpresa = e => [e.fechado ? "fechado" : "", e.pendencias ? `${e.pendencias} com pendência` : ""].filter(Boolean).join(" · ");

    return [
        {
            titulo: "Valor do mês pela LPU", sub: "OS pagas × preço de cada assunto", cor: "verde", icone: "dinheiro", selo: mesTxt,
            blocos: [
                {
                    t: "destaque", fatias: d.empresas.map(e => ({ rotulo: e.nome, n: e.resumo.total, cor: e.cor })),
                    centro: igTerRealCurto(total), sub: "no mês", valor: IG.real(total),
                    texto: todasFechadas ? `a pagar em ${IG.esc(mesTxt.toLowerCase())} · <b>mês fechado</b>`
                        : `a pagar em ${IG.esc(mesTxt.toLowerCase())} · <b>prévia</b>${algumaFechada ? " (parte já fechada)" : ""}`
                },
                { t: "linhas", formato: "real", itens: d.empresas.map(e => ({ rotulo: e.nome, n: e.resumo.total, cor: e.cor, extra: extraEmpresa(e), acao: igTerAbrirFechamento(e.id) })) }
            ]
        },
        {
            titulo: "Valor médio por OS", sub: "R$ por OS paga (total ÷ OS pagas)", cor: "azul", icone: "grafico",
            blocos: [
                { t: "colunas", itens: d.empresas.map(e => ({ rotulo: e.nome, n: e.resumo.pagas ? Math.round(e.resumo.total / e.resumo.pagas) : 0, cor: e.cor, acao: igTerAbrirFechamento(e.id) })) },
                {
                    t: "kpis", itens: d.empresas.map(e => ({
                        rotulo: e.nome, valor: `${IG.fmt(e.resumo.pagas)} pagas`, cor: e.cor,
                        sub: `${IG.fmt(e.resumo.improdutivas + e.resumo.naoPagas)} não pagas`
                    }))
                },
                pendencias
                    ? { t: "nota", html: `<b>${IG.fmt(pendencias)} OS com pendência</b> (sem preço ou diagnóstico sem classificação) ficam fora do valor até a LPU ser completada.` }
                    : { t: "nota", html: "Nenhuma pendência de LPU no mês: todas as OS têm preço e diagnóstico classificado." }
            ]
        }
    ];
});

// ---------- LPU ----------
function igTerTextoPreco(config, assunto, terceira) {
    const p = (cat = null) => TerceirasEngine.precoLpu(config, assunto, terceira, cat);
    if (TerceirasEngine.assuntoDividido(config, assunto)) {
        const partes = CATEGORIAS_PRECO.map(c => ({ c, v: p(c.id) }));
        if (partes.every(x => x.v === undefined)) return null;
        return partes.map(x => `${x.c.nome.slice(0, 3)}. ${x.v === undefined ? "—" : IG.real(x.v)}`).join(" / ");
    }
    const v = p();
    return v === undefined ? null : IG.real(v);
}

registrarInfografico("terceiras-lpu", async () => {
    if (!igTerBaseCarregada()) return [];
    const config = await carregarConfigTerceiras();
    const catalogo = TerceirasEngine.catalogo(analiseTerceiras());

    const linhas = [];
    let semPreco = 0;
    for (const t of TERCEIRAS) {
        const cor = igTerCor(t.id);
        const top = catalogo.assuntos
            .filter(a => (a.porTerceira[t.id] ?? 0) > 0)
            .sort((a, b) => b.porTerceira[t.id] - a.porTerceira[t.id])
            .slice(0, 4);
        for (const a of top) {
            const preco = igTerTextoPreco(config, a.assunto, t.id);
            if (preco === null) semPreco++;
            linhas.push([{ txt: t.nome, cor }, IG.assuntoCurto(a.assunto), a.porTerceira[t.id], preco === null ? { txt: "sem preço", cor: "vermelho" } : preco]);
        }
    }
    if (!linhas.length) {
        return [{ titulo: "Assuntos mais feitos por empresa", sub: "Dados carregados", cor: "cinza", icone: "lista", span: 3, blocos: [{ t: "nota", html: "Nenhuma OS fechada por terceirizada nos dados carregados." }] }];
    }
    return [{
        titulo: "Assuntos mais feitos por empresa", sub: "Onde está o volume de cada uma · preço da LPU salva", cor: "azul", icone: "lista", span: 3,
        selo: "todos os meses carregados",
        blocos: [
            { t: "tabela", cab: ["Empresa", "Assunto", "OS", "Preço LPU"], num: [2, 3], linhas },
            semPreco ? { t: "nota", html: `<b>${semPreco}</b> desses assuntos ainda estão <b>sem preço</b> — preencha na tabela abaixo.` } : null
        ]
    }];
});

// ---------- Qualidade ----------
registrarInfografico("terceiras-qualidade", async () => {
    const d = await igTerDadosDoMes();
    if (!d) return [];
    const mesTxt = igTerNomeMes(d.mes);
    if (!d.totalOS) return igTerCartaoVazio("Qualidade das terceirizadas", d.mes, `Nenhuma OS fechada por terceirizada em <b>${IG.esc(mesTxt.toLowerCase())}</b>.`);

    const qualidade = TerceirasEngine.qualidadeDoMes(d.mes, d.analise);
    return d.empresas.map(e => {
        const q = qualidade.get(e.id) ?? { fechadas: e.os, reabertas: e.reabertas, retornos: [], garantias: 0 };
        const erro = igTerPillErro(e.taxaErro);
        return {
            titulo: `Qualidade · ${e.nome}`, sub: `${IG.fmt(q.fechadas)} OS em ${mesTxt.toLowerCase()}`, cor: e.cor, icone: "escudo",
            blocos: [
                {
                    t: "kpis", itens: [
                        { rotulo: "Erro de fechamento", valor: erro.txt, cor: e.taxaErro === null ? null : erro.cor, sub: e.auditadas ? `${IG.fmt(e.erros)} de ${IG.fmt(e.auditadas)}` : "sem auditados" },
                        { rotulo: "Reabertas", valor: IG.fmt(q.reabertas), cor: q.fechadas && q.reabertas / q.fechadas > .05 ? "laranja" : null, sub: IG.pctDe(q.reabertas, q.fechadas) },
                        { rotulo: `Retornos ${TerceirasEngine.DIAS_RETORNO}d`, valor: IG.fmt(q.retornos.length), sub: `${IG.fmt(q.garantias)} garantia${q.garantias === 1 ? "" : "s"}` },
                        { rotulo: "TMA", valor: e.tma === null ? "—" : `${IG.fmt(e.tma)} min` }
                    ]
                },
                e.cidades.length ? { t: "linhas", itens: e.cidades.map(c => ({ rotulo: c.rotulo, n: c.n, cor: e.cor, extra: IG.pctDe(c.n, e.os) })) }
                    : { t: "nota", html: "Sem OS no mês." }
            ]
        };
    });
});

// Trocar o mês numa aba de Terceiras redesenha a aba (terceiras.js), mas não
// o painel — este ouvinte cuida disso. Roda depois do da aba (bolha), quando
// terceirasMes já foi atualizado.
if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    document.addEventListener("change", e => {
        if (!e.target?.matches?.("[data-mes-terceiras]")) return;
        const ativa = document.querySelector("section.secao.ativa")?.id?.replace(/^secao-/, "");
        if (ativa && INFOGRAFICOS[ativa] && typeof renderizarInfografico === "function") renderizarInfografico(ativa);
    });
}
