let backlogHistRecorte = "dia";
let backlogHistCarregando = false;
const backlogHistCache = new Map();

const BACKLOG_HIST_RECORTES = {
    dia: { rotulo: "Dia anterior", dia: () => { const d = ixcMeiaNoite(); d.setDate(d.getDate() - 1); return d; } },
    mes: { rotulo: "Mês anterior", dia: () => { const d = ixcMeiaNoite(); d.setDate(0); return d; } }
};

function backlogHistIso(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function backlogHistEhCampo(assunto) {
    return Motor.assuntoEhDeCampo(assunto) && !/recolhimento|retirada de equipamento/.test(Motor.norm(assunto));
}

async function backlogHistTodas(montar) {
    const linhas = [];
    for (let de = 0; ; de += 1000) {
        const { data, error } = await montar().range(de, de + 999);
        if (error) throw error;
        linhas.push(...(data || []));
        if (!data || data.length < 1000) return linhas;
    }
}

let backlogHistAgora = null;

async function backlogHistAtual() {
    const linhas = typeof buscarOsPendentesCacheado === "function" ? await buscarOsPendentesCacheado() : [];
    if (backlogHistAgora?.linhas !== linhas) backlogHistAgora = { linhas, model: montarBacklog(linhas, new Date()) };
    return backlogHistAgora.model;
}

async function backlogHistRetratoSalvo(dia) {
    let linhas;
    try {
        linhas = await backlogHistTodas(() => supabaseClient.from("backlog_retratos")
            .select("os_id, cliente, cidade, bairro, assunto, status, abertura, agendamento, salvo_em")
            .eq("dia", backlogHistIso(dia)).order("os_id"));
    } catch (e) {
        console.warn("Retrato do backlog indisponível (patch-33 rodado?):", e);
        return null;
    }
    if (!linhas.length) return null;

    const fim = new Date(dia); fim.setHours(23, 59, 59, 999);
    const limiteAntiga = fim.getTime() - BACKLOG_DIAS_ANTIGA * 86400000;
    const itens = linhas
        .filter(l => backlogHistEhCampo(l.assunto) && ixcNorm(l.status) !== "finalizada")
        .map(l => {
            const assumida = ixcNorm(l.status) === "assumida";
            const abertura = ixcDataBR(l.abertura);
            const agendamento = assumida ? null : ixcDataBR(l.agendamento);
            return {
                id: l.os_id, cliente: l.cliente, cidade: l.cidade, bairro: l.bairro, bairroOriginal: l.bairro ?? "",
                assunto: l.assunto, status: l.status, assumida, agendada: !!agendamento, agendamento, abertura,
                antiga: abertura ? abertura.getTime() < limiteAntiga : false
            };
        });
    const salvoEm = linhas.reduce((m, l) => (l.salvo_em > m ? l.salvo_em : m), "");
    return { itens, fonte: "retrato", salvoEm: salvoEm ? new Date(salvoEm) : null };
}

async function backlogHistReconstruir(dia, atual) {
    const fim = new Date(dia); fim.setHours(23, 59, 59, 999);
    const limiteAntiga = fim.getTime() - BACKLOG_DIAS_ANTIGA * 86400000;

    const itens = atual.itens
        .filter(i => i.abertura && i.abertura <= fim)
        .map(i => ({ ...i, antiga: i.abertura.getTime() < limiteAntiga }));
    const vistos = new Set(itens.map(i => String(i.id)));

    const finalizadas = await backlogHistTodas(() => supabaseClient.from("ordens")
        .select("id, cliente, cidade, bairro, assunto, data_abertura, data_fechamento")
        .lte("data_abertura", fim.toISOString()).gt("data_fechamento", fim.toISOString()).order("id"));
    for (const o of finalizadas) {
        if (vistos.has(String(o.id)) || !backlogHistEhCampo(o.assunto)) continue;
        const abertura = o.data_abertura ? new Date(o.data_abertura) : null;
        itens.push({
            id: o.id, cliente: o.cliente, cidade: o.cidade, bairro: o.bairro, bairroOriginal: o.bairro ?? "",
            assunto: o.assunto, agendada: false, agendamento: null, abertura,
            fechamento: o.data_fechamento ? new Date(o.data_fechamento) : null,
            antiga: abertura ? abertura.getTime() < limiteAntiga : false
        });
    }
    return { itens, fonte: "reconstruido" };
}

function backlogHistComparar(retrato, atual) {
    const idsAgora = new Set(atual.itens.map(i => String(i.id)));
    const idsAntes = new Set(retrato.itens.map(i => String(i.id)));
    return {
        antes: retrato.itens,
        agora: atual.itens,
        seguem: retrato.itens.filter(i => idsAgora.has(String(i.id))),
        sairam: retrato.itens.filter(i => !idsAgora.has(String(i.id))),
        entraram: atual.itens.filter(i => !idsAntes.has(String(i.id)))
    };
}

const BACKLOG_HIST_COLUNAS = [
    { id: "antes", rotulo: "Na virada", sub: "OS de campo em aberto na virada" },
    { id: "seguem", rotulo: "Seguem em aberto", sub: "Estavam em aberto na virada e continuam" },
    { id: "sairam", rotulo: "Saíram", sub: "Estavam em aberto na virada e já não estão" },
    { id: "entraram", rotulo: "Entraram depois", sub: "Em aberto agora, mas não estavam na virada" },
    { id: "agora", rotulo: "Em aberto agora", sub: "OS de campo em aberto agora" }
];

function backlogHistAgrupar(comp, chave) {
    const grupos = new Map();
    for (const col of BACKLOG_HIST_COLUNAS) {
        for (const i of comp[col.id]) {
            const k = chave(i);
            if (!grupos.has(k)) grupos.set(k, { nome: k, antes: [], seguem: [], sairam: [], entraram: [], agora: [] });
            grupos.get(k)[col.id].push(i);
        }
    }
    return [...grupos.values()].sort((a, b) => b.antes.length - a.antes.length || b.agora.length - a.agora.length || a.nome.localeCompare(b.nome, "pt-BR"));
}

function backlogHistVariacao(antes, agora) {
    const d = agora - antes;
    if (!d) return `<span class="backlog-hist-var">0</span>`;
    const pct = antes ? ` (${d > 0 ? "+" : ""}${Math.round(d / antes * 100)}%)` : "";
    return `<span class="backlog-hist-var ${d > 0 ? "sobe" : "desce"}">${d > 0 ? "+" : "−"}${Math.abs(d).toLocaleString("pt-BR")}${pct}</span>`;
}

function backlogHistTabela(grupos, titulo, rotuloNome, prefixo, formatarNome) {
    if (!grupos.length) return "";
    const linhas = grupos.map((g, gi) => `
        <tr>
            <td><strong>${escaparHtml(formatarNome(g.nome))}</strong></td>
            ${BACKLOG_HIST_COLUNAS.map(c => `<td>${g[c.id].length
                ? `<button type="button" class="backlog-hist-num" data-${prefixo}="${gi}|${c.id}">${g[c.id].length.toLocaleString("pt-BR")}</button>`
                : '<span class="clientes-cto-vazio">0</span>'}</td>`).join("")}
            <td>${backlogHistVariacao(g.antes.length, g.agora.length)}</td>
        </tr>`).join("");
    return `
        <div class="indicadores-secao-titulo">${titulo}</div>
        <div class="tabela-scroll">
            <table class="tabela-alertas backlog-hist-tabela">
                <thead><tr><th>${rotuloNome}</th>${BACKLOG_HIST_COLUNAS.map(c => `<th>${c.rotulo}</th>`).join("")}<th>Variação</th></tr></thead>
                <tbody>${linhas}</tbody>
            </table>
        </div>`;
}

function desenharBacklogHistorico(dados) {
    const alvo = document.getElementById("agendaBacklogHistConteudo");
    if (!alvo) return;
    const { dia, retrato, comp } = dados;
    const capturado = dados.atual.capturadoEm ? new Date(dados.atual.capturadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : null;
    const diaTxt = dia.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

    const fonte = retrato.fonte === "retrato"
        ? `Retrato salvo${retrato.salvoEm ? ` em ${retrato.salvoEm.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""} (o último que o robô deixou em aberto no dia).`
        : `Reconstruído: o que segue em aberto hoje e já estava aberto até ${diaTxt}, mais as OS finalizadas depois disso. OS canceladas nesse meio-tempo não entram.`;

    const valor = { antes: comp.antes.length, seguem: comp.seguem.length, sairam: comp.sairam.length, entraram: comp.entraram.length, agora: comp.agora.length };
    const kpis = BACKLOG_HIST_COLUNAS.map(c => `
        <button type="button" class="stat-tile stat-tile-link backlog-tile" data-bh-cartao="${c.id}">
            <div class="stat-label">${c.id === "antes" ? `Em aberto em ${diaTxt.slice(0, 5)}` : c.rotulo}</div>
            <div class="stat-valor">${valor[c.id].toLocaleString("pt-BR")}</div>
            ${c.id === "agora" ? `<div class="backlog-hist-sub">${backlogHistVariacao(valor.antes, valor.agora)} vs ${diaTxt.slice(0, 5)}</div>` : ""}
        </button>`).join("");

    const porAssunto = backlogHistAgrupar(comp, i => assuntoUnificado(i.assunto));
    const porCidade = backlogHistAgrupar(comp, i => i.cidade || "—");

    const seletor = Object.entries(BACKLOG_HIST_RECORTES).map(([id, r]) =>
        `<button type="button" data-bh-recorte="${id}"${id === backlogHistRecorte ? ' class="ativo"' : ""}>${r.rotulo}</button>`).join("");

    alvo.innerHTML = `
        <div class="backlog-filtro">
            <div class="escala-segmentado" role="group" aria-label="Dia anterior ou mês anterior">${seletor}</div>
            <span class="resumo-filtro">Fim do dia <strong>${diaTxt}</strong> comparado com o que está em aberto agora${capturado ? ` (robô às ${capturado})` : ""} · OS de campo</span>
        </div>
        <p class="resumo-filtro">${fonte}</p>
        <div class="kpi-row">${kpis}</div>
        ${backlogHistTabela(porAssunto, "Por assunto", "Assunto", "bh-assunto", backlogAssuntoCurto)}
        ${backlogHistTabela(porCidade, "Por cidade", "Cidade", "bh-cidade", n => n)}`;

    alvo.querySelectorAll("[data-bh-recorte]").forEach(b => b.addEventListener("click", () => {
        if (b.dataset.bhRecorte === backlogHistRecorte) return;
        backlogHistRecorte = b.dataset.bhRecorte;
        renderizarBacklogHistorico();
    }));

    const coluna = id => BACKLOG_HIST_COLUNAS.find(c => c.id === id);
    const popup = (titulo, id, oss) => abrirPopupBacklog(`${titulo} · virada de ${diaTxt.slice(0, 5)}`, oss, coluna(id).sub, dados.atual);
    alvo.querySelectorAll("[data-bh-cartao]").forEach(b => b.addEventListener("click", () => {
        const id = b.dataset.bhCartao;
        popup(coluna(id).rotulo, id, comp[id]);
    }));
    for (const [prefixo, grupos, nome] of [["bh-assunto", porAssunto, backlogAssuntoCurto], ["bh-cidade", porCidade, n => n]]) {
        alvo.querySelectorAll(`[data-${prefixo}]`).forEach(b => b.addEventListener("click", () => {
            const [gi, col] = b.getAttribute(`data-${prefixo}`).split("|");
            const g = grupos[+gi];
            popup(`${nome(g.nome)} · ${coluna(col).rotulo}`, col, g[col]);
        }));
    }
}

async function renderizarBacklogHistorico(forcar = false) {
    const alvo = document.getElementById("agendaBacklogHistConteudo");
    if (!alvo || backlogHistCarregando) return;

    const dia = BACKLOG_HIST_RECORTES[backlogHistRecorte].dia();
    const chave = `${backlogHistRecorte}|${backlogHistIso(dia)}`;

    backlogHistCarregando = true;
    alvo.innerHTML = `<div class="ixc-vazio"><p>Montando o backlog de ${escaparHtml(BACKLOG_HIST_RECORTES[backlogHistRecorte].rotulo.toLowerCase())}…</p></div>`;
    try {
        const atual = await backlogHistAtual();
        const guardado = backlogHistCache.get(chave);
        if (!forcar && guardado?.atual === atual) { desenharBacklogHistorico(guardado); return; }
        const retrato = await backlogHistRetratoSalvo(dia) || await backlogHistReconstruir(dia, atual);
        const dados = { dia, atual, retrato, comp: backlogHistComparar(retrato, atual) };
        backlogHistCache.set(chave, dados);
        desenharBacklogHistorico(dados);
    } catch (erro) {
        console.error("Backlog anterior:", erro);
        alvo.innerHTML = `<div class="ixc-vazio"><p>Não consegui montar o backlog. ${escaparHtml(erro.message || "")}</p></div>`;
    } finally {
        backlogHistCarregando = false;
    }
}
