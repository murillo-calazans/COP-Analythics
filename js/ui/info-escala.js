/**
 * ==========================================================
 * Infográfico — Escala (seção "escala-hoje")
 * ==========================================================
 * Equipe do dia (trabalhando × folga/outras × férias, duplas), semana
 * (técnicos trabalhando por dia, seg–dom) e cidades (manutenção × instalação).
 *
 * Mesma fonte e mesmas regras da tela (js/ui/escalahoje.js +
 * js/agendador/escala-dia.js): a linha única da escala_tecnicos_dados, lida
 * uma vez e guardada em escalaTecnicosCache. O painel espera a tela carregar
 * (não dispara uma segunda leitura em paralelo).
 */

async function igeTecnicos() {
    if (typeof carregarEscalaTecnicos !== "function") return [];
    // a tela já está lendo a escala: espera o cache dela (até ~5 s) em vez de ler de novo
    for (let i = 0; i < 25 && !escalaTecnicosCache; i++) await new Promise(r => setTimeout(r, 200));
    return carregarEscalaTecnicos();
}

const IGE_DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

registrarInfografico("escala-hoje", async () => {
    const techs = await igeTecnicos();
    if (!techs?.length || typeof EscalaDia === "undefined") return [];

    // o dia que a tela está mostrando (setas ‹ › mudam escalaHojeData)
    const hoje = hojeMeiaNoite();
    const data = escalaHojeData ?? hoje;
    const ehHoje = isoDataLocal(data) === isoDataLocal(hoje);
    const nomeDia = ehHoje ? "hoje" : data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

    const dia = EscalaDia.montarDia(techs, data);
    const trabalhando = dia.filter(d => d.trabalha);
    const conta = sit => dia.filter(d => d.resumo.situacao === sit).length;
    const folga = conta("folga"), atestado = conta("atestado"), outras = conta("outras"), ferias = conta("ferias");
    const duplas = trabalhando.filter(d => d.parceiro && d.papel === "principal").length;
    const instalacao = trabalhando.filter(d => d.resumo.situacao === "instalador").length;
    const manutencao = trabalhando.length - instalacao;
    const temporarios = trabalhando.filter(d => d.resumo.temporaria).length;
    const feriado = EscalaDia.FERIADOS[EscalaDia.isoData(data)];

    const cartoes = [];

    // 1) Equipe do dia
    cartoes.push({
        titulo: ehHoje ? "Equipe hoje" : `Equipe em ${nomeDia}`, sub: feriado ? `Feriado: ${feriado}` : "Técnicos da escala no dia", cor: "verde", icone: "equipe",
        blocos: [
            { t: "destaque", fatias: [
                { rotulo: "Trabalhando", n: trabalhando.length, cor: "verde" },
                { rotulo: "Folga / outras", n: folga + atestado + outras, cor: "cinza" },
                { rotulo: "Férias", n: ferias, cor: "laranja" }
            ], centro: IG.fmt(trabalhando.length), sub: "trabalhando", valor: IG.fmt(duplas), texto: `<b>${duplas === 1 ? "dupla formada" : "duplas formadas"}</b> ${ehHoje ? "hoje" : "no dia"}` },
            { t: "linhas", total: dia.length, itens: [
                { rotulo: "Trabalhando", n: trabalhando.length, cor: "verde", extra: IG.pctDe(trabalhando.length, dia.length) },
                { rotulo: "Folga", n: folga, cor: "cinza" },
                { rotulo: "Outras atividades", n: outras, cor: "cinza" },
                { rotulo: "Atestado", n: atestado, cor: "vermelho" },
                { rotulo: "Férias", n: ferias, cor: "laranja" }
            ].filter(i => i.n || i.rotulo === "Trabalhando") },
            { t: "kpis", itens: [
                { rotulo: "Manutenção", valor: IG.fmt(manutencao), cor: "azul" },
                { rotulo: "Instalação", valor: IG.fmt(instalacao), cor: "verde" },
                { rotulo: "Fora da cidade (temp.)", valor: IG.fmt(temporarios), cor: "roxo" }
            ] }
        ]
    });

    // 2) Semana (seg–dom) da data exibida
    const seg = new Date(data.getFullYear(), data.getMonth(), data.getDate() - ((data.getDay() + 6) % 7));
    const semana = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(seg.getFullYear(), seg.getMonth(), seg.getDate() + i);
        const n = EscalaDia.montarDia(techs, d).filter(x => x.trabalha).length;
        const ehODia = isoDataLocal(d) === isoDataLocal(data);
        return { rotulo: `${IGE_DIAS_CURTOS[d.getDay()]} ${String(d.getDate()).padStart(2, "0")}`, n, cor: ehODia ? "verde" : "azul" };
    });
    const fim = new Date(seg.getFullYear(), seg.getMonth(), seg.getDate() + 6);
    const dm = d => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    cartoes.push({
        titulo: "Semana", sub: `Técnicos trabalhando por dia · ${dm(seg)}–${dm(fim)}`, cor: "azul", icone: "calendario", span: 2,
        blocos: [
            { t: "colunas", itens: semana },
            { t: "nota", html: `Em verde, ${ehHoje ? "hoje" : "o dia exibido"}. Folga de sábado/domingo e feriado segue a regra da escala.` }
        ]
    });

    // 3) Por cidade (cidade do dia — conta quem está temporariamente em outra cidade lá)
    const porCidade = new Map();
    for (const d of trabalhando) {
        const c = d.resumo.cidade || "Sem cidade";
        if (!porCidade.has(c)) porCidade.set(c, { manutencao: 0, instalador: 0 });
        porCidade.get(c)[d.resumo.situacao === "manutencao" ? "manutencao" : "instalador"]++;
    }
    const cidades = [...porCidade].map(([cidade, v]) => ({ cidade, ...v, total: v.manutencao + v.instalador }))
        .sort((a, b) => b.total - a.total || a.cidade.localeCompare(b.cidade, "pt-BR"));
    if (cidades.length) {
        cartoes.push({
            titulo: "Por cidade", sub: `Manutenção × instalação ${ehHoje ? "hoje" : `em ${nomeDia}`} · técnicos, não equipes`, cor: "ciano", icone: "mapa", span: 3,
            blocos: [{ t: "tabela", cab: ["Cidade", "Manutenção", "Instalação", "Total"], num: [1, 2, 3],
                linhas: cidades.map(c => [c.cidade, c.manutencao, c.instalador, c.total]) }]
        });
    }

    return cartoes;
});
