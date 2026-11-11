// Escala > Contatos: nome e telefone dos técnicos (ligar / WhatsApp).
// Os telefones NÃO ficam no repositório (é público): vêm de configuracoes_app,
// chave "contatos_tecnicos" ({ lista: [{nome, telefone, equipe, cidade, obs}] }),
// que só quem tem login lê e só admin grava (RLS da tabela).
(function () {
    "use strict";

    const CHAVE = "contatos_tecnicos";
    const NOVO = "Novo técnico";

    const estado = { lista: null, atualizadoEm: null, atualizadoPor: null, editando: null, carregando: null, seq: 0 };

    const $ = id => document.getElementById(id);
    const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const dig = s => String(s ?? "").replace(/\D/g, "");
    const cmp = (a, b) => String(a).localeCompare(String(b), "pt-BR");
    const podeEditar = () => typeof ehAdmin === "function" && ehAdmin();
    const comId = t => ({ id: "c" + (++estado.seq), nome: t.nome || "", telefone: t.telefone || "", equipe: t.equipe || "", cidade: t.cidade || "", obs: t.obs || "" });

    function formatarTel(s) {
        let d = dig(s);
        if (d.length === 13 && d.startsWith("55")) d = d.slice(2);
        if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
        if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
        return String(s ?? "").trim();
    }
    const intl = s => { const d = dig(s); return d.length === 10 || d.length === 11 ? "55" + d : d; };

    const CSS = `
#secao-escala-contatos .ct-filtros{ display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px; }
#secao-escala-contatos .ct-filtros input, #secao-escala-contatos .ct-filtros select,
#secao-escala-contatos .ct-edit input{
    font:inherit; color:var(--cor-texto); background:var(--cor-fundo-card);
    border:1px solid var(--cor-borda); border-radius:10px; padding:8px 10px;
}
#ctBusca{ flex:1; min-width:200px; max-width:360px; }
.ct-btn{ display:inline-flex; align-items:center; gap:6px; padding:7px 12px; border-radius:10px; cursor:pointer;
    border:1px solid var(--cor-borda); background:var(--cor-fundo-card); color:var(--cor-texto); font:inherit; font-size:13px;
    text-decoration:none; white-space:nowrap; }
.ct-btn:hover{ border-color:var(--cor-primaria); }
.ct-btn[hidden]{ display:none; }
.ct-btn.prim{ background:var(--cor-primaria); border-color:var(--cor-primaria); color:#fff; }
.ct-btn.wa{ color:#15803d; }
html[data-tema="dark"] .ct-btn.wa{ color:#86efac; }
.ct-btn.x{ color:var(--cor-erro); }
.ct-aviso{ margin-bottom:10px; padding:9px 12px; border-radius:10px; font-size:13px; background:#dcfce7; color:#15803d; }
.ct-aviso.erro{ background:#fee2e2; color:#b91c1c; }
html[data-tema="dark"] .ct-aviso{ background:#14391f; color:#86efac; }
html[data-tema="dark"] .ct-aviso.erro{ background:#4a2020; color:#fca5a5; }
.ct-cidade{ margin-top:16px; }
.ct-cidade h3{ font-size:12px; margin:0 0 6px; color:var(--cor-texto-suave); text-transform:uppercase; letter-spacing:.05em; }
.ct-lista{ background:var(--cor-fundo-card); border:1px solid var(--cor-borda); border-radius:14px; overflow:hidden; }
.ct-linha{ display:grid; grid-template-columns:minmax(200px,1.5fr) minmax(150px,1fr) minmax(140px,1fr) auto; gap:10px;
    align-items:center; padding:10px 14px; border-top:1px solid var(--cor-borda); }
.ct-linha:first-child{ border-top:0; }
.ct-nome{ font-weight:600; }
.ct-meta{ color:var(--cor-texto-suave); font-size:12px; }
.ct-tag{ display:inline-block; padding:1px 8px; border-radius:999px; font-size:11px; margin-left:6px; vertical-align:1px;
    font-weight:500; background:var(--cor-fundo-elevado); border:1px solid var(--cor-borda); }
.ct-tel{ font-variant-numeric:tabular-nums; font-size:15px; }
.ct-tel.vazio{ color:var(--cor-texto-suave); font-style:italic; font-size:13px; }
.ct-acoes{ display:flex; gap:6px; justify-content:flex-end; flex-wrap:wrap; }
.ct-edit{ display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:8px; grid-column:1/-1; }
.ct-edit label{ display:grid; gap:3px; font-size:12px; color:var(--cor-texto-suave); }
.ct-vazio{ color:var(--cor-texto-suave); padding:14px 0; }
@media (max-width:720px){
    .ct-linha{ grid-template-columns:1fr; gap:6px; }
    .ct-acoes{ justify-content:flex-start; }
    #ctBusca{ max-width:none; }
}`;

    function montarUmaVez() {
        if ($("ctBusca")) return;
        const estilo = document.createElement("style");
        estilo.textContent = CSS;
        document.head.appendChild(estilo);

        $("escalaContatosConteudo").innerHTML = `
            <div class="ct-filtros">
                <input type="search" id="ctBusca" placeholder="Buscar nome, telefone ou equipe…">
                <select id="ctCidade"></select>
                <select id="ctEquipe"></select>
                <select id="ctTel">
                    <option value="">Com e sem telefone</option>
                    <option value="sem">Só sem telefone</option>
                    <option value="com">Só com telefone</option>
                </select>
            </div>
            <div class="ct-aviso" id="ctAviso" hidden></div>
            <div id="ctLista"></div>
            <input type="file" id="ctArquivo" accept=".html,.htm,.csv" hidden>`;

        ["ctBusca", "ctCidade", "ctEquipe", "ctTel"].forEach(id => $(id).addEventListener("input", desenhar));
        $("ctLista").addEventListener("click", aoClicar);
        $("btnContatoNovo").addEventListener("click", novoTecnico);
        $("btnContatoImportar").addEventListener("click", () => { $("ctArquivo").value = ""; $("ctArquivo").click(); });
        $("ctArquivo").addEventListener("change", importar);
        $("btnContatoCopiar").addEventListener("click", copiar);
        $("btnContatoCsv").addEventListener("click", exportarCsv);
    }

    function aviso(msg, erro) {
        const el = $("ctAviso"); if (!el) return;
        el.textContent = msg || ""; el.hidden = !msg; el.classList.toggle("erro", !!erro);
        clearTimeout(aviso.t); if (msg && !erro) aviso.t = setTimeout(() => { el.hidden = true; }, 6000);
    }

    // ---------- banco ----------
    async function carregar() {
        const { data, error } = await supabaseClient.from("configuracoes_app")
            .select("valor, atualizado_em, atualizado_por").eq("chave", CHAVE).maybeSingle();
        if (error) throw error;
        estado.lista = (Array.isArray(data?.valor?.lista) ? data.valor.lista : []).map(comId);
        estado.atualizadoEm = data?.atualizado_em ?? null;
        estado.atualizadoPor = data?.atualizado_por ?? null;
    }

    async function gravar(novaLista, msgOk) {
        const limpa = novaLista.filter(t => !t.novo);
        const valor = { lista: limpa.map(({ nome, telefone, equipe, cidade, obs }) => ({ nome, telefone, equipe, cidade, obs })) };
        const { data: u } = await supabaseClient.auth.getUser();
        const quem = u?.user?.email ?? null;
        const agora = new Date().toISOString();
        const { error } = await supabaseClient.from("configuracoes_app")
            .upsert({ chave: CHAVE, valor, atualizado_em: agora, atualizado_por: quem });
        if (error) { aviso("Não foi possível salvar: " + error.message, true); return false; }
        estado.lista = limpa; estado.atualizadoEm = agora; estado.atualizadoPor = quem; estado.editando = null;
        desenhar();
        if (msgOk) aviso(msgOk);
        return true;
    }

    // ---------- tela ----------
    function opcoes(sel, rotulo, valores) {
        const atual = sel.value;
        sel.innerHTML = `<option value="">${rotulo}</option>` + valores.map(v => `<option${v === atual ? " selected" : ""}>${esc(v)}</option>`).join("");
    }
    const unicos = campo => [...new Set(estado.lista.map(t => t[campo]).filter(Boolean))].sort(cmp);

    function filtrados() {
        const q = $("ctBusca").value.trim().toLowerCase(), qd = dig(q);
        const c = $("ctCidade").value, e = $("ctEquipe").value, f = $("ctTel").value;
        return estado.lista.filter(t => {
            if (t.novo) return true;
            if (c && t.cidade !== c) return false;
            if (e && t.equipe !== e) return false;
            if (f === "sem" && t.telefone) return false;
            if (f === "com" && !t.telefone) return false;
            if (q) {
                const texto = `${t.nome} ${t.equipe} ${t.obs}`.toLowerCase();
                if (!texto.includes(q) && !(qd && dig(t.telefone).includes(qd))) return false;
            }
            return true;
        });
    }

    function linhaHtml(t) {
        if (estado.editando === t.id) {
            return `<div class="ct-linha"><div class="ct-edit">
                <label>Nome<input id="ctENome" value="${esc(t.nome)}"></label>
                <label>Telefone<input id="ctETel" type="tel" value="${esc(t.telefone)}" placeholder="(22) 99999-9999"></label>
                <label>Equipe<input id="ctEEquipe" list="ctLEquipes" value="${esc(t.equipe)}"></label>
                <label>Cidade<input id="ctECidade" list="ctLCidades" value="${esc(t.cidade)}"></label>
                <label>Observação<input id="ctEObs" value="${esc(t.obs)}" placeholder="ex.: NOF 01, só WhatsApp"></label>
            </div><div class="ct-acoes" style="grid-column:1/-1">
                ${t.novo ? "" : `<button class="ct-btn x" data-a="remover" data-id="${esc(t.id)}">Remover técnico</button>`}
                <button class="ct-btn" data-a="cancelar">Cancelar</button>
                <button class="ct-btn prim" data-a="salvar" data-id="${esc(t.id)}">Salvar</button>
            </div></div>`;
        }
        const acoes = [];
        if (t.telefone) {
            acoes.push(`<a class="ct-btn" href="tel:+${esc(intl(t.telefone))}">📞 Ligar</a>`);
            acoes.push(`<a class="ct-btn wa" href="https://wa.me/${esc(intl(t.telefone))}" target="_blank" rel="noopener">WhatsApp</a>`);
        }
        if (podeEditar()) acoes.push(`<button class="ct-btn" data-a="editar" data-id="${esc(t.id)}" title="Editar">✏️</button>`);
        return `<div class="ct-linha">
            <div><span class="ct-nome">${esc(t.nome)}</span>${t.equipe ? `<span class="ct-tag">${esc(t.equipe)}</span>` : ""}</div>
            ${t.telefone ? `<div class="ct-tel">${esc(formatarTel(t.telefone))}</div>` : `<div class="ct-tel vazio">sem telefone</div>`}
            <div class="ct-meta">${esc(t.obs)}</div>
            <div class="ct-acoes">${acoes.join("")}</div>
        </div>`;
    }

    function desenhar() {
        if (!estado.lista || !$("ctLista")) return;
        const admin = podeEditar();
        $("btnContatoNovo").hidden = !admin;
        $("btnContatoImportar").hidden = !admin;
        opcoes($("ctCidade"), "Todas as cidades", unicos("cidade"));
        opcoes($("ctEquipe"), "Todas as equipes", unicos("equipe"));

        const reais = estado.lista.filter(t => !t.novo);
        const comTel = reais.filter(t => t.telefone).length;
        $("escalaContatosResumo").textContent = `${reais.length} técnicos · ${comTel} com telefone` +
            (estado.atualizadoEm ? ` · atualizado em ${new Date(estado.atualizadoEm).toLocaleString("pt-BR")}${estado.atualizadoPor ? " por " + estado.atualizadoPor : ""}` : "") +
            (admin ? "" : " · só administrador edita");

        if (!reais.length && !estado.editando) {
            $("ctLista").innerHTML = `<p class="ct-vazio">Nenhum contato cadastrado ainda.${admin ? ' Use <b>Importar</b> para carregar o arquivo "Contatos dos técnicos.html" ou uma planilha .csv, ou <b>Novo técnico</b>.' : ""}</p>`;
            return;
        }

        const grupos = {};
        filtrados().forEach(t => { const k = t.novo ? NOVO : (t.cidade || "Sem cidade"); (grupos[k] ||= []).push(t); });
        const nomes = Object.keys(grupos).sort((a, b) => a === NOVO ? -1 : b === NOVO ? 1 : cmp(a, b));
        $("ctLista").innerHTML =
            `<datalist id="ctLEquipes">${unicos("equipe").map(v => `<option value="${esc(v)}">`).join("")}</datalist>` +
            `<datalist id="ctLCidades">${unicos("cidade").map(v => `<option value="${esc(v)}">`).join("")}</datalist>` +
            (nomes.length ? nomes.map(c => `<section class="ct-cidade"><h3>${esc(c)} · ${grupos[c].length}</h3>
                <div class="ct-lista">${grupos[c].sort((a, b) => cmp(a.nome, b.nome)).map(linhaHtml).join("")}</div></section>`).join("")
                : `<p class="ct-vazio">Nenhum técnico encontrado.</p>`);

        if (estado.editando) {
            document.querySelectorAll(".ct-edit input").forEach(inp => inp.addEventListener("keydown", e => {
                if (e.key === "Enter") salvar(estado.editando);
                if (e.key === "Escape") cancelar();
            }));
        }
    }

    function cancelar() { estado.lista = estado.lista.filter(t => !t.novo); estado.editando = null; desenhar(); }

    function salvar(id) {
        const nome = $("ctENome").value.trim();
        if (!nome) { alert("Informe o nome do técnico."); return; }
        const novaLista = estado.lista.map(t => t.id !== id ? t : {
            id, nome, telefone: formatarTel($("ctETel").value), equipe: $("ctEEquipe").value.trim(),
            cidade: $("ctECidade").value.trim(), obs: $("ctEObs").value.trim()
        });
        gravar(novaLista, "Salvo. Todo mundo do COP já vê a alteração.");
    }

    function aoClicar(e) {
        const b = e.target.closest("[data-a]"); if (!b) return;
        const a = b.dataset.a, id = b.dataset.id;
        if (a === "editar") {
            estado.lista = estado.lista.filter(t => !t.novo);
            estado.editando = id; desenhar(); $("ctETel")?.focus();
        }
        if (a === "cancelar") cancelar();
        if (a === "salvar") salvar(id);
        if (a === "remover") {
            const r = estado.lista.find(t => t.id === id);
            if (r && confirm(`Remover "${r.nome}" da lista?`)) gravar(estado.lista.filter(t => t !== r), "Técnico removido.");
        }
    }

    function novoTecnico() {
        if (!estado.lista) return;
        estado.lista = estado.lista.filter(t => !t.novo);
        const t = comId({ equipe: "Interno", cidade: $("ctCidade").value || "" }); t.novo = true;
        estado.lista.push(t); estado.editando = t.id;
        desenhar(); $("ctENome").focus();
    }

    // ---------- importar: o "Contatos dos técnicos.html" (arquivo solto) ou um CSV ----------
    function lerCsv(txt) {
        const linhas = txt.replace(/^﻿/, "").split(/\r?\n/).filter(l => l.trim());
        const sep = (linhas[0] || "").includes(";") ? ";" : ",";
        const celulas = l => {
            const out = []; let cur = "", aspas = false;
            for (let i = 0; i < l.length; i++) {
                const ch = l[i];
                if (aspas) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') aspas = false; else cur += ch; }
                else if (ch === '"') aspas = true; else if (ch === sep) { out.push(cur); cur = ""; } else cur += ch;
            }
            out.push(cur); return out.map(s => s.trim());
        };
        const cab = celulas(linhas[0]).map(h => h.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""));
        const col = nomes => cab.findIndex(h => nomes.some(n => h.startsWith(n)));
        const iN = col(["nome", "tecnico"]), iT = col(["telefone", "celular", "fone"]), iE = col(["equipe"]), iC = col(["cidade"]), iO = col(["obs"]);
        if (iN < 0) throw new Error("a planilha precisa de uma coluna 'Nome'");
        return linhas.slice(1).map(celulas).map(c => ({
            nome: c[iN] || "", telefone: iT >= 0 ? formatarTel(c[iT]) : "", equipe: iE >= 0 ? c[iE] : "",
            cidade: iC >= 0 ? c[iC] : "", obs: iO >= 0 ? c[iO] : ""
        })).filter(t => t.nome);
    }
    function lerHtml(txt) {
        const m = txt.match(/<script id="dados" type="application\/json">([\s\S]*?)<\/script>/);
        if (!m) throw new Error("esse HTML não é o arquivo de contatos");
        return (JSON.parse(m[1]).lista || []).filter(t => t && t.nome);
    }

    async function importar() {
        const f = this.files[0]; if (!f) return;
        const txt = await f.text();
        let novos;
        try { novos = /\.csv$/i.test(f.name) ? lerCsv(txt) : lerHtml(txt); }
        catch (err) { aviso("Não deu para ler o arquivo: " + err.message, true); return; }
        if (!novos.length) { aviso("O arquivo não tem nenhum técnico.", true); return; }
        const atual = estado.lista.filter(t => !t.novo).length;
        if (!confirm(`Importar ${novos.length} técnicos de "${f.name}"?` + (atual ? `\n\nA lista atual (${atual} técnicos) será SUBSTITUÍDA por essa.` : ""))) return;
        gravar(novos.map(comId), `${novos.length} técnicos importados.`);
    }

    // ---------- copiar / exportar ----------
    function copiar() {
        if (!estado.lista) return;
        const itens = filtrados().filter(t => !t.novo).sort((a, b) => cmp(a.nome, b.nome));
        const txt = itens.map(t => `${t.nome} — ${t.telefone ? formatarTel(t.telefone) : "sem telefone"}`).join("\n");
        navigator.clipboard.writeText(txt).then(
            () => aviso(`Lista copiada (${itens.length} técnicos).`),
            () => aviso("Não deu para copiar automaticamente neste navegador.", true));
    }

    function exportarCsv() {
        if (!estado.lista) return;
        const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
        const linhas = [["Nome", "Telefone", "Equipe", "Cidade", "Observação"].map(q).join(";")]
            .concat(estado.lista.filter(t => !t.novo).sort((a, b) => cmp(a.nome, b.nome))
                .map(t => [t.nome, formatarTel(t.telefone), t.equipe, t.cidade, t.obs].map(q).join(";")));
        const url = URL.createObjectURL(new Blob(["﻿" + linhas.join("\r\n")], { type: "text/csv;charset=utf-8" }));
        const a = document.createElement("a"); a.href = url; a.download = "Contatos dos técnicos.csv";
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // ---------- entrada (chamada por mostrarSecao em navegacao.js) ----------
    async function renderizarEscalaContatos(forcar = false) {
        montarUmaVez();
        if (estado.lista && !forcar) { desenhar(); return; }
        if (!estado.carregando) {
            $("escalaContatosResumo").textContent = "Carregando…";
            estado.carregando = carregar()
                .then(() => { aviso(""); desenhar(); })
                .catch(err => { aviso("Falha ao carregar os contatos: " + (err.message || err), true); $("escalaContatosResumo").textContent = ""; })
                .finally(() => { estado.carregando = null; });
        }
        return estado.carregando;
    }

    window.renderizarEscalaContatos = renderizarEscalaContatos;
    document.addEventListener("DOMContentLoaded", () => {
        $("btnAtualizarContatos")?.addEventListener("click", () => { estado.editando = null; renderizarEscalaContatos(true); });
    });
})();
