// Agenda > Agendadas (23/11/2026): OS em aberto com agendamento num dia escolhido (amanhã por padrão),
// cruzando SETOR × CIDADE. Lê o mesmo arquivo das OS em aberto (R2, buscarOsPendentesCacheado).
// A coluna SETOR vem do robô pelas grids do IXC (desde 23/11); sem ela, tudo cai em "Sem setor".
(function () {
    const SEM_SETOR = "Sem setor";
    let diaOffset = 1;                 // 0 = hoje, 1 = amanhã...
    let filtro = { setor: null, cidade: null };
    let busca = "";
    let cache = null;                  // { porOs: Map, geradoEm, temSetor }

    const norm = t => String(t ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
    // setores que não entram nas Agendadas (24/11: infraestrutura não é da operação do COP)
    const SETORES_FORA = new Set(["tecnico infraestrutura amo"]);
    const esc = t => (typeof escaparHtml === "function" ? escaparHtml(t) : String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
    const dataBR = s => {
        const m = String(s || "").match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2}))?/);
        return m && m[3] !== "0000" ? new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0)) : null;
    };
    const isoDia = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const nomeBonito = s => {
        const t = String(s || "").trim();
        if (!t) return "";
        return t.toLowerCase().replace(/(^|[\s\-\/(])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\b(De|Da|Do|Das|Dos|E)\b/g, w => w.toLowerCase());
    };
    const diaAlvo = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + diaOffset); return d; };
    const rotuloDia = () => {
        const d = diaAlvo();
        const nome = diaOffset === 0 ? "Hoje" : diaOffset === 1 ? "Amanhã" : diaOffset === -1 ? "Ontem" : d.toLocaleDateString("pt-BR", { weekday: "long" });
        return `${nome.charAt(0).toUpperCase() + nome.slice(1)}, ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`;
    };

    /** uma entrada por OS: dados da OS + status/equipe da última movimentação */
    function montar(linhas) {
        const porOs = new Map();
        let temSetor = false;
        for (const l of linhas) {
            const r = l.dados || l;
            const id = String(r["ID OS"] ?? "").trim();
            if (!id) continue;
            if (r.SETOR) temSetor = true;
            const quando = dataBR(r.DATA);
            let o = porOs.get(id);
            if (!o) {
                o = { id, agenda: dataBR(r.AGENDAMENTO), setor: String(r.SETOR || "").trim(), cidade: nomeBonito(r.CIDADE),
                    bairro: nomeBonito(r.BAIRRO), cliente: String(r.CLIENTE || "").trim(), assunto: String(r.ASSUNTO || "").trim(),
                    prioridade: String(r.PRIORIDADE || ""), status: "", equipe: "", ultima: null, msgs: [] };
                porOs.set(id, o);
            }
            o.msgs.push({ data: quando, status: String(r.STATUS || "").trim(), msg: String(r.MENSAGEM || "").trim(), tarefa: String(r["PRAXIMA TAREFA"] || "").trim() });
            if (!o.agenda && r.AGENDAMENTO) o.agenda = dataBR(r.AGENDAMENTO);
            if (!o.setor && r.SETOR) o.setor = String(r.SETOR).trim();
            if (quando && (!o.ultima || quando >= o.ultima)) {
                o.ultima = quando;
                o.status = String(r.STATUS || "").trim();
                if (r.EQUIPE) o.equipe = String(r.EQUIPE).trim();
            }
        }
        const geradoEm = linhas[0] && linhas[0].capturado_em;
        return { porOs, temSetor, geradoEm };
    }

    function osDoDia() {
        const alvo = isoDia(diaAlvo());
        const out = [];
        for (const o of cache.porOs.values()) {
            if (!o.agenda || isoDia(o.agenda) !== alvo) continue;
            if (norm(o.status) === "finalizada") continue;
            if (SETORES_FORA.has(norm(o.setor))) continue;
            out.push({ ...o, setorRot: o.setor || SEM_SETOR, cidadeRot: o.cidade || "Sem cidade" });
        }
        return out;
    }

    function contarPor(lista, campo) {
        const m = new Map();
        for (const o of lista) m.set(o[campo], (m.get(o[campo]) || 0) + 1);
        return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"));
    }

    // Dois lugares (23/11): aba "Ordens" = só o relatório (totais + setor × cidade);
    // aba "Agenda" > "Agendadas" = a lista das OS. Mesmo dia e filtros nos dois.
    const ID_REL = "agendaAgendadasConteudo", ID_LST = "agendaListaAgendadasConteudo";
    const hora = d => d ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";

    function render() {
        if (!cache) return;
        const todas = osDoDia();
        const ctx = { todas, setores: contarPor(todas, "setorRot"), cidades: contarPor(todas, "cidadeRot") };
        const rel = document.getElementById(ID_REL), lst = document.getElementById(ID_LST);
        if (rel) { rel.innerHTML = htmlTopo(ctx, "rel") + htmlRelatorio(ctx); ligar(rel, ctx); }
        if (lst) { lst.innerHTML = htmlTopo(ctx, "lst") + htmlLista(ctx); ligar(lst, ctx); }
    }

    function htmlTopo({ todas }, modo) {
        const atualizado = cache.geradoEm ? new Date(cache.geradoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
        return `
          <div class="ag-topo">
            <div class="ag-dia">
              <button type="button" class="ag-seta" data-ag-dia="-1" aria-label="Dia anterior">‹</button>
              <button type="button" class="ag-chip ${diaOffset === 0 ? "on" : ""}" data-ag-ir="0">Hoje</button>
              <button type="button" class="ag-chip ${diaOffset === 1 ? "on" : ""}" data-ag-ir="1">Amanhã</button>
              <button type="button" class="ag-seta" data-ag-dia="1" aria-label="Próximo dia">›</button>
              <strong class="ag-dia-rot">${esc(rotuloDia())}</strong>
            </div>
            <div class="ag-acoes">
              ${atualizado ? `<span class="ag-suave">Dados do IXC às ${atualizado}</span>` : ""}
              ${modo === "lst" ? `<button type="button" class="ag-btn" data-ag-csv ${todas.length ? "" : "disabled"}>⬇ Planilha</button>` : ""}
              <button type="button" class="ag-btn" data-ag-recarregar title="Buscar de novo">↻</button>
            </div>
          </div>
          ${!cache.temSetor ? `<p class="ag-aviso">O setor das OS começa a vir na próxima atualização do robô — por enquanto aparece "Sem setor".</p>` : ""}`;
    }

    const vazio = () => `<div class="ag-card ag-vazio">Nenhuma OS em aberto agendada para ${esc(rotuloDia().toLowerCase())}.</div>`;

    function htmlRelatorio({ todas, setores, cidades }) {
        if (!todas.length) return vazio();
        const celula = new Map();
        for (const o of todas) { const k = o.setorRot + "\u0001" + o.cidadeRot; celula.set(k, (celula.get(k) || 0) + 1); }
        const maxCel = Math.max(1, ...celula.values());
        return `
          <div class="ag-kpis">
            <div class="ag-kpi ag-kpi-total"><span>OS agendadas</span><b>${todas.length}</b></div>
            ${setores.slice(0, 4).map(([s, n]) => `<button type="button" class="ag-kpi" data-ag-setor="${esc(s)}" title="Ver as OS deste setor na Agenda"><span>${esc(s)}</span><b>${n}</b></button>`).join("")}
          </div>
          <div class="ag-card">
            <div class="ag-card-tit">Setor × cidade <span class="ag-suave">clique num número, setor ou cidade para ver as OS na Agenda</span></div>
            <div class="ag-matriz-wrap">
              <table class="ag-matriz">
                <thead><tr><th>Setor</th>${cidades.map(([c]) => `<th><button type="button" data-ag-cidade="${esc(c)}">${esc(c)}</button></th>`).join("")}<th class="ag-tot">Total</th></tr></thead>
                <tbody>
                  ${setores.map(([s, n]) => `<tr>
                    <th><button type="button" data-ag-setor="${esc(s)}">${esc(s)}</button></th>
                    ${cidades.map(([c]) => { const v = celula.get(s + "\u0001" + c) || 0;
                        return v ? `<td><button type="button" class="ag-cel" style="--i:${(0.12 + 0.6 * v / maxCel).toFixed(2)}" data-ag-cel-s="${esc(s)}" data-ag-cel-c="${esc(c)}">${v}</button></td>` : `<td class="ag-zero">·</td>`; }).join("")}
                    <td class="ag-tot">${n}</td></tr>`).join("")}
                </tbody>
                <tfoot><tr><th>Total</th>${cidades.map(([, n]) => `<td class="ag-tot">${n}</td>`).join("")}<td class="ag-tot">${todas.length}</td></tr></tfoot>
              </table>
            </div>
          </div>`;
    }

    function listaFiltrada(todas) {
        const q = norm(busca);
        return todas.filter(o => (!filtro.setor || o.setorRot === filtro.setor) && (!filtro.cidade || o.cidadeRot === filtro.cidade)
            && (!q || norm(`${o.id} ${o.cliente} ${o.bairro} ${o.assunto} ${o.equipe}`).includes(q)))
            .sort((a, b) => a.cidadeRot.localeCompare(b.cidadeRot, "pt-BR") || (a.agenda - b.agenda) || a.setorRot.localeCompare(b.setorRot, "pt-BR"));
    }

    function htmlLista({ todas, setores, cidades }) {
        if (!todas.length) return vazio();
        const lista = listaFiltrada(todas);
        return `
          <div class="ag-card">
            <div class="ag-card-tit">
              <select class="ag-sel" data-ag-sel-setor aria-label="Setor"><option value="">Todos os setores</option>${setores.map(([s, n]) => `<option value="${esc(s)}" ${filtro.setor === s ? "selected" : ""}>${esc(s)} (${n})</option>`).join("")}</select>
              <select class="ag-sel" data-ag-sel-cidade aria-label="Cidade"><option value="">Todas as cidades</option>${cidades.map(([c, n]) => `<option value="${esc(c)}" ${filtro.cidade === c ? "selected" : ""}>${esc(c)} (${n})</option>`).join("")}</select>
              ${filtro.setor || filtro.cidade ? `<button type="button" class="ag-limpar" data-ag-limpar>× limpar</button>` : ""}
              <span class="ag-suave">${lista.length} OS</span>
              <input type="search" class="ag-busca" placeholder="Buscar OS, cliente, bairro, assunto…" value="${esc(busca)}" data-ag-busca>
            </div>
            <div class="ag-lista-wrap">
              <table class="ag-lista">
                <thead><tr><th>Hora</th><th>OS</th><th>Cliente</th><th>Assunto</th><th>Setor</th><th>Cidade · bairro</th><th>Status</th></tr></thead>
                <tbody>${lista.map(o => `<tr>
                  <td class="ag-hora">${hora(o.agenda)}</td>
                  <td><a href="#" data-ag-os="${esc(o.id)}">${esc(o.id)}</a></td>
                  <td>${esc(o.cliente)}</td>
                  <td>${esc(o.assunto)}</td>
                  <td>${esc(o.setorRot)}</td>
                  <td>${esc(o.cidadeRot)}${o.bairro ? ` <span class="ag-suave">· ${esc(o.bairro)}</span>` : ""}</td>
                  <td><span class="ag-status ag-st-${norm(o.status).replace(/\s+/g, "-")}">${esc(o.status || "—")}</span></td>
                </tr>`).join("")}</tbody>
              </table>
            </div>
          </div>`;
    }

    /** relatório → lista: vai para a aba Agenda, sub-aba Agendadas, já filtrada */
    function abrirNaAgenda(s, c) {
        filtro = { setor: s, cidade: c }; busca = "";
        if (typeof mostrarSecao === "function") mostrarSecao("agenda-hoje");
        if (typeof ativarAbaAgenda === "function") ativarAbaAgenda("agendadas");
        else render();
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function ligar(alvo, ctx) {
        alvo.querySelectorAll("[data-ag-dia]").forEach(b => b.addEventListener("click", () => { diaOffset += Number(b.dataset.agDia); filtro = { setor: null, cidade: null }; render(); }));
        alvo.querySelectorAll("[data-ag-ir]").forEach(b => b.addEventListener("click", () => { diaOffset = Number(b.dataset.agIr); filtro = { setor: null, cidade: null }; render(); }));
        alvo.querySelectorAll("[data-ag-setor]").forEach(b => b.addEventListener("click", () => abrirNaAgenda(b.dataset.agSetor, null)));
        alvo.querySelectorAll("[data-ag-cidade]").forEach(b => b.addEventListener("click", () => abrirNaAgenda(null, b.dataset.agCidade)));
        alvo.querySelectorAll("[data-ag-cel-s]").forEach(b => b.addEventListener("click", () => abrirNaAgenda(b.dataset.agCelS, b.dataset.agCelC)));
        alvo.querySelector("[data-ag-sel-setor]")?.addEventListener("change", e => { filtro.setor = e.target.value || null; render(); });
        alvo.querySelector("[data-ag-sel-cidade]")?.addEventListener("change", e => { filtro.cidade = e.target.value || null; render(); });
        alvo.querySelector("[data-ag-limpar]")?.addEventListener("click", () => { filtro = { setor: null, cidade: null }; render(); });
        alvo.querySelector("[data-ag-recarregar]")?.addEventListener("click", () => carregar(true));
        const campo = alvo.querySelector("[data-ag-busca]");
        if (campo) campo.addEventListener("input", () => {
            busca = campo.value; const pos = campo.selectionStart; render();
            const novo = document.querySelector(`#${ID_LST} [data-ag-busca]`); if (novo) { novo.focus(); novo.setSelectionRange(pos, pos); }
        });
        alvo.querySelectorAll("[data-ag-os]").forEach(a => a.addEventListener("click", ev => { ev.preventDefault(); abrirHistorico(a.dataset.agOs); }));
        alvo.querySelector("[data-ag-csv]")?.addEventListener("click", () => { const l = listaFiltrada(ctx.todas); baixarCsv(l.length ? l : ctx.todas); });
    }

    /** histórico da OS na mesma janela da Agenda IXC (modalOsIxc) */
    function abrirHistorico(id) {
        const o = cache && cache.porOs.get(String(id));
        const corpo = document.getElementById("modalOsIxcCorpo"), titulo = document.getElementById("modalOsIxcTitulo");
        if (!o || !corpo || !titulo || typeof abrirModal !== "function") return;
        const msgs = o.msgs.filter(m => m.data).sort((a, b) => a.data - b.data);
        titulo.textContent = `OS ${id}`;
        corpo.innerHTML = `
          <div class="modal-resumo resumo-grid">
            <div><span>Cliente</span><strong>${esc(o.cliente || "—")}</strong></div>
            <div><span>Cidade / Bairro</span><strong>${esc(o.cidade || "—")} / ${esc(o.bairro || "—")}</strong></div>
            <div><span>Assunto</span><strong>${esc(o.assunto || "—")}</strong></div>
            <div><span>Setor</span><strong>${esc(o.setor || "—")}</strong></div>
            <div><span>Agendada para</span><strong>${o.agenda ? esc(o.agenda.toLocaleString("pt-BR").slice(0, 17)) : "—"}</strong></div>
          </div>
          <ol class="ixc-timeline">${msgs.map(m => `
            <li class="ixc-timeline-item">
              <div class="ixc-timeline-topo">
                <span class="ixc-timeline-data">${m.data.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                <span class="ag-status ag-st-${norm(m.status).replace(/\s+/g, "-")}">${esc(m.status || "—")}</span>
              </div>
              ${m.tarefa ? `<div class="ixc-timeline-evento">${esc(m.tarefa)}</div>` : ""}
              ${m.msg ? `<div class="ixc-timeline-msg">${esc(m.msg)}</div>` : ""}
            </li>`).join("")}</ol>`;
        abrirModal("modalOsIxc");
    }

    function baixarCsv(lista) {
        const cab = ["Agendamento", "OS", "Cliente", "Assunto", "Setor", "Cidade", "Bairro", "Status", "Equipe"];
        const cel = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
        const linhas = lista.map(o => [o.agenda ? o.agenda.toLocaleString("pt-BR").slice(0, 17) : "", o.id, o.cliente, o.assunto, o.setorRot, o.cidadeRot, o.bairro, o.status, o.equipe].map(cel).join(";"));
        const blob = new Blob(["﻿" + [cab.join(";"), ...linhas].join("\r\n")], { type: "text/csv;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `OS agendadas ${isoDia(diaAlvo())}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }

    async function carregar(forcar = false) {
        const alvos = [ID_REL, ID_LST].map(id => document.getElementById(id)).filter(Boolean);
        if (!alvos.length) return;
        estilo();
        // reusa os dados por até 2 min (o arquivo do IXC muda de 10 em 10 min)
        if (cache && !forcar && Date.now() - cache.lidoEm < 120000) return render();
        if (!cache) alvos.forEach(a => { a.innerHTML = `<div class="ag-card ag-vazio">Carregando as OS agendadas…</div>`; });
        try {
            if (forcar && typeof invalidarCacheOsPendentes === "function") invalidarCacheOsPendentes();
            const linhas = await buscarOsPendentesCacheado();
            cache = montar(linhas || []);
            cache.lidoEm = Date.now();
            render();
        } catch (e) {
            console.error("Agendadas:", e);
            alvos.forEach(a => { a.innerHTML = `<div class="ag-card ag-vazio">Não consegui carregar as OS. ${esc(e.message || "")}</div>`; });
        }
    }

    function estilo() {
        if (document.getElementById("estilo-agendadas")) return;
        const s = document.createElement("style");
        s.id = "estilo-agendadas";
        s.textContent = `
#agendaAgendadasConteudo{display:flex;flex-direction:column;gap:14px;margin-top:6px}
.ag-topo{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px}
.ag-dia{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.ag-dia-rot{margin-left:8px;font-size:1.05rem;color:var(--cor-texto)}
.ag-seta,.ag-chip,.ag-btn{border:1px solid var(--cor-borda);background:var(--cor-fundo-card);color:var(--cor-texto);border-radius:999px;padding:6px 14px;font:inherit;font-size:.88rem;cursor:pointer}
.ag-seta{padding:6px 11px;font-size:1rem;line-height:1}
.ag-chip.on{background:var(--cor-primaria);border-color:var(--cor-primaria);color:#fff}
.ag-btn:disabled{opacity:.5;cursor:default}
.ag-acoes{display:flex;align-items:center;gap:8px}
.ag-suave{color:var(--cor-texto-suave);font-size:.82rem;font-weight:400}
.ag-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.ag-kpi{display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:12px 16px;border:1px solid var(--cor-borda);border-radius:14px;background:var(--cor-fundo-card);color:var(--cor-texto);font:inherit;text-align:left;cursor:pointer}
.ag-kpi span{font-size:.78rem;color:var(--cor-texto-suave);text-transform:uppercase;letter-spacing:.03em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.ag-kpi b{font-size:1.6rem;line-height:1.1}
.ag-kpi-total{cursor:default;border-color:var(--cor-primaria)}
.ag-kpi-total b{color:var(--cor-primaria)}
.ag-kpi.on{outline:2px solid var(--cor-primaria)}
.ag-aviso{margin:0;padding:10px 14px;border-radius:10px;background:var(--escala-laranja-fundo,#FEF3C7);color:var(--cor-texto);font-size:.88rem}
.ag-card{border:1px solid var(--cor-borda);border-radius:16px;background:var(--cor-fundo-card);padding:14px 16px}
.ag-card-tit{display:flex;align-items:center;flex-wrap:wrap;gap:10px;font-weight:600;margin-bottom:10px;color:var(--cor-texto)}
.ag-vazio{color:var(--cor-texto-suave);text-align:center;padding:28px}
.ag-matriz-wrap,.ag-lista-wrap{overflow-x:auto}
.ag-matriz{border-collapse:separate;border-spacing:0;font-size:.88rem;width:100%}
.ag-matriz th,.ag-matriz td{padding:4px 6px;text-align:center;border-bottom:1px solid var(--cor-borda);white-space:nowrap}
.ag-matriz tbody th,.ag-matriz tfoot th,.ag-matriz thead th:first-child{text-align:left;position:sticky;left:0;z-index:1;background:var(--cor-fundo-card)}
.ag-matriz th button{border:0;background:none;color:var(--cor-texto);font:inherit;font-weight:600;cursor:pointer;padding:3px 6px;border-radius:8px}
.ag-matriz thead th button{color:var(--cor-texto-suave);font-weight:600;font-size:.8rem}
.ag-matriz th button.on{background:var(--cor-primaria);color:#fff}
.ag-cel{min-width:38px;border:0;border-radius:8px;padding:5px 8px;font:inherit;font-weight:700;cursor:pointer;color:var(--cor-texto);background:color-mix(in srgb,var(--cor-primaria) calc(var(--i)*100%),transparent)}
.ag-cel.on{outline:2px solid var(--cor-primaria);outline-offset:1px}
.ag-zero{color:var(--cor-borda)}
.ag-tot{font-weight:700;color:var(--cor-texto)}
.ag-matriz tfoot td,.ag-matriz tfoot th{border-bottom:0;padding-top:8px}
.ag-limpar{border:0;background:var(--cor-fundo-elevado);color:var(--cor-texto-suave);border-radius:999px;padding:2px 10px;font:inherit;font-size:.8rem;cursor:pointer}
.ag-sel{border:1px solid var(--cor-borda);border-radius:999px;padding:6px 12px;background:var(--cor-fundo-card);color:var(--cor-texto);font:inherit;font-size:.86rem;max-width:340px}
#agendaAgendadasConteudo .agenda-abas{margin:0}
.ag-busca{margin-left:auto;min-width:220px;border:1px solid var(--cor-borda);border-radius:999px;padding:6px 14px;background:var(--cor-fundo);color:var(--cor-texto);font:inherit;font-size:.86rem}
.ag-lista{width:100%;border-collapse:collapse;font-size:.86rem}
.ag-lista th{text-align:left;font-size:.76rem;text-transform:uppercase;letter-spacing:.03em;color:var(--cor-texto-suave);padding:6px 8px;border-bottom:1px solid var(--cor-borda)}
.ag-lista td{padding:7px 8px;border-bottom:1px solid var(--cor-borda);color:var(--cor-texto);vertical-align:top}
.ag-lista tr:last-child td{border-bottom:0}
.ag-lista a{color:var(--cor-primaria);font-weight:600;text-decoration:none}
.ag-hora{font-variant-numeric:tabular-nums;font-weight:600;white-space:nowrap}
.ag-status{display:inline-block;padding:2px 9px;border-radius:999px;font-size:.76rem;background:var(--cor-fundo-elevado);color:var(--cor-texto-suave);white-space:nowrap}
.ag-st-agendada{background:color-mix(in srgb,var(--cor-primaria) 14%,transparent);color:var(--cor-primaria)}
.ag-st-deslocamento,.ag-st-execucao{background:color-mix(in srgb,#D97706 16%,transparent);color:#B45309}
@media (max-width:640px){.ag-busca{margin-left:0;width:100%}.ag-dia-rot{width:100%;margin:4px 0 0}}`;
        document.head.appendChild(s);
    }

    window.carregarAgendaAgendadas = carregar;
})();
