// "Ordens comerciais em aberto" sem banco (Ordens comerciais.html, aberta do disco):
// o robô grava comerciais-dados.js na mesma pasta a cada ~10 min (foto da 529 +
// movimentações do dia). Mesma regra do site: OS em aberto com "comercial" no assunto.
// Temporário, enquanto o Supabase está fora.

const COM_PARADO_MIN = 30;
const COM_DIAS_PARADA = 3;
const COM_EVENTOS = {
    1: "Abertura", 2: "Alteração", 3: "Reabertura", 4: "Alteração de setor", 5: "Agendamento",
    6: "Fechamento", 8: "Assumido", 9: "Em execução", 10: "Reagendar", 16: "Registro de mensagem", 19: "Confirmação de agendamento"
};

const comNorm = t => String(t ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
const comEsc = t => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const comCurto = a => { const s = String(a || "").replace(/\s*\(\d+\)/g, "").trim().toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); };
function comData(s) {
    const m = String(s || "").match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    return m && m[3] !== "0000" ? new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) : null;
}
const comHora = d => d ? d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
function comHaQuanto(d) {
    if (!d) return "—";
    const min = Math.max(0, (Date.now() - d.getTime()) / 60000);
    if (min < 60) return `${Math.round(min)} min`;
    if (min < 1440) return `${Math.floor(min / 60)} h`;
    const dias = Math.floor(min / 1440);
    return `${dias} dia${dias > 1 ? "s" : ""}`;
}

let comVersao = null, comFiltro = { busca: "", cidade: "", assunto: "", situacao: "todas" }, comAbertas = new Set(), comLista = [];

function comAgregar(linhas) {
    const os = new Map();
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const amanha = hoje.getTime() + 86400000;
    for (const d of linhas) {
        const id = String(d["ID OS"] || "").trim();
        if (!id) continue;
        let o = os.get(id);
        if (!o) {
            o = { id, cliente: d.CLIENTE, assunto: d.ASSUNTO, cidade: d.CIDADE, bairro: d.BAIRRO, login: d.LOGIN,
                abertura: comData(d["DATA/HORA ABERTURA"]), agendamento: null, statusUlt: null, statusData: null, eventos: [] };
            os.set(id, o);
        }
        const data = comData(d.DATA);
        o.eventos.push({ data, evento: +d.EVENTO, status: d.STATUS, msg: d.MENSAGEM, equipe: d.EQUIPE });
        if (data && (!o.statusData || data >= o.statusData)) { o.statusData = data; o.statusUlt = d.STATUS; }
        const ag = comData(d.AGENDAMENTO);
        if (ag && (!o.agendamento || ag > o.agendamento)) o.agendamento = ag;
    }
    const agora = Date.now();
    const lista = [];
    for (const o of os.values()) {
        if (comNorm(o.statusUlt) === "finalizada") continue;
        o.eventos.sort((a, b) => (a.data || 0) - (b.data || 0));
        if (!o.abertura) o.abertura = o.eventos[0]?.data || null;
        const st = comNorm(o.statusUlt);
        o.emCampo = st === "deslocamento" || st.includes("execu");
        o.reagHoje = o.eventos.some(e => e.evento === 10 && e.data && e.data.getTime() >= hoje.getTime());
        o.hoje = !!o.agendamento && o.agendamento.getTime() >= hoje.getTime() && o.agendamento.getTime() < amanha;
        o.vencida = !!o.agendamento && o.agendamento.getTime() < agora && !o.emCampo && comNorm(o.statusUlt) === "agendada";
        o.semAgenda = !o.agendamento || (comNorm(o.statusUlt) !== "agendada" && !o.emCampo && o.agendamento.getTime() < hoje.getTime());
        o.parada = !!o.abertura && (agora - o.abertura.getTime()) > COM_DIAS_PARADA * 86400000;
        const ult = [...o.eventos].reverse().find(e => String(e.msg || "").trim());
        o.ultimaMsg = ult ? String(ult.msg).replace(/\s+/g, " ").trim() : "";
        lista.push(o);
    }
    return lista.sort((a, b) => (a.abertura || 0) - (b.abertura || 0));
}

const COM_SITUACOES = [
    { id: "todas", nome: "Todas", teste: () => true },
    { id: "sem", nome: "Sem agendamento", teste: o => o.semAgenda },
    { id: "hoje", nome: "Agendadas para hoje", teste: o => o.hoje },
    { id: "vencida", nome: "Horário vencido", teste: o => o.vencida },
    { id: "campo", nome: "Técnico em campo", teste: o => o.emCampo },
    { id: "parada", nome: `Abertas há +${COM_DIAS_PARADA} dias`, teste: o => o.parada },
    { id: "reag", nome: "Reagendadas hoje", teste: o => o.reagHoje }
];

function comFiltrar() {
    const f = comFiltro, b = comNorm(f.busca), sit = COM_SITUACOES.find(s => s.id === f.situacao) || COM_SITUACOES[0];
    return comLista.filter(o =>
        (!f.cidade || o.cidade === f.cidade) &&
        (!f.assunto || comCurto(o.assunto) === f.assunto) &&
        sit.teste(o) &&
        (!b || comNorm(`${o.id} ${o.cliente} ${o.login} ${o.bairro}`).includes(b)));
}

function comSituacaoTag(o) {
    if (o.emCampo) return `<span class="tag campo">${comEsc(o.statusUlt)}</span>`;
    if (o.vencida) return `<span class="tag vencida">Horário vencido</span>`;
    if (o.hoje) return `<span class="tag hoje">Agendada hoje</span>`;
    if (o.semAgenda) return `<span class="tag sem">Sem agendamento</span>`;
    return `<span class="tag">${comEsc(o.statusUlt || "—")}</span>`;
}

function comDesenhar() {
    const box = document.getElementById("comConteudo");
    const lista = comFiltrar();
    const conta = id => comLista.filter(COM_SITUACOES.find(s => s.id === id).teste).length;
    document.getElementById("comKpis").innerHTML = COM_SITUACOES.map(s => `
        <button type="button" class="kpi${comFiltro.situacao === s.id ? " on" : ""} k-${s.id}" data-sit="${s.id}">
            <span class="n">${s.id === "todas" ? comLista.length : conta(s.id)}</span><span class="r">${s.id === "todas" ? "Em aberto" : s.nome}</span>
        </button>`).join("");
    document.querySelectorAll("#comKpis [data-sit]").forEach(b => b.addEventListener("click", () => { comFiltro.situacao = b.dataset.sit; comDesenhar(); }));

    const porAssunto = new Map();
    comLista.forEach(o => porAssunto.set(comCurto(o.assunto), (porAssunto.get(comCurto(o.assunto)) || 0) + 1));
    document.getElementById("comAssuntos").innerHTML = [...porAssunto.entries()].sort((a, b) => b[1] - a[1]).map(([a, n]) =>
        `<button type="button" class="chip${comFiltro.assunto === a ? " on" : ""}" data-ass="${comEsc(a)}">${comEsc(a)} <b>${n}</b></button>`).join("");
    document.querySelectorAll("#comAssuntos [data-ass]").forEach(b => b.addEventListener("click", () => {
        comFiltro.assunto = comFiltro.assunto === b.dataset.ass ? "" : b.dataset.ass; comDesenhar();
    }));

    const selCid = document.getElementById("comCidade");
    const cidades = [...new Set(comLista.map(o => o.cidade).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    selCid.innerHTML = `<option value="">Todas as cidades</option>` + cidades.map(c => `<option${c === comFiltro.cidade ? " selected" : ""}>${comEsc(c)}</option>`).join("");

    document.getElementById("comResumo").textContent = `${lista.length} de ${comLista.length} OS`;
    if (!lista.length) { box.innerHTML = `<div class="vazio">Nenhuma OS comercial em aberto neste recorte.</div>`; return; }
    box.innerHTML = `<table class="tabela"><thead><tr>
            <th>OS</th><th>Cliente</th><th>Assunto</th><th>Cidade · Bairro</th><th>Aberta há</th><th>Situação</th><th>Agendamento</th><th>Última mensagem</th>
        </tr></thead><tbody>${lista.map(o => `
        <tr class="linha${comAbertas.has(o.id) ? " aberta" : ""}" data-os="${o.id}">
            <td class="os">#${o.id}</td>
            <td>${comEsc(o.cliente)}${o.login ? `<small>${comEsc(o.login)}</small>` : ""}</td>
            <td>${comEsc(comCurto(o.assunto))}</td>
            <td>${comEsc(o.cidade || "—")}${o.bairro ? `<small>${comEsc(o.bairro)}</small>` : ""}</td>
            <td class="${o.parada ? "alerta" : ""}" title="${comHora(o.abertura)}">${comHaQuanto(o.abertura)}</td>
            <td>${comSituacaoTag(o)}<small>desde ${comHora(o.statusData)}</small></td>
            <td>${o.agendamento ? comHora(o.agendamento) : "—"}</td>
            <td class="msg" title="${comEsc(o.ultimaMsg)}">${comEsc(o.ultimaMsg.slice(0, 140))}</td>
        </tr>${comAbertas.has(o.id) ? `<tr class="hist"><td colspan="8"><ol>${o.eventos.map(e => `
            <li><b>${comHora(e.data)}</b> · ${comEsc(COM_EVENTOS[e.evento] || "Evento " + e.evento)} · <i>${comEsc(e.status || "")}</i>${e.equipe ? ` · ${comEsc(e.equipe)}` : ""}
            ${String(e.msg || "").trim() ? `<div>${comEsc(String(e.msg).trim())}</div>` : ""}</li>`).join("")}</ol></td></tr>` : ""}`).join("")}
        </tbody></table>`;
    box.querySelectorAll("tr.linha").forEach(tr => tr.addEventListener("click", () => {
        const id = tr.dataset.os;
        comAbertas.has(id) ? comAbertas.delete(id) : comAbertas.add(id);
        comDesenhar();
    }));
}

function comRecarregarDados() {
    return new Promise(resolve => {
        const antigo = document.getElementById("comDados");
        const s = document.createElement("script");
        s.id = "comDados";
        s.src = "comerciais-dados.js?t=" + Date.now();
        s.onload = s.onerror = () => { if (antigo && antigo !== s) antigo.remove(); resolve(); };
        document.head.appendChild(s);
    });
}

async function comAtualizar(primeira = false) {
    if (!primeira) await comRecarregarDados();
    const d = window.COM_DADOS;
    const aviso = document.getElementById("comAviso");
    if (!d) { aviso.hidden = false; aviso.textContent = "Ainda não há dados do robô nesta pasta (comerciais-dados.js)."; return; }
    if (d.versaoPagina && comVersao && d.versaoPagina !== comVersao) { location.reload(); return; }
    if (d.versaoPagina) comVersao = d.versaoPagina;
    comLista = comAgregar(d.linhas || []);
    const gerado = new Date(d.geradoEm);
    const idade = (Date.now() - gerado.getTime()) / 60000;
    aviso.hidden = idade <= COM_PARADO_MIN;
    if (!aviso.hidden) aviso.textContent = `O robô não atualiza os dados desde ${comHora(gerado)} — mostrando o último retrato.`;
    document.getElementById("comAtualizado").textContent = `dados de ${comHora(gerado)}${d.fotoEm ? ` · foto completa do IXC às ${comHora(new Date(d.fotoEm))}` : ""}`;
    comDesenhar();
}

function comTema(t) {
    document.documentElement.dataset.tema = t;
    document.getElementById("comBtnTema").textContent = t === "dark" ? "☀ Claro" : "🌙 Escuro";
    try { localStorage.setItem("com.tema", t); } catch {}
}

document.addEventListener("DOMContentLoaded", () => {
    let t = "dark"; try { t = localStorage.getItem("com.tema") || t; } catch {}
    comTema(t);
    document.getElementById("comBtnTema").addEventListener("click", () => comTema(document.documentElement.dataset.tema === "dark" ? "light" : "dark"));
    document.getElementById("comBusca").addEventListener("input", e => { comFiltro.busca = e.target.value; comDesenhar(); });
    document.getElementById("comCidade").addEventListener("change", e => { comFiltro.cidade = e.target.value; comDesenhar(); });
    document.getElementById("comLimpar").addEventListener("click", () => {
        comFiltro = { busca: "", cidade: "", assunto: "", situacao: "todas" };
        document.getElementById("comBusca").value = "";
        comDesenhar();
    });
    comAtualizar(true);
    setInterval(comAtualizar, 2 * 60 * 1000);
});
