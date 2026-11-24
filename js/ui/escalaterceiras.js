// Escala > Programação terceiras (24/11/2026): capacidade diária de cada terceira por área (cidade/grupo de
// cidades) e as rotas por bairro. O robô (C:\cop-robo\programacao) lê isto às 16h30 (seg–sex), monta a proposta
// do dia seguinte e manda no WhatsApp do Murillo; só grava no IXC depois do "OK".
// Fica em configuracoes_app, chave "programacao_terceiras". Leitura: quem tem login. Gravação: admin (RLS).
(function () {
    "use strict";

    const CHAVE = "programacao_terceiras";
    const PADRAO = { terceiras: [
        { nome: "Technomais", setor: "TECHNOMAIS", ativo: true, areas: [
            { nome: "Cachoeiras de Macacu", cidades: ["Cachoeiras de Macacu"], capacidade: 20, filialPadrao: "1 - CACHOEIRAS DE MACACU", rotas: [
                { nome: "Rota 1", bairros: ["Guapiaçu", "Serra Queimada", "Vecchi"] },
                { nome: "Rota 2", bairros: ["Boca do Mato", "Valério", "Campo do Prado", "Centro"] },
                { nome: "Rota 3", bairros: ["Japuíba", "Forno Velho", "Papucaia"] },
                { nome: "Rota 4", bairros: ["Agro Brasil", "Marubaí"] },
                { nome: "Rota 5", bairros: ["Goiabal", "Ganguri de Cima", "Ganguri", "Parque Veneza", "Taborda"] }] },
            { nome: "Rio Bonito", cidades: ["Rio Bonito"], capacidade: 4, filialPadrao: "6 - RIO BONITO", rotas: [] },
            { nome: "SP", cidades: ["Cruzeiro", "Guaratinguetá", "Queluz"], capacidade: 8, filialPadrao: "23 - CRUZEIRO",
              filiais: { "Guaratinguetá": "23 - GUARATINGUETÁ", "Queluz": "23 - QUELUZ" }, rotas: [] }] },
        { nome: "Conect Veloz", setor: "CONECT VELOZ", ativo: true, areas: [
            { nome: "Nova Friburgo", cidades: ["Nova Friburgo"], capacidade: 17, filialPadrao: "25 - NOVA FRIBURGO - CENTRO", rotas: [] },
            { nome: "Bom Jardim", cidades: ["Bom Jardim"], capacidade: 5, filialPadrao: "25 - BOM JARDIM", rotas: [] },
            { nome: "Rio das Ostras", cidades: ["Rio das Ostras"], capacidade: 10, filialPadrao: "2 - RIO DAS OSTRAS", rotas: [] }] }
    ] };

    const estado = { cfg: null, em: null, por: null, salvo: false, editando: false, aviso: null };
    const $ = id => document.getElementById(id);
    const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const podeEditar = () => typeof ehAdmin === "function" && ehAdmin();
    const copia = o => JSON.parse(JSON.stringify(o));

    const CSS = `
#secao-escala-terceiras .pt-intro{ color:var(--cor-texto-suave); font-size:13.5px; margin:0 0 14px; line-height:1.5; max-width:820px; }
#secao-escala-terceiras .pt-aviso{ margin-bottom:12px; padding:9px 12px; border-radius:10px; font-size:13px; background:#dcfce7; color:#15803d; }
#secao-escala-terceiras .pt-aviso.erro{ background:#fee2e2; color:#b91c1c; }
html[data-tema="dark"] #secao-escala-terceiras .pt-aviso{ background:#14391f; color:#86efac; }
html[data-tema="dark"] #secao-escala-terceiras .pt-aviso.erro{ background:#4a2020; color:#fca5a5; }
.pt-card{ background:var(--cor-fundo-card); border:1px solid var(--cor-borda); border-radius:14px; padding:16px; margin-bottom:14px; }
.pt-card-topo{ display:flex; flex-wrap:wrap; align-items:center; gap:10px 16px; margin-bottom:10px; }
.pt-card-topo h3{ margin:0; font-size:17px; }
.pt-sub{ color:var(--cor-texto-suave); font-size:12.5px; }
.pt-total{ margin-left:auto; font-weight:700; font-variant-numeric:tabular-nums; }
.pt-areas{ display:grid; gap:10px; }
.pt-area{ border:1px solid var(--cor-borda); border-radius:12px; padding:12px; background:var(--cor-fundo); }
.pt-area-linha{ display:flex; flex-wrap:wrap; align-items:baseline; gap:6px 14px; }
.pt-area-nome{ font-weight:600; }
.pt-cap{ font-size:22px; font-weight:700; font-variant-numeric:tabular-nums; }
.pt-cap small{ font-size:12px; font-weight:400; color:var(--cor-texto-suave); margin-left:3px; }
.pt-rotas{ margin:8px 0 0; padding:0; list-style:none; display:grid; gap:3px; font-size:13px; }
.pt-rotas b{ font-weight:600; }
.pt-vazio{ color:var(--cor-texto-suave); font-size:12.5px; margin-top:6px; }
.pt-btn{ display:inline-flex; align-items:center; gap:6px; padding:7px 12px; border-radius:10px; cursor:pointer;
    border:1px solid var(--cor-borda); background:var(--cor-fundo-card); color:var(--cor-texto); font:inherit; font-size:13px; white-space:nowrap; }
.pt-btn:hover{ border-color:var(--cor-primaria); }
.pt-btn.prim{ background:var(--cor-primaria); border-color:var(--cor-primaria); color:#fff; }
.pt-btn.perigo{ color:#b91c1c; }
.pt-acoes{ display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap; margin-top:4px; }
/* edição */
.pt-form label{ display:grid; gap:4px; font-size:12px; color:var(--cor-texto-suave); }
.pt-form input, .pt-form textarea{ font:inherit; font-size:13.5px; color:var(--cor-texto); background:var(--cor-fundo);
    border:1px solid var(--cor-borda); border-radius:10px; padding:7px 10px; width:100%; box-sizing:border-box; }
.pt-form textarea{ min-height:84px; resize:vertical; line-height:1.45; }
.pt-grid{ display:grid; grid-template-columns:1.2fr 1.6fr 110px 1.3fr; gap:10px; }
.pt-grid-t{ display:grid; grid-template-columns:1fr 1fr auto; gap:10px; align-items:end; margin-bottom:10px; }
.pt-check{ display:flex !important; grid-auto-flow:column; align-items:center; gap:6px !important; color:var(--cor-texto) !important; font-size:13px !important; }
.pt-check input{ width:auto; }
.pt-area .pt-acoes{ margin-top:8px; }
@media (max-width:760px){ .pt-grid, .pt-grid-t{ grid-template-columns:1fr; } }`;

    async function carregar() {
        const { data, error } = await supabaseClient.from("configuracoes_app")
            .select("valor, atualizado_em, atualizado_por").eq("chave", CHAVE).maybeSingle();
        if (error) throw error;
        estado.cfg = data?.valor?.terceiras ? copia(data.valor) : copia(PADRAO);
        estado.salvo = !!data;
        estado.em = data?.atualizado_em ?? null;
        estado.por = data?.atualizado_por ?? null;
    }

    async function gravar(cfg) {
        const { data: u } = await supabaseClient.auth.getUser();
        const quem = u?.user?.email ?? null, agora = new Date().toISOString();
        const { error } = await supabaseClient.from("configuracoes_app").upsert({ chave: CHAVE, valor: cfg, atualizado_em: agora, atualizado_por: quem });
        if (error) throw error;
        estado.cfg = copia(cfg); estado.salvo = true; estado.em = agora; estado.por = quem;
    }

    const rotasParaTexto = rotas => (rotas || []).map(r => `${r.nome}: ${(r.bairros || []).join(", ")}`).join("\n");
    function textoParaRotas(txt) {
        return String(txt || "").split(/\n+/).map(l => l.trim()).filter(Boolean).map((l, i) => {
            const m = l.match(/^([^:]+):(.*)$/);
            const nome = m ? m[1].trim() : `Rota ${i + 1}`;
            const bairros = (m ? m[2] : l).split(/[,;\/]+/).map(b => b.trim()).filter(Boolean);
            return { nome, bairros };
        }).filter(r => r.bairros.length);
    }

    function htmlVer() {
        const cfg = estado.cfg;
        const quando = estado.em ? new Date(estado.em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
        return `
          ${estado.aviso ? `<div class="pt-aviso${estado.aviso.erro ? " erro" : ""}">${esc(estado.aviso.texto)}</div>` : ""}
          <p class="pt-intro">De segunda a sexta, às <b>16h30</b>, o robô monta a programação do dia seguinte de cada terceira com estas capacidades:
          conta o que já está marcado com ela e completa com instalações (lendo o que o cliente pediu nas mensagens da OS).
          A proposta chega no WhatsApp do Murillo e <b>só é gravada no IXC depois do “OK”</b>. Para tirar alguma OS: “TIRAR 123 456”.
          ${estado.salvo ? `<br><span class="pt-sub">Última alteração: ${esc(quando)}${estado.por ? " · " + esc(estado.por) : ""}</span>` : `<br><span class="pt-sub">Ainda não salvo no banco — o robô está usando estes valores padrão.</span>`}</p>
          ${cfg.terceiras.map(t => {
              const total = (t.areas || []).reduce((s, a) => s + (Number(a.capacidade) || 0), 0);
              return `<div class="pt-card">
                <div class="pt-card-topo"><h3>${esc(t.nome)}</h3><span class="pt-sub">setor no IXC: ${esc(t.setor)}${t.ativo === false ? " · <b>pausada</b>" : ""}</span>
                  <span class="pt-total">${total} OS/dia</span></div>
                <div class="pt-areas">${(t.areas || []).map(a => `
                  <div class="pt-area">
                    <div class="pt-area-linha"><span class="pt-area-nome">${esc(a.nome)}</span>
                      <span class="pt-sub">${esc((a.cidades || []).join(", "))} · filial ${esc(a.filialPadrao || "—")}</span>
                      <span class="pt-cap" style="margin-left:auto">${Number(a.capacidade) || 0}<small>OS/dia</small></span></div>
                    ${(a.rotas || []).length ? `<ul class="pt-rotas">${a.rotas.map(r => `<li><b>${esc(r.nome)}:</b> ${esc((r.bairros || []).join(" · "))}</li>`).join("")}</ul>` : `<div class="pt-vazio">Sem rotas definidas — a mensagem sai por horário.</div>`}
                  </div>`).join("")}</div>
              </div>`;
          }).join("")}
          ${podeEditar() ? `<div class="pt-acoes"><button type="button" class="pt-btn prim" data-pt="editar">✎ Editar capacidades e rotas</button></div>` : `<p class="pt-sub">Só administradores alteram.</p>`}`;
    }

    function htmlEditar() {
        const cfg = estado.cfg;
        return `<form class="pt-form" id="ptForm">
          ${cfg.terceiras.map((t, ti) => `
            <div class="pt-card" data-t="${ti}">
              <div class="pt-grid-t">
                <label>Terceira<input name="nome" value="${esc(t.nome)}" required></label>
                <label>Setor no IXC (exatamente como está lá)<input name="setor" value="${esc(t.setor)}" required></label>
                <label class="pt-check"><input type="checkbox" name="ativo" ${t.ativo === false ? "" : "checked"}> Ativa</label>
              </div>
              <div class="pt-areas">${(t.areas || []).map((a, ai) => `
                <div class="pt-area" data-a="${ai}">
                  <div class="pt-grid">
                    <label>Área<input name="anome" value="${esc(a.nome)}" required></label>
                    <label>Cidades (separadas por vírgula)<input name="cidades" value="${esc((a.cidades || []).join(", "))}" required></label>
                    <label>OS/dia<input name="capacidade" type="number" min="0" max="200" value="${Number(a.capacidade) || 0}"></label>
                    <label>Filial padrão no IXC<input name="filial" value="${esc(a.filialPadrao || "")}" placeholder="ex.: 6 - RIO BONITO"></label>
                  </div>
                  <label style="margin-top:8px">Rotas — uma por linha, “Nome: bairro, bairro, bairro” (bairros da mesma rota vão juntos)
                    <textarea name="rotas" placeholder="Rota 1: Guapiaçu, Serra Queimada, Vecchi">${esc(rotasParaTexto(a.rotas))}</textarea></label>
                  <div class="pt-acoes"><button type="button" class="pt-btn perigo" data-pt="tirar-area" data-t="${ti}" data-a="${ai}">Remover área</button></div>
                </div>`).join("")}</div>
              <div class="pt-acoes"><button type="button" class="pt-btn" data-pt="nova-area" data-t="${ti}">+ Área</button>
                <button type="button" class="pt-btn perigo" data-pt="tirar-terceira" data-t="${ti}">Remover terceira</button></div>
            </div>`).join("")}
          <div class="pt-acoes">
            <button type="button" class="pt-btn" data-pt="nova-terceira">+ Terceira</button>
            <button type="button" class="pt-btn" data-pt="cancelar">Cancelar</button>
            <button type="submit" class="pt-btn prim">Salvar</button>
          </div></form>`;
    }

    /** lê o formulário de volta para o objeto (mantém campos que a tela não mostra, como "filiais") */
    function lerForm() {
        const cfg = copia(estado.cfg);
        document.querySelectorAll("#ptForm [data-t]").forEach(card => {
            if (!card.classList.contains("pt-card")) return;
            const t = cfg.terceiras[+card.dataset.t];
            t.nome = card.querySelector("[name=nome]").value.trim();
            t.setor = card.querySelector("[name=setor]").value.trim().toUpperCase();
            t.ativo = card.querySelector("[name=ativo]").checked;
            card.querySelectorAll(".pt-area[data-a]").forEach(el => {
                const a = t.areas[+el.dataset.a];
                a.nome = el.querySelector("[name=anome]").value.trim();
                a.cidades = el.querySelector("[name=cidades]").value.split(",").map(s => s.trim()).filter(Boolean);
                a.capacidade = Math.max(0, Number(el.querySelector("[name=capacidade]").value) || 0);
                a.filialPadrao = el.querySelector("[name=filial]").value.trim().toUpperCase();
                a.rotas = textoParaRotas(el.querySelector("[name=rotas]").value);
            });
        });
        return cfg;
    }

    function desenhar() {
        const alvo = $("escalaTerceirasConteudo");
        if (!alvo) return;
        alvo.innerHTML = estado.editando ? htmlEditar() : htmlVer();
        alvo.querySelectorAll("[data-pt]").forEach(b => b.addEventListener("click", () => acao(b.dataset.pt, b.dataset)));
        $("ptForm")?.addEventListener("submit", async e => {
            e.preventDefault();
            const cfg = lerForm();
            try { await gravar(cfg); estado.editando = false; estado.aviso = { texto: "Salvo. A próxima proposta (16h30) já usa estes valores." }; }
            catch (err) { estado.aviso = { texto: "Não salvou: " + (err.message || err), erro: true }; estado.editando = false; }
            desenhar();
        });
    }

    function acao(qual, d) {
        if (qual === "editar") { estado.editando = true; estado.aviso = null; return desenhar(); }
        if (qual === "cancelar") { estado.editando = false; return renderizarEscalaTerceiras(true); }
        const cfg = lerForm();
        if (qual === "nova-area") cfg.terceiras[+d.t].areas.push({ nome: "", cidades: [], capacidade: 0, filialPadrao: "", rotas: [] });
        if (qual === "tirar-area" && confirm("Remover esta área?")) cfg.terceiras[+d.t].areas.splice(+d.a, 1);
        if (qual === "nova-terceira") cfg.terceiras.push({ nome: "", setor: "", ativo: true, areas: [{ nome: "", cidades: [], capacidade: 0, filialPadrao: "", rotas: [] }] });
        if (qual === "tirar-terceira" && confirm("Remover esta terceira da programação?")) cfg.terceiras.splice(+d.t, 1);
        estado.cfg = cfg;
        desenhar();
    }

    async function renderizarEscalaTerceiras(forcar) {
        if (!document.getElementById("estilo-pt")) { const s = document.createElement("style"); s.id = "estilo-pt"; s.textContent = CSS; document.head.appendChild(s); }
        const alvo = $("escalaTerceirasConteudo");
        if (!alvo) return;
        if (estado.editando && !forcar) return desenhar();
        try { if (forcar || !estado.cfg) { alvo.innerHTML = `<p class="pt-sub">Carregando…</p>`; await carregar(); } }
        catch (e) { estado.cfg = copia(PADRAO); estado.aviso = { texto: "Não consegui ler do banco (" + (e.message || e) + ") — mostrando o padrão.", erro: true }; }
        estado.editando = false;
        desenhar();
    }
    window.renderizarEscalaTerceiras = renderizarEscalaTerceiras;
})();
