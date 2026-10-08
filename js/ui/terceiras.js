/**
 * ==========================================================
 * Gestão de Terceiras — telas
 * ==========================================================
 * Quatro abas do módulo (menu lateral > Gestão de Terceiras):
 *   - terceiras             Painel do mês (quanto pagar a cada uma)
 *   - terceiras-fechamento  Fechamento mensal (detalhe, PDF, fechar mês)
 *   - terceiras-lpu         LPU e classificação dos diagnósticos
 *   - terceiras-qualidade   Reaberturas, retornos e garantias
 *
 * Cálculo em js/engine/terceirasengine.js. Banco: patch-19
 * (terceiras_config e terceiras_fechamentos). Editar LPU e fechar o
 * mês: admin ou editor. Reabrir um mês fechado: só admin.
 */

let terceirasConfig = null;          // { lpu, diagnosticos, atualizado_por, atualizado_em }
let terceirasRascunho = null;        // cópia editável da config (aba LPU)
let terceirasRascunhoAlterado = false;
let terceirasMes = null;             // 'AAAA-MM'
let terceiraSelecionada = TERCEIRAS[0].id;
let terceirasFiltroSituacao = "todas";
let terceirasFiltroQualidade = "todas";
let terceirasAnaliseCache = null;    // { ordens, tamanho, analise }
const terceirasFechamentosCache = new Map(); // mes -> Map(terceira -> fechamento)

const ROTULOS_SITUACAO = {
    paga: "Paga",
    improdutiva: "Improdutiva",
    nao_paga: "Não paga (LPU = 0)",
    sem_preco: "Sem preço na LPU",
    diag_pendente: "Diagnóstico sem classificação"
};

function moeda(valor) {
    return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function nomeMes(mes) {
    const [ano, m] = mes.split("-").map(Number);
    const texto = new Date(ano, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function mesAtualTerceiras() {
    terceirasMes ??= TerceirasEngine.chaveMes(new Date());
    return terceirasMes;
}

function analiseTerceiras() {
    const ordens = APP.dados.ordens;
    if (!terceirasAnaliseCache || terceirasAnaliseCache.ordens !== ordens || terceirasAnaliseCache.tamanho !== ordens.size) {
        terceirasAnaliseCache = { ordens, tamanho: ordens.size, analise: IndicatorEngine.analisarEventosDeTodas(ordens) };
    }
    return terceirasAnaliseCache.analise;
}

function erroFaltaPatch19(erro) {
    return /terceiras_(config|fechamentos)/.test(erro?.message ?? "") || erro?.code === "42P01" || erro?.code === "PGRST205";
}

function htmlErroTerceiras(erro) {
    return erroFaltaPatch19(erro)
        ? '<p class="alerta-vazio">As tabelas da Gestão de Terceiras ainda não existem no banco — falta rodar o database/patch-19-gestao-terceiras.sql no Supabase.</p>'
        : `<p class="alerta-vazio">Não deu pra carregar: ${escaparHtml(erro?.message ?? String(erro))}</p>`;
}

async function carregarConfigTerceiras(forcar = false) {
    if (terceirasConfig && !forcar) return terceirasConfig;
    const { data, error } = await supabaseClient
        .from("terceiras_config")
        .select("lpu, diagnosticos, atualizado_por, atualizado_em")
        .eq("id", "default")
        .maybeSingle();
    if (error) throw error;
    terceirasConfig = data ?? { lpu: {}, diagnosticos: {} };
    terceirasConfig.lpu ??= {};
    terceirasConfig.diagnosticos ??= {};
    return terceirasConfig;
}

async function carregarFechamentosDoMes(mes, forcar = false) {
    if (terceirasFechamentosCache.has(mes) && !forcar) return terceirasFechamentosCache.get(mes);
    const { data, error } = await supabaseClient
        .from("terceiras_fechamentos")
        .select("mes, terceira, total, resumo, itens, aprovado_por, aprovado_em")
        .eq("mes", mes);
    if (error) throw error;
    const mapa = new Map((data ?? []).map(f => [f.terceira, f]));
    terceirasFechamentosCache.set(mes, mapa);
    return mapa;
}

/** Barra com o seletor de mês, comum às abas. */
function htmlBarraMes(extra = "") {
    return `
        <div class="terceiras-barra">
            <label class="terceiras-mes">Mês
                <input type="month" data-mes-terceiras value="${mesAtualTerceiras()}">
            </label>
            ${extra}
        </div>`;
}

function registrarBarraMes(container, aoMudar) {
    container.querySelector("[data-mes-terceiras]")?.addEventListener("change", e => {
        if (!e.target.value) return;
        terceirasMes = e.target.value;
        aoMudar();
    });
}

function semDadosTerceiras(container) {
    if (APP.status.baseCarregada && APP.dados.ordens.size > 0) return false;
    container.innerHTML = '<p class="alerta-vazio">Carregando as ordens... (a Gestão de Terceiras calcula em cima delas)</p>';
    return true;
}

function chipSituacao(situacao) {
    return `<span class="terceiras-chip situacao-pag-${situacao}">${ROTULOS_SITUACAO[situacao] ?? situacao}</span>`;
}

// ==========================================================
// Painel do mês
// ==========================================================

async function renderizarTerceirasPainel() {
    const container = document.getElementById("terceirasPainelConteudo");
    if (!container || semDadosTerceiras(container)) return;

    const mes = mesAtualTerceiras();
    let config, fechamentos;
    try {
        [config, fechamentos] = await Promise.all([carregarConfigTerceiras(), carregarFechamentosDoMes(mes)]);
    } catch (erro) {
        container.innerHTML = htmlErroTerceiras(erro);
        return;
    }

    const itens = TerceirasEngine.itensDoMes(mes, config, analiseTerceiras());
    const pend = TerceirasEngine.pendencias(itens);

    // Mês fechado vale o que foi congelado; aberto vale a prévia.
    const porTerceira = TERCEIRAS.map(t => {
        const fechado = fechamentos.get(t.id);
        const itensT = fechado ? fechado.itens : itens.filter(i => i.terceira === t.id);
        return { t, fechado, resumo: TerceirasEngine.resumir(itensT), itens: itensT };
    });
    const totalGeral = porTerceira.reduce((s, x) => s + x.resumo.total, 0);

    // Tabela assunto × terceirizada (OS pagas e valor).
    const assuntos = new Map();
    for (const { t, resumo } of porTerceira) {
        for (const a of resumo.porAssunto) {
            const linha = assuntos.get(a.assunto) ?? { assunto: a.assunto, total: 0 };
            linha[t.id] = a;
            linha.total += a.subtotal;
            assuntos.set(a.assunto, linha);
        }
    }
    const linhasAssunto = [...assuntos.values()].sort((a, b) => b.total - a.total);

    container.innerHTML = `
        ${htmlBarraMes(`<span class="terceiras-total-geral">Total do mês: <strong>${moeda(totalGeral)}</strong></span>`)}

        <div class="terceiras-cards">
            ${porTerceira.map(({ t, fechado, resumo }) => `
                <button type="button" class="terceiras-card" data-abrir-fechamento="${t.id}">
                    <div class="terceiras-card-topo">
                        <h3>${t.nome}</h3>
                        ${fechado
                            ? `<span class="terceiras-status fechado">Fechado ${new Date(fechado.aprovado_em).toLocaleDateString("pt-BR")}</span>`
                            : '<span class="terceiras-status aberto">Em aberto</span>'}
                    </div>
                    <div class="terceiras-card-valor">${moeda(resumo.total)}</div>
                    <div class="terceiras-card-linhas">
                        <span><strong>${resumo.pagas}</strong> OS pagas</span>
                        <span><strong>${resumo.improdutivas}</strong> improdutivas</span>
                        ${resumo.semPreco + resumo.diagPendente > 0 ? `<span class="terceiras-pendente"><strong>${resumo.semPreco + resumo.diagPendente}</strong> com pendência</span>` : ""}
                    </div>
                    <span class="terceiras-card-link">Ver fechamento →</span>
                </button>`).join("")}
        </div>

        ${pend.assuntos.length || pend.diagnosticos.length ? `
            <div class="grafico-card terceiras-pendencias">
                <div class="grafico-cabecalho">
                    <div>
                        <div class="grafico-titulo">⚠ Pendências do mês</div>
                        <div class="grafico-subtitulo">Essas OS não entram no pagamento até a LPU ser completada.</div>
                    </div>
                    <button type="button" class="botao-secundario" data-ir-secao="terceiras-lpu">Abrir a LPU</button>
                </div>
                <div class="terceiras-pendencias-colunas">
                    ${pend.assuntos.length ? `
                        <div>
                            <h4>Assunto sem preço</h4>
                            <ul>${pend.assuntos.slice(0, 10).map(p => `<li>${escaparHtml(p.assunto)} <span class="admin-dica">· ${TerceirasEngine.nomeTerceira(p.terceira)} · ${p.quantidade} OS</span></li>`).join("")}</ul>
                            ${pend.assuntos.length > 10 ? `<p class="admin-dica">e mais ${pend.assuntos.length - 10}.</p>` : ""}
                        </div>` : ""}
                    ${pend.diagnosticos.length ? `
                        <div>
                            <h4>Diagnóstico sem classificação</h4>
                            <ul>${pend.diagnosticos.slice(0, 10).map(p => `<li>${escaparHtml(p.diagnostico)} <span class="admin-dica">· ${p.quantidade} OS</span></li>`).join("")}</ul>
                            ${pend.diagnosticos.length > 10 ? `<p class="admin-dica">e mais ${pend.diagnosticos.length - 10}.</p>` : ""}
                        </div>` : ""}
                </div>
            </div>` : ""}

        <div class="grafico-card">
            <div class="grafico-cabecalho">
                <div>
                    <div class="grafico-titulo">Pagamento por assunto</div>
                    <div class="grafico-subtitulo">OS pagas e valor de ${nomeMes(mes).toLowerCase()}</div>
                </div>
            </div>
            ${linhasAssunto.length ? `
            <div class="tabela-scroll">
                <table class="tabela-alertas terceiras-tabela">
                    <thead><tr><th>Assunto</th>${TERCEIRAS.map(t => `<th class="num">${t.nome}</th>`).join("")}<th class="num">Total</th></tr></thead>
                    <tbody>
                        ${linhasAssunto.map(l => `<tr><td>${escaparHtml(l.assunto)}</td>${TERCEIRAS.map(t => `<td class="num">${l[t.id] ? `${l[t.id].quantidade} · ${moeda(l[t.id].subtotal)}` : "—"}</td>`).join("")}<td class="num"><strong>${moeda(l.total)}</strong></td></tr>`).join("")}
                    </tbody>
                </table>
            </div>` : '<p class="alerta-vazio">Nenhuma OS paga neste mês ainda.</p>'}
        </div>
    `;

    registrarBarraMes(container, renderizarTerceirasPainel);
    container.querySelectorAll("[data-abrir-fechamento]").forEach(b => b.addEventListener("click", () => {
        terceiraSelecionada = b.dataset.abrirFechamento;
        mostrarSecao("terceiras-fechamento");
    }));
    container.querySelectorAll("[data-ir-secao]").forEach(b => b.addEventListener("click", () => mostrarSecao(b.dataset.irSecao)));
}

// ==========================================================
// Fechamento mensal
// ==========================================================

async function renderizarTerceirasFechamento() {
    const container = document.getElementById("terceirasFechamentoConteudo");
    if (!container || semDadosTerceiras(container)) return;

    const mes = mesAtualTerceiras();
    const terceira = terceiraSelecionada;
    let config, fechamentos;
    try {
        [config, fechamentos] = await Promise.all([carregarConfigTerceiras(), carregarFechamentosDoMes(mes)]);
    } catch (erro) {
        container.innerHTML = htmlErroTerceiras(erro);
        return;
    }

    const fechado = fechamentos.get(terceira);
    const itens = fechado ? fechado.itens : TerceirasEngine.itensDoMes(mes, config, analiseTerceiras()).filter(i => i.terceira === terceira);
    const resumo = TerceirasEngine.resumir(itens);
    const pendentes = resumo.semPreco + resumo.diagPendente;
    const podeFechar = podeEditarOperacao();

    const filtros = { todas: () => true, pagas: i => i.situacao === "paga", nao_pagas: i => i.situacao === "improdutiva" || i.situacao === "nao_paga", pendentes: i => i.situacao === "sem_preco" || i.situacao === "diag_pendente" };
    const visiveis = itens.filter(filtros[terceirasFiltroSituacao] ?? filtros.todas);

    container.innerHTML = `
        ${htmlBarraMes(`
            <div class="escala-segmentado" role="group" aria-label="Terceirizada">
                ${TERCEIRAS.map(t => `<button type="button" data-terceira="${t.id}" class="${t.id === terceira ? "ativo" : ""}" aria-pressed="${t.id === terceira}">${t.nome}</button>`).join("")}
            </div>
            <div class="terceiras-acoes">
                <button type="button" class="botao-secundario" id="btnPdfFechamento">Imprimir / PDF</button>
                <button type="button" class="botao-secundario" id="btnCsvFechamento">CSV</button>
                ${fechado
                    ? (ehAdmin() ? '<button type="button" class="botao-secundario" id="btnReabrirFechamento">Reabrir mês</button>' : "")
                    : (podeFechar ? '<button type="button" class="botao-primario" id="btnFecharMes">Fechar mês</button>' : "")}
            </div>`)}

        ${fechado
            ? `<div class="terceiras-banner fechado">✓ <strong>${nomeMes(mes)} fechado</strong> em ${new Date(fechado.aprovado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}${fechado.aprovado_por ? ` por ${escaparHtml(fechado.aprovado_por)}` : ""}. Valores congelados — reimportar dados não muda este fechamento.</div>`
            : `<div class="terceiras-banner aberto"><strong>Prévia de ${nomeMes(mes).toLowerCase()}</strong> — ainda não fechado. Os valores mudam se a LPU ou os dados mudarem.${pendentes ? ` <strong>${pendentes} OS com pendência</strong> ficam fora do pagamento.` : ""}</div>`}

        <div class="kpi-row terceiras-kpis">
            <div class="stat-tile"><div class="stat-label">Total a pagar</div><div class="stat-valor">${moeda(resumo.total)}</div></div>
            <div class="stat-tile"><div class="stat-label">OS pagas</div><div class="stat-valor">${resumo.pagas}</div></div>
            <div class="stat-tile"><div class="stat-label">Não pagas</div><div class="stat-valor">${resumo.improdutivas + resumo.naoPagas}</div></div>
            <div class="stat-tile"><div class="stat-label">Pendências</div><div class="stat-valor">${pendentes}</div></div>
        </div>

        <div class="grafico-card">
            <div class="grafico-cabecalho"><div><div class="grafico-titulo">Resumo por assunto</div><div class="grafico-subtitulo">Só OS pagas</div></div></div>
            ${resumo.porAssunto.length ? `
            <div class="tabela-scroll">
                <table class="tabela-alertas terceiras-tabela">
                    <thead><tr><th>Assunto</th><th class="num">OS</th><th class="num">Valor LPU</th><th class="num">Subtotal</th></tr></thead>
                    <tbody>${resumo.porAssunto.map(a => `<tr><td>${escaparHtml(a.assunto)}</td><td class="num">${a.quantidade}</td><td class="num">${moeda(a.valorUnitario)}</td><td class="num">${moeda(a.subtotal)}</td></tr>`).join("")}</tbody>
                    <tfoot><tr><td><strong>Total</strong></td><td class="num"><strong>${resumo.pagas}</strong></td><td></td><td class="num"><strong>${moeda(resumo.total)}</strong></td></tr></tfoot>
                </table>
            </div>` : '<p class="alerta-vazio">Nenhuma OS paga.</p>'}
        </div>

        <div class="grafico-card">
            <div class="grafico-cabecalho">
                <div><div class="grafico-titulo">Ordens do mês</div><div class="grafico-subtitulo">${itens.length} OS fechadas por técnicos ${TerceirasEngine.nomeTerceira(terceira)}</div></div>
                <select id="filtroSituacaoTerceiras" aria-label="Filtrar por situação">
                    <option value="todas"${terceirasFiltroSituacao === "todas" ? " selected" : ""}>Todas</option>
                    <option value="pagas"${terceirasFiltroSituacao === "pagas" ? " selected" : ""}>Pagas</option>
                    <option value="nao_pagas"${terceirasFiltroSituacao === "nao_pagas" ? " selected" : ""}>Não pagas</option>
                    <option value="pendentes"${terceirasFiltroSituacao === "pendentes" ? " selected" : ""}>Pendências</option>
                </select>
            </div>
            ${visiveis.length ? `
            <div class="tabela-scroll">
                <table class="tabela-alertas terceiras-tabela terceiras-detalhe">
                    <thead><tr><th>OS</th><th>Fechada em</th><th>Técnico</th><th>Cidade</th><th>Assunto</th><th>Diagnóstico</th><th>Situação</th><th class="num">Valor</th></tr></thead>
                    <tbody>${visiveis.map(i => `
                        <tr>
                            <td>${escaparHtml(String(i.os))}</td>
                            <td>${new Date(i.data).toLocaleDateString("pt-BR")}</td>
                            <td>${escaparHtml(i.tecnico ?? "")}</td>
                            <td>${escaparHtml(i.cidade ?? "")}</td>
                            <td>${escaparHtml(i.assunto ?? "")}</td>
                            <td>${escaparHtml(i.diagnostico ?? "")}</td>
                            <td>${chipSituacao(i.situacao)}</td>
                            <td class="num">${i.valor ? moeda(i.valor) : "—"}</td>
                        </tr>`).join("")}
                    </tbody>
                </table>
            </div>` : '<p class="alerta-vazio">Nenhuma OS nesse filtro.</p>'}
        </div>
    `;

    registrarBarraMes(container, renderizarTerceirasFechamento);
    container.querySelectorAll("[data-terceira]").forEach(b => b.addEventListener("click", () => {
        terceiraSelecionada = b.dataset.terceira;
        renderizarTerceirasFechamento();
    }));
    document.getElementById("filtroSituacaoTerceiras")?.addEventListener("change", e => {
        terceirasFiltroSituacao = e.target.value;
        renderizarTerceirasFechamento();
    });
    document.getElementById("btnPdfFechamento")?.addEventListener("click", () => imprimirFechamento(mes, terceira, itens, resumo, fechado));
    document.getElementById("btnCsvFechamento")?.addEventListener("click", () => baixarCsvFechamento(mes, terceira, itens));
    document.getElementById("btnFecharMes")?.addEventListener("click", () => fecharMesTerceira(mes, terceira, itens, resumo));
    document.getElementById("btnReabrirFechamento")?.addEventListener("click", () => reabrirMesTerceira(mes, terceira));
}

async function fecharMesTerceira(mes, terceira, itens, resumo) {
    const pendentes = resumo.semPreco + resumo.diagPendente;
    const aviso = `Fechar ${nomeMes(mes).toLowerCase()} da ${TerceirasEngine.nomeTerceira(terceira)} em ${moeda(resumo.total)} (${resumo.pagas} OS pagas)?\n\n` +
        (pendentes ? `Atenção: ${pendentes} OS com pendência (sem preço ou diagnóstico sem classificação) ficam FORA do pagamento.\n\n` : "") +
        "Depois de fechado, os valores ficam congelados.";
    if (!confirm(aviso)) return;

    const { data: sessao } = await supabaseClient.auth.getSession();
    const { porAssunto, ...contagens } = resumo;
    const { error } = await supabaseClient.from("terceiras_fechamentos").upsert({
        mes,
        terceira,
        total: Math.round(resumo.total * 100) / 100,
        resumo: { ...contagens, porAssunto },
        itens,
        aprovado_por: sessao?.session?.user?.email ?? APP.usuario?.email ?? null,
        aprovado_em: new Date().toISOString()
    });
    if (error) {
        alert(`Não deu pra fechar o mês: ${error.message}`);
        return;
    }
    await carregarFechamentosDoMes(mes, true);
    renderizarTerceirasFechamento();
}

async function reabrirMesTerceira(mes, terceira) {
    if (!confirm(`Reabrir ${nomeMes(mes).toLowerCase()} da ${TerceirasEngine.nomeTerceira(terceira)}? O fechamento congelado é apagado e volta a valer a prévia calculada.`)) return;
    const { error } = await supabaseClient.from("terceiras_fechamentos").delete().eq("mes", mes).eq("terceira", terceira);
    if (error) {
        alert(`Não deu pra reabrir: ${error.message}`);
        return;
    }
    await carregarFechamentosDoMes(mes, true);
    renderizarTerceirasFechamento();
}

function baixarCsvFechamento(mes, terceira, itens) {
    const linhas = [["OS", "Fechada em", "Técnico", "Cliente", "Login", "Cidade", "Bairro", "Assunto", "Diagnóstico", "Situação", "Valor"]];
    for (const i of itens) {
        linhas.push([i.os, new Date(i.data).toLocaleDateString("pt-BR"), i.tecnico, i.cliente, i.login, i.cidade, i.bairro, i.assunto, i.diagnostico,
            ROTULOS_SITUACAO[i.situacao] ?? i.situacao, (i.valor || 0).toFixed(2).replace(".", ",")]);
    }
    const csv = "﻿" + linhas.map(l => l.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `fechamento_${terceira.toLowerCase()}_${mes}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function imprimirFechamento(mes, terceira, itens, resumo, fechado) {
    const nome = TerceirasEngine.nomeTerceira(terceira);
    const pagas = itens.filter(i => i.situacao === "paga");
    const status = fechado
        ? `Fechado em ${new Date(fechado.aprovado_em).toLocaleDateString("pt-BR")}${fechado.aprovado_por ? ` por ${escaparHtml(fechado.aprovado_por)}` : ""}`
        : "PRÉVIA — mês ainda não fechado";
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Fechamento ${nome} — ${nomeMes(mes)}</title>
        <style>
            body{font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a;margin:32px;font-size:12px}
            h1{font-size:22px;margin:0}h2{font-size:15px;margin:24px 0 8px}
            .sub{color:#64748b;margin:4px 0 16px}.status{display:inline-block;padding:4px 10px;border-radius:999px;background:${fechado ? "#dcfce7;color:#166534" : "#fef3c7;color:#92400e"};font-weight:600}
            .kpis{display:flex;gap:12px;margin:16px 0}.kpi{flex:1;border:1px solid #e2e8f0;border-radius:10px;padding:10px 14px}.kpi b{display:block;font-size:18px;margin-top:2px}
            table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #e2e8f0}th{background:#f1f5f9}.num{text-align:right;white-space:nowrap}
            tfoot td{font-weight:700;border-top:2px solid #0f172a}
            .assinatura{display:flex;gap:48px;margin-top:56px}.assinatura div{flex:1;border-top:1px solid #0f172a;padding-top:6px;text-align:center;color:#475569}
            @media print{body{margin:12mm}tr{break-inside:avoid}}
        </style></head><body>
        <h1>Fechamento ${escaparHtml(nome)} — ${nomeMes(mes)}</h1>
        <p class="sub">COP Analytics · Gestão de Terceiras · gerado em ${new Date().toLocaleString("pt-BR")}</p>
        <span class="status">${status}</span>
        <div class="kpis">
            <div class="kpi">Total a pagar<b>${moeda(resumo.total)}</b></div>
            <div class="kpi">OS pagas<b>${resumo.pagas}</b></div>
            <div class="kpi">Não pagas<b>${resumo.improdutivas + resumo.naoPagas}</b></div>
            <div class="kpi">Pendências<b>${resumo.semPreco + resumo.diagPendente}</b></div>
        </div>
        <h2>Resumo por assunto</h2>
        <table><thead><tr><th>Assunto</th><th class="num">OS</th><th class="num">Valor LPU</th><th class="num">Subtotal</th></tr></thead>
        <tbody>${resumo.porAssunto.map(a => `<tr><td>${escaparHtml(a.assunto)}</td><td class="num">${a.quantidade}</td><td class="num">${moeda(a.valorUnitario)}</td><td class="num">${moeda(a.subtotal)}</td></tr>`).join("")}</tbody>
        <tfoot><tr><td>Total</td><td class="num">${resumo.pagas}</td><td></td><td class="num">${moeda(resumo.total)}</td></tr></tfoot></table>
        <h2>OS pagas (${pagas.length})</h2>
        <table><thead><tr><th>OS</th><th>Data</th><th>Técnico</th><th>Cidade</th><th>Assunto</th><th class="num">Valor</th></tr></thead>
        <tbody>${pagas.map(i => `<tr><td>${escaparHtml(String(i.os))}</td><td>${new Date(i.data).toLocaleDateString("pt-BR")}</td><td>${escaparHtml(i.tecnico ?? "")}</td><td>${escaparHtml(i.cidade ?? "")}</td><td>${escaparHtml(i.assunto ?? "")}</td><td class="num">${moeda(i.valor)}</td></tr>`).join("")}</tbody></table>
        <div class="assinatura"><div>Controle de Operações (COP)</div><div>${escaparHtml(nome)}</div></div>
        <script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script>
        </body></html>`;
    const janela = window.open(URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" })), "_blank");
    if (!janela) alert("O navegador bloqueou a janela. Libere pop-ups para este site e tente de novo.");
}

// ==========================================================
// LPU e diagnósticos
// ==========================================================

function lerNumeroLpu(valor) {
    if (valor === null || valor === undefined) return undefined;
    const texto = String(valor).trim().replace(/[R$\s]/g, "");
    if (texto === "") return undefined;
    const numero = Number(texto.includes(",") ? texto.replace(/\./g, "").replace(",", ".") : texto);
    return Number.isFinite(numero) ? numero : undefined;
}

async function renderizarTerceirasLpu() {
    const container = document.getElementById("terceirasLpuConteudo");
    if (!container || semDadosTerceiras(container)) return;

    try {
        await carregarConfigTerceiras();
    } catch (erro) {
        container.innerHTML = htmlErroTerceiras(erro);
        return;
    }

    if (!terceirasRascunho || !terceirasRascunhoAlterado) {
        terceirasRascunho = JSON.parse(JSON.stringify({ lpu: terceirasConfig.lpu, diagnosticos: terceirasConfig.diagnosticos }));
    }

    const editavel = podeEditarOperacao();
    const catalogo = TerceirasEngine.catalogo(analiseTerceiras());

    // Linhas = assuntos que as terceirizadas fecharam + os que já estão na LPU.
    const assuntos = new Map(catalogo.assuntos.map(a => [normalizarTexto(a.assunto), a]));
    for (const chave of Object.keys(terceirasRascunho.lpu)) {
        if (!assuntos.has(normalizarTexto(chave))) assuntos.set(normalizarTexto(chave), { assunto: chave, total: 0, porTerceira: {} });
    }
    const diagnosticos = new Map(catalogo.diagnosticos.map(d => [normalizarTexto(d.diagnostico), d]));
    for (const chave of Object.keys(terceirasRascunho.diagnosticos)) {
        if (!diagnosticos.has(normalizarTexto(chave))) diagnosticos.set(normalizarTexto(chave), { diagnostico: chave, total: 0 });
    }

    const precoRascunho = (assunto, terceira) => {
        const v = TerceirasEngine.precoLpu(terceirasRascunho, assunto, terceira);
        return v === undefined ? "" : String(v).replace(".", ",");
    };
    const produtivoRascunho = d => {
        const v = TerceirasEngine.diagnosticoProdutivo(terceirasRascunho, d);
        return v === true ? "sim" : v === false ? "nao" : "";
    };
    const semPreco = [...assuntos.values()].filter(a => TERCEIRAS.some(t => (a.porTerceira[t.id] ?? 0) > 0 && precoRascunho(a.assunto, t.id) === "")).length;
    const semClassificacao = [...diagnosticos.values()].filter(d => produtivoRascunho(d.diagnostico) === "").length;
    const atualizado = terceirasConfig.atualizado_em
        ? `Última alteração em ${new Date(terceirasConfig.atualizado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}${terceirasConfig.atualizado_por ? ` por ${escaparHtml(terceirasConfig.atualizado_por)}` : ""}.`
        : "Ainda não salva.";

    container.innerHTML = `
        <div class="terceiras-barra">
            <input type="search" id="buscaLpu" class="seletor-multiplo-input" placeholder="Buscar assunto ou diagnóstico...">
            <div class="terceiras-acoes">
                <button type="button" class="botao-secundario" id="btnExportarLpu">Exportar Excel</button>
                ${editavel ? `
                    <label class="botao-secundario terceiras-importar">Importar Excel<input type="file" id="arquivoLpu" accept=".xlsx,.xls" hidden></label>
                    <button type="button" class="botao-primario" id="btnSalvarLpu"${terceirasRascunhoAlterado ? "" : " disabled"}>${terceirasRascunhoAlterado ? "Salvar alterações" : "Salvo"}</button>` : ""}
            </div>
        </div>
        <p class="admin-dica terceiras-legenda-lpu">
            Valor pago por OS fechada e produtiva. <strong>Em branco</strong> = sem preço (fica como pendência e não paga);
            <strong>0</strong> = não paga de propósito. ${atualizado}
            ${editavel ? "" : " Você está vendo em modo leitura."}
        </p>

        <div class="grafico-card">
            <div class="grafico-cabecalho">
                <div>
                    <div class="grafico-titulo">LPU — preço por assunto</div>
                    <div class="grafico-subtitulo">${assuntos.size} assuntos · ${semPreco ? `<span class="terceiras-pendente">${semPreco} com OS e sem preço</span>` : "todos com preço"} · a coluna OS é o volume nos dados carregados</div>
                </div>
            </div>
            <div class="tabela-scroll">
                <table class="tabela-alertas terceiras-tabela terceiras-lpu" id="tabelaLpu">
                    <thead><tr><th>Assunto</th><th class="num">OS</th>${TERCEIRAS.map(t => `<th class="num">${t.nome} (R$)</th>`).join("")}</tr></thead>
                    <tbody>
                        ${[...assuntos.values()].map(a => `
                            <tr data-busca="${escaparHtml(normalizarTexto(a.assunto))}">
                                <td>${escaparHtml(a.assunto)}</td>
                                <td class="num">${a.total || "—"}</td>
                                ${TERCEIRAS.map(t => {
                                    const valor = precoRascunho(a.assunto, t.id);
                                    const falta = valor === "" && (a.porTerceira[t.id] ?? 0) > 0;
                                    return `<td class="num"><input type="text" inputmode="decimal" class="${falta ? "falta" : ""}" data-lpu-assunto="${escaparHtml(a.assunto)}" data-lpu-terceira="${t.id}" value="${escaparHtml(valor)}" placeholder="${falta ? "sem preço" : "—"}" title="${a.porTerceira[t.id] ?? 0} OS da ${t.nome}"${editavel ? "" : " disabled"}></td>`;
                                }).join("")}
                            </tr>`).join("")}
                    </tbody>
                </table>
            </div>
        </div>

        <div class="grafico-card">
            <div class="grafico-cabecalho">
                <div>
                    <div class="grafico-titulo">Diagnósticos — o fechamento é produtivo?</div>
                    <div class="grafico-subtitulo">Só fechamento produtivo é pago · ${semClassificacao ? `<span class="terceiras-pendente">${semClassificacao} sem classificação</span>` : "todos classificados"}</div>
                </div>
                ${editavel ? '<button type="button" class="botao-secundario" id="btnPreencherDiagnosticos" title="Usa a lista de Configurações > Diagnósticos Improdutivos para classificar os que estão em branco">Preencher pelos improdutivos</button>' : ""}
            </div>
            <div class="tabela-scroll">
                <table class="tabela-alertas terceiras-tabela" id="tabelaDiagnosticosLpu">
                    <thead><tr><th>Diagnóstico</th><th class="num">OS</th><th>Produtivo?</th></tr></thead>
                    <tbody>
                        ${[...diagnosticos.values()].map(d => {
                            const v = produtivoRascunho(d.diagnostico);
                            return `
                            <tr data-busca="${escaparHtml(normalizarTexto(d.diagnostico))}">
                                <td>${escaparHtml(d.diagnostico)}</td>
                                <td class="num">${d.total || "—"}</td>
                                <td>
                                    <select data-diag="${escaparHtml(d.diagnostico)}" class="${v === "" ? "falta" : ""}"${editavel ? "" : " disabled"}>
                                        <option value=""${v === "" ? " selected" : ""}>— sem classificação</option>
                                        <option value="sim"${v === "sim" ? " selected" : ""}>Sim, produtivo (paga)</option>
                                        <option value="nao"${v === "nao" ? " selected" : ""}>Não, improdutivo</option>
                                    </select>
                                </td>
                            </tr>`;
                        }).join("")}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    const marcarAlterado = () => {
        terceirasRascunhoAlterado = true;
        const botao = document.getElementById("btnSalvarLpu");
        if (botao) { botao.disabled = false; botao.textContent = "Salvar alterações"; }
    };

    container.querySelectorAll("[data-lpu-assunto]").forEach(input => input.addEventListener("change", () => {
        const assunto = input.dataset.lpuAssunto;
        const chave = Object.keys(terceirasRascunho.lpu).find(k => normalizarTexto(k) === normalizarTexto(assunto)) ?? assunto;
        const valor = lerNumeroLpu(input.value);
        terceirasRascunho.lpu[chave] ??= {};
        if (valor === undefined) delete terceirasRascunho.lpu[chave][input.dataset.lpuTerceira];
        else terceirasRascunho.lpu[chave][input.dataset.lpuTerceira] = valor;
        input.value = valor === undefined ? "" : String(valor).replace(".", ",");
        input.classList.toggle("falta", valor === undefined && input.placeholder === "sem preço");
        marcarAlterado();
    }));

    container.querySelectorAll("[data-diag]").forEach(select => select.addEventListener("change", () => {
        const diag = select.dataset.diag;
        const chave = Object.keys(terceirasRascunho.diagnosticos).find(k => normalizarTexto(k) === normalizarTexto(diag)) ?? diag;
        if (select.value === "") delete terceirasRascunho.diagnosticos[chave];
        else terceirasRascunho.diagnosticos[chave] = select.value === "sim";
        select.classList.toggle("falta", select.value === "");
        marcarAlterado();
    }));

    document.getElementById("buscaLpu")?.addEventListener("input", e => {
        const termo = normalizarTexto(e.target.value);
        container.querySelectorAll("tr[data-busca]").forEach(tr => { tr.hidden = !!termo && !tr.dataset.busca.includes(termo); });
    });

    document.getElementById("btnSalvarLpu")?.addEventListener("click", salvarLpu);
    document.getElementById("btnExportarLpu")?.addEventListener("click", () => exportarLpu([...assuntos.values()], [...diagnosticos.values()]));
    document.getElementById("arquivoLpu")?.addEventListener("change", e => importarLpu(e.target.files?.[0]));
    document.getElementById("btnPreencherDiagnosticos")?.addEventListener("click", () => {
        const improdutivos = APP.configuracoes.diagnosticosImprodutivos ?? new Set();
        if (improdutivos.size === 0) {
            alert("A lista de Diagnósticos Improdutivos (Configurações) está vazia — classifique aqui manualmente.");
            return;
        }
        let preenchidos = 0;
        for (const d of diagnosticos.values()) {
            if (produtivoRascunho(d.diagnostico) !== "") continue;
            terceirasRascunho.diagnosticos[d.diagnostico] = !improdutivos.has(normalizarTexto(d.diagnostico));
            preenchidos++;
        }
        terceirasRascunhoAlterado = preenchidos > 0 || terceirasRascunhoAlterado;
        renderizarTerceirasLpu();
        if (preenchidos) alert(`${preenchidos} diagnósticos classificados. Confira e clique em "Salvar alterações".`);
    });
}

async function salvarLpu() {
    const botao = document.getElementById("btnSalvarLpu");
    if (botao) { botao.disabled = true; botao.textContent = "Salvando..."; }

    // Tira assuntos que ficaram sem nenhum preço.
    for (const [chave, precos] of Object.entries(terceirasRascunho.lpu)) {
        if (!precos || Object.keys(precos).length === 0) delete terceirasRascunho.lpu[chave];
    }

    const registro = {
        id: "default",
        lpu: terceirasRascunho.lpu,
        diagnosticos: terceirasRascunho.diagnosticos,
        atualizado_por: APP.usuario?.email ?? null,
        atualizado_em: new Date().toISOString()
    };
    const { error } = await supabaseClient.from("terceiras_config").upsert(registro);
    if (error) {
        alert(`Não deu pra salvar a LPU: ${error.message}`);
        if (botao) { botao.disabled = false; botao.textContent = "Salvar alterações"; }
        return;
    }
    terceirasConfig = registro;
    terceirasRascunhoAlterado = false;
    renderizarTerceirasLpu();
}

function exportarLpu(assuntos, diagnosticos) {
    const lpu = [["ASSUNTO", "QTD OS (ref.)", ...TERCEIRAS.map(t => t.id)]];
    for (const a of assuntos) {
        lpu.push([a.assunto, a.total, ...TERCEIRAS.map(t => TerceirasEngine.precoLpu(terceirasRascunho, a.assunto, t.id) ?? "")]);
    }
    const diags = [["DIAGNOSTICO", "QTD OS (ref.)", "PRODUTIVO (SIM/NÃO)"]];
    for (const d of diagnosticos) {
        const v = TerceirasEngine.diagnosticoProdutivo(terceirasRascunho, d.diagnostico);
        diags.push([d.diagnostico, d.total, v === true ? "SIM" : v === false ? "NÃO" : ""]);
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(lpu), "LPU");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(diags), "DIAGNOSTICOS");
    XLSX.writeFile(wb, `LPU Terceirizadas ${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/**
 * Lê o Excel no formato do modelo (abas LPU e DIAGNOSTICOS) e joga no
 * rascunho — só grava no banco quando clicar em "Salvar alterações".
 * Coluna de terceirizada é achada pelo nome (AZUL, VELOZ, TECHNOMAIS);
 * célula vazia não apaga o preço que já existe.
 */
async function importarLpu(arquivo) {
    if (!arquivo) return;
    try {
        const wb = XLSX.read(await arquivo.arrayBuffer(), { type: "array" });
        const aba = nome => wb.SheetNames.find(n => normalizarTexto(n) === nome);
        let precos = 0, diags = 0;

        const abaLpu = aba("LPU");
        if (abaLpu) {
            const linhas = XLSX.utils.sheet_to_json(wb.Sheets[abaLpu], { header: 1, defval: "" });
            const cabecalho = (linhas[0] ?? []).map(c => normalizarTexto(c));
            const colAssunto = cabecalho.findIndex(c => c === "ASSUNTO");
            const colunas = TERCEIRAS.map(t => ({ id: t.id, col: cabecalho.findIndex(c => t.sufixos.includes(c) || c === t.id) })).filter(c => c.col >= 0);
            for (const linha of linhas.slice(1)) {
                const assunto = String(linha[colAssunto] ?? "").trim();
                if (!assunto) continue;
                for (const { id, col } of colunas) {
                    const valor = lerNumeroLpu(linha[col]);
                    if (valor === undefined) continue;
                    const chave = Object.keys(terceirasRascunho.lpu).find(k => normalizarTexto(k) === normalizarTexto(assunto)) ?? assunto;
                    terceirasRascunho.lpu[chave] ??= {};
                    terceirasRascunho.lpu[chave][id] = valor;
                    precos++;
                }
            }
        }

        const abaDiag = aba("DIAGNOSTICOS");
        if (abaDiag) {
            const linhas = XLSX.utils.sheet_to_json(wb.Sheets[abaDiag], { header: 1, defval: "" });
            const cabecalho = (linhas[0] ?? []).map(c => normalizarTexto(c));
            const colDiag = cabecalho.findIndex(c => c.startsWith("DIAGNOSTICO"));
            const colProd = cabecalho.findIndex(c => c.startsWith("PRODUTIVO"));
            for (const linha of linhas.slice(1)) {
                const diag = String(linha[colDiag] ?? "").trim();
                const resposta = normalizarTexto(linha[colProd] ?? "");
                if (!diag || !["SIM", "NAO", "S", "N"].includes(resposta)) continue;
                const chave = Object.keys(terceirasRascunho.diagnosticos).find(k => normalizarTexto(k) === normalizarTexto(diag)) ?? diag;
                terceirasRascunho.diagnosticos[chave] = resposta.startsWith("S");
                diags++;
            }
        }

        if (!precos && !diags) {
            alert("Não achei nada pra importar. O arquivo precisa das abas LPU (ASSUNTO + colunas AZUL/VELOZ/TECHNOMAIS) e/ou DIAGNOSTICOS (DIAGNOSTICO + PRODUTIVO).");
            return;
        }
        terceirasRascunhoAlterado = true;
        renderizarTerceirasLpu();
        alert(`Importado: ${precos} preços e ${diags} diagnósticos. Confira e clique em "Salvar alterações".`);
    } catch (erro) {
        alert(`Não deu pra ler o arquivo: ${erro.message}`);
    }
}

// ==========================================================
// Qualidade
// ==========================================================

function renderizarTerceirasQualidade() {
    const container = document.getElementById("terceirasQualidadeConteudo");
    if (!container || semDadosTerceiras(container)) return;

    const mes = mesAtualTerceiras();
    const qualidade = TerceirasEngine.qualidadeDoMes(mes, analiseTerceiras());
    const pct = (parte, total) => total ? `${((parte / total) * 100).toFixed(1)}%` : "—";

    const retornos = [...qualidade.values()]
        .flatMap(q => q.retornos.map(r => ({ ...r, terceira: q.terceira })))
        .filter(r => terceirasFiltroQualidade === "todas" || r.terceira === terceirasFiltroQualidade)
        .sort((a, b) => a.dias - b.dias);

    container.innerHTML = `
        ${htmlBarraMes()}
        <p class="admin-dica terceiras-legenda-lpu">Só para acompanhamento: retrabalho não desconta do pagamento. Retorno = o mesmo cliente abriu outra OS em até ${TerceirasEngine.DIAS_RETORNO} dias depois do fechamento.</p>

        <div class="terceiras-cards">
            ${TERCEIRAS.map(t => {
                const q = qualidade.get(t.id);
                return `
                <div class="terceiras-card terceiras-card-estatico">
                    <div class="terceiras-card-topo"><h3>${t.nome}</h3><span class="admin-dica">${q.fechadas} OS fechadas</span></div>
                    <div class="terceiras-qualidade-linhas">
                        <div><span>Reabertas</span><strong>${q.reabertas}</strong><em>${pct(q.reabertas, q.fechadas)}</em></div>
                        <div><span>Retornos em ${TerceirasEngine.DIAS_RETORNO} dias</span><strong>${q.retornos.length}</strong><em>${pct(q.retornos.length, q.fechadas)}</em></div>
                        <div><span>Garantias</span><strong>${q.garantias}</strong><em>${pct(q.garantias, q.fechadas)}</em></div>
                    </div>
                </div>`;
            }).join("")}
        </div>

        <div class="grafico-card">
            <div class="grafico-cabecalho">
                <div><div class="grafico-titulo">Retornos</div><div class="grafico-subtitulo">OS fechadas em ${nomeMes(mes).toLowerCase()} em que o cliente voltou</div></div>
                <select id="filtroQualidadeTerceira" aria-label="Terceirizada">
                    <option value="todas">Todas</option>
                    ${TERCEIRAS.map(t => `<option value="${t.id}"${terceirasFiltroQualidade === t.id ? " selected" : ""}>${t.nome}</option>`).join("")}
                </select>
            </div>
            ${retornos.length ? `
            <div class="tabela-scroll">
                <table class="tabela-alertas terceiras-tabela terceiras-detalhe">
                    <thead><tr><th>OS</th><th>Técnico</th><th>Cliente</th><th>Assunto</th><th>Fechada</th><th>Voltou com</th><th>Assunto do retorno</th><th class="num">Dias</th></tr></thead>
                    <tbody>${retornos.map(r => `
                        <tr>
                            <td>${escaparHtml(String(r.os))}</td>
                            <td>${escaparHtml(r.tecnico ?? "")}</td>
                            <td>${escaparHtml(r.cliente ?? "")}</td>
                            <td>${escaparHtml(r.assunto ?? "")}</td>
                            <td>${r.fechadaEm.toLocaleDateString("pt-BR")}</td>
                            <td>OS ${escaparHtml(String(r.osRetorno))}</td>
                            <td>${escaparHtml(r.assuntoRetorno ?? "")}${r.garantia ? ' <span class="terceiras-chip situacao-pag-sem_preco">garantia</span>' : ""}</td>
                            <td class="num">${r.dias}</td>
                        </tr>`).join("")}
                    </tbody>
                </table>
            </div>` : '<p class="alerta-vazio">Nenhum retorno neste mês.</p>'}
        </div>
    `;

    registrarBarraMes(container, renderizarTerceirasQualidade);
    document.getElementById("filtroQualidadeTerceira")?.addEventListener("change", e => {
        terceirasFiltroQualidade = e.target.value;
        renderizarTerceirasQualidade();
    });
}

function registrarTerceiras() {
    // Busca de novo no banco (outra pessoa pode ter mudado a LPU ou fechado um mês).
    document.querySelectorAll("[data-atualizar-terceiras]").forEach(botao => botao.addEventListener("click", () => {
        terceirasConfig = null;
        terceirasFechamentosCache.clear();
        if (!terceirasRascunhoAlterado) terceirasRascunho = null;
        renderizarSecaoAtiva();
    }));
}
