/**
 * ==========================================================
 * Infográficos — Gestão do COP
 * ==========================================================
 * - cop-abertas: retrato das OS do COP em aberto, do MESMO modelo da aba
 *   (montarCopAbertas em js/ui/gestaocop.js, cache copAbertasCache; sem
 *   cache, buscarOsPendentesCacheado — que já reaproveita a consulta em
 *   andamento da aba). Clique num assunto abre a mesma lista da aba
 *   (abrirPopupCop).
 * - gestao-cop (Produção · TMR): fechamentos feitos por administrativos
 *   (tipoDono "Administrativo" — COP, suporte, atendimento…) sobre as OS
 *   finalizadas do recorte do Filtro Global (montarLinhasDetalheOS).
 */

const IG_COP_FAIXAS_IDADE = [
    { rotulo: "Hoje", ate: 0, cor: "ciano" },
    { rotulo: "1 dia", ate: 1, cor: "ciano" },
    { rotulo: "2 dias", ate: 2, cor: "ciano" },
    { rotulo: "3 dias", ate: 3, cor: "laranja" },
    { rotulo: "4–10 dias", ate: 10, cor: "laranja" },
    { rotulo: "+10 dias", ate: Infinity, cor: "vermelho" }
];

/** Dias desde a abertura (mesma conta de copHaDias); null sem data. */
function igCopIdadeDias(abertura) {
    if (!abertura) return null;
    return Math.max(0, Math.floor((Date.now() - abertura.getTime()) / 86400000));
}

function igCopCarimbo(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// ---------- COP em aberto ----------
registrarInfografico("cop-abertas", async () => {
    let model = typeof copAbertasCache !== "undefined" ? copAbertasCache : null;
    if (!model) {
        if (typeof buscarOsPendentesCacheado !== "function" || typeof montarCopAbertas !== "function") return [];
        model = montarCopAbertas(await buscarOsPendentesCacheado());
    }
    if (!model || !model.total) {
        return [{
            titulo: "COP em aberto", sub: "OS internas do COP ainda sem fechamento", cor: "ciano", icone: "caixa", span: 3,
            blocos: [{ t: "nota", html: model?.capturadoEm ? "Nenhuma OS do COP em aberto no último retrato do robô." : "Ainda sem retrato do robô (tabela os_pendentes vazia)." }]
        }];
    }

    const contagem = IG_COP_FAIXAS_IDADE.map(() => 0);
    let semData = 0, maisAntiga = null;
    for (const g of model.grupos) {
        for (const o of g.oss) {
            const dias = igCopIdadeDias(o.abertura);
            if (dias === null) { semData++; continue; }
            if (maisAntiga === null || dias > maisAntiga) maisAntiga = dias;
            contagem[IG_COP_FAIXAS_IDADE.findIndex(f => dias <= f.ate)]++;
        }
    }
    const maisDe10 = contagem[contagem.length - 1];
    const ate10 = model.total - maisDe10 - semData;
    const carimbo = igCopCarimbo(model.capturadoEm);

    return [
        {
            titulo: "COP em aberto", sub: "OS internas do COP ainda sem fechamento", cor: "ciano", icone: "caixa",
            selo: carimbo ? `robô ${carimbo}` : "",
            blocos: [
                {
                    t: "destaque",
                    fatias: [
                        { rotulo: "+10 dias", n: maisDe10, cor: "vermelho" },
                        { rotulo: "até 10 dias", n: ate10, cor: "ciano" },
                        { rotulo: "sem data de abertura", n: semData, cor: "cinza" }
                    ],
                    centro: IG.fmt(model.total), sub: "em aberto", valor: IG.pctDe(maisDe10, model.total), corValor: maisDe10 ? "vermelho" : "verde",
                    texto: "estão abertas <b>há mais de 10 dias</b>"
                },
                {
                    t: "kpis", itens: [
                        { rotulo: "Assuntos", valor: IG.fmt(model.grupos.length) },
                        { rotulo: "Mais antiga", valor: maisAntiga === null ? "—" : maisAntiga === 0 ? "hoje" : `${IG.fmt(maisAntiga)} dias`, cor: maisAntiga > 10 ? "vermelho" : null }
                    ]
                }
            ]
        },
        {
            titulo: "Por assunto", sub: "OS do COP em aberto · clique para ver a lista", cor: "ciano", icone: "lista",
            blocos: [{
                t: "linhas",
                itens: model.grupos.slice(0, 8).map(g => ({
                    rotulo: IG.assuntoCurto(g.assunto), titulo: g.assunto, n: g.total, cor: "ciano", extra: IG.pctDe(g.total, model.total),
                    acao: typeof abrirPopupCop === "function" ? () => abrirPopupCop(g) : null
                }))
            }, model.grupos.length > 8 ? { t: "nota", html: `e mais ${model.grupos.length - 8} assunto${model.grupos.length - 8 === 1 ? "" : "s"} na lista abaixo.` } : null]
        },
        {
            titulo: "Há quanto tempo", sub: "Idade das OS do COP em aberto", cor: "laranja", icone: "relogio",
            blocos: [
                { t: "colunas", itens: IG_COP_FAIXAS_IDADE.map((f, i) => ({ rotulo: f.rotulo, n: contagem[i], cor: f.cor })) },
                semData ? { t: "nota", html: `${IG.fmt(semData)} OS sem data de abertura não entram no gráfico.` } : null
            ]
        }
    ];
});

// ---------- Produção · TMR ----------
function igCopNomeCurto(nome) {
    return String(nome ?? "").toLowerCase().replace(/(^|\s)(\p{L})/gu, (m, esp, l) => esp + l.toUpperCase())
        .replace(/\s(Da|De|Do|Das|Dos|E)(?=\s)/g, m => m.toLowerCase());
}

registrarInfografico("gestao-cop", async () => {
    if (!APP?.status?.baseCarregada || !APP.dados?.ordens?.size) return [];
    const linhas = igLinhasDoRecorte();
    const finalizadas = (linhas ?? []).filter(l => normalizarTexto(l.status ?? "") === "FINALIZADA");
    if (!finalizadas.length) {
        return [{
            titulo: "Fechamentos feitos por administrativos", sub: "Recorte do Filtro Global", cor: "cinza", icone: "equipe", span: 3,
            blocos: [{ t: "nota", html: "Nenhuma OS finalizada no recorte do Filtro Global." }]
        }];
    }

    const adm = finalizadas.filter(l => l.tipoDono === "Administrativo");
    const campo = finalizadas.filter(l => l.tipoDono === "Campo").length;
    const semTipo = finalizadas.length - adm.length - campo;
    const setorDe = new Map(adm.map(l => [l.tecnicoAuditado, l.setorDono]));
    const porPessoa = IG.contar(adm, l => l.tecnicoAuditado || null, 8);
    const porAssunto = IG.contar(adm, l => l.assunto ? IG.assuntoCurto(l.assunto) : null, 6);

    return [
        {
            titulo: "Fechamentos feitos por administrativos", sub: "OS finalizadas no sistema pelo COP/suporte, não pelo técnico", cor: "roxo", icone: "equipe",
            blocos: [
                {
                    t: "destaque",
                    fatias: [
                        { rotulo: "Administrativo", n: adm.length, cor: "roxo" },
                        { rotulo: "Técnico de campo", n: campo, cor: "azul" },
                        { rotulo: "Não identificado", n: semTipo, cor: "cinza" }
                    ],
                    centro: IG.fmt(adm.length), sub: "fechamentos", valor: IG.pctDe(adm.length, finalizadas.length),
                    texto: `das ${IG.fmt(finalizadas.length)} OS finalizadas foram <b>fechadas por administrativos</b>`
                },
                semTipo ? { t: "nota", html: `${IG.fmt(semTipo)} fechamento${semTipo === 1 ? "" : "s"} sem setor cadastrado (Base &gt; Operadores) ficam como não identificados.` } : null
            ]
        },
        {
            titulo: "Por colaborador", sub: "Quem mais fechou OS", cor: "roxo", icone: "pessoa",
            blocos: [{
                t: "linhas",
                itens: porPessoa.map(p => ({ rotulo: igCopNomeCurto(p.rotulo), titulo: `${p.rotulo}${setorDe.get(p.rotulo) ? ` · ${setorDe.get(p.rotulo)}` : ""}`, n: p.n, cor: "roxo", extra: IG.pctDe(p.n, adm.length) }))
            }]
        },
        {
            titulo: "O que o COP fecha", sub: "Assuntos dos fechamentos administrativos", cor: "azul", icone: "lista",
            blocos: [
                { t: "linhas", itens: porAssunto.map(a => ({ rotulo: a.rotulo, n: a.n, cor: "azul", extra: IG.pctDe(a.n, adm.length) })) },
                { t: "nota", html: "O TMR de agendamento por colaborador continua logo abaixo." }
            ]
        }
    ];
});
