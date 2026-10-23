/**
 * ==========================================================
 * Busca de abas (command palette) — só no index.html
 * ==========================================================
 * Botão de lupa no cabeçalho (ou Ctrl+K / "/") abre um campo de busca que
 * lista todas as abas/telas navegáveis; digitar filtra, Enter/clique pula
 * pra ela via mostrarSecao(). Respeita permissões (podeVerSecao, terceiras
 * só admin/editor, Usuários só admin). Componente autocontido (injeta o
 * próprio botão, overlay e CSS), pra não depender de editar o cabeçalho.
 */

(function () {

    function pronto() {
        if (typeof window.mostrarSecao !== "function" || typeof MODULO_DA_SECAO === "undefined") return;
        if (document.getElementById("btnBuscaNav")) return;
        const host = document.querySelector(".header-utilitarios");
        if (!host) return;

        const MODULO_TITULO = {
            inicio: "Início", ordens: "Gestão de Relatórios", agendador: "Gestão de Ordens",
            cop: "Gestão do COP", clientes: "Gestão de Clientes", terceiras: "Gestão de Terceiras",
            escala: "Escala", auditoria: "Auditoria", admin: "Administrador"
        };
        const ROTULO_SECAO = {
            inicio: "Início",
            dashboard: "Dashboard", tempos: "TMA · TMS · TME · TMR", indicadores: "Indicadores",
            "cop-abertas": "COP em aberto", "gestao-cop": "Produção · TMR",
            ordens: "Ordens", tecnicos: "Técnicos", "mapa-calor": "Mapa de calor",
            "clientes-cto": "Cadastro na CTO", alertas: "Alertas de recorrência", "ctos-lacres": "CTOs e Lacres", enderecos: "Endereços a corrigir",
            terceiras: "Terceiras — Painel", "terceiras-fechamento": "Terceiras — Fechamento mensal", "terceiras-lpu": "Terceiras — LPU", "terceiras-qualidade": "Terceiras — Qualidade",
            auditoria: "Auditoria operacional", "auditoria-ia": "Auditor IA",
            "agenda-hoje": "Agenda do dia", "escala-hoje": "Escala técnica",
            usuarios: "Usuários", configuracoes: "Configurações"
        };

        const norm = t => (typeof normalizarTexto === "function" ? normalizarTexto(t) : String(t ?? "").toUpperCase());

        function secaoDisponivel(secao) {
            if (typeof podeVerSecao === "function" && !podeVerSecao(secao)) return false;
            const mod = MODULO_DA_SECAO[secao];
            if (mod === "terceiras" && typeof podeEditarOperacao === "function" && !podeEditarOperacao()) return false;
            if (secao === "usuarios" && typeof ehAdmin === "function" && !ehAdmin()) return false;
            return true;
        }

        function destinos() {
            return Object.keys(MODULO_DA_SECAO)
                .filter(secaoDisponivel)
                .map(secao => {
                    const mod = MODULO_DA_SECAO[secao];
                    return { secao, rotulo: ROTULO_SECAO[secao] || secao, modulo: MODULO_TITULO[mod] || mod };
                });
        }

        // ---- CSS ----
        const estilo = document.createElement("style");
        estilo.textContent = `
.buscanav-fundo{position:fixed;inset:0;z-index:9500;background:rgba(2,6,23,.45);display:none;align-items:flex-start;justify-content:center;padding:12vh 16px 16px}
.buscanav-fundo.aberto{display:flex}
.buscanav-painel{width:min(560px,100%);background:var(--cor-fundo-card);border:1px solid var(--cor-borda);border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,.35);overflow:hidden;display:flex;flex-direction:column;max-height:76vh}
.buscanav-topo{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--cor-borda)}
.buscanav-topo svg{width:18px;height:18px;stroke:var(--cor-texto-suave);fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:none}
.buscanav-input{flex:1;border:0;background:transparent;color:var(--cor-texto);font-size:16px;outline:none}
.buscanav-dica{font-size:11px;color:var(--cor-texto-suave);border:1px solid var(--cor-borda);border-radius:6px;padding:2px 6px;white-space:nowrap}
.buscanav-lista{overflow-y:auto;padding:6px}
.buscanav-item{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 12px;border-radius:8px;cursor:pointer;color:var(--cor-texto)}
.buscanav-item.ativo,.buscanav-item:hover{background:var(--cor-fundo-elevado)}
.buscanav-item b{font-weight:600;font-size:14px}
.buscanav-item small{color:var(--cor-texto-suave);font-size:12px;white-space:nowrap}
.buscanav-vazio{padding:20px;text-align:center;color:var(--cor-texto-suave)}`;
        document.head.appendChild(estilo);

        // ---- Botão no cabeçalho ----
        const botao = document.createElement("button");
        botao.id = "btnBuscaNav";
        botao.type = "button";
        botao.className = "botao-icone";
        botao.title = "Buscar aba (Ctrl+K)";
        botao.setAttribute("aria-label", "Buscar aba");
        botao.innerHTML = '<svg class="icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
        host.prepend(botao);

        // ---- Overlay ----
        const fundo = document.createElement("div");
        fundo.className = "buscanav-fundo";
        fundo.innerHTML = `
            <div class="buscanav-painel" role="dialog" aria-label="Buscar aba">
                <div class="buscanav-topo">
                    <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <input type="text" class="buscanav-input" id="buscaNavInput" placeholder="Buscar aba… (ex.: técnicos, LPU, alertas)" autocomplete="off">
                    <span class="buscanav-dica">Esc</span>
                </div>
                <div class="buscanav-lista" id="buscaNavLista"></div>
            </div>`;
        document.body.appendChild(fundo);

        const input = fundo.querySelector("#buscaNavInput");
        const lista = fundo.querySelector("#buscaNavLista");
        let itens = [];
        let ativo = 0;

        function filtrar(q) {
            const n = norm(q);
            const todos = destinos();
            itens = !n ? todos : todos.filter(d => norm(d.rotulo + " " + d.modulo).includes(n));
            ativo = 0;
            render();
        }

        function render() {
            if (!itens.length) {
                lista.innerHTML = '<div class="buscanav-vazio">Nenhuma aba encontrada.</div>';
                return;
            }
            lista.innerHTML = itens.map((d, i) =>
                `<div class="buscanav-item${i === ativo ? " ativo" : ""}" data-secao="${d.secao}" data-i="${i}"><b>${d.rotulo}</b><small>${d.modulo}</small></div>`
            ).join("");
        }

        function abrir() {
            fundo.classList.add("aberto");
            input.value = "";
            filtrar("");
            setTimeout(() => input.focus(), 30);
        }
        function fechar() { fundo.classList.remove("aberto"); }
        function selecionar(i) {
            const d = itens[i];
            if (!d) return;
            fechar();
            mostrarSecao(d.secao);
        }

        botao.addEventListener("click", abrir);
        input.addEventListener("input", () => filtrar(input.value));
        input.addEventListener("keydown", e => {
            if (e.key === "ArrowDown") { e.preventDefault(); ativo = Math.min(ativo + 1, itens.length - 1); render(); scrollAtivo(); }
            else if (e.key === "ArrowUp") { e.preventDefault(); ativo = Math.max(ativo - 1, 0); render(); scrollAtivo(); }
            else if (e.key === "Enter") { e.preventDefault(); selecionar(ativo); }
            else if (e.key === "Escape") { e.preventDefault(); fechar(); }
        });
        function scrollAtivo() { lista.querySelector(".buscanav-item.ativo")?.scrollIntoView({ block: "nearest" }); }

        lista.addEventListener("click", e => {
            const item = e.target.closest(".buscanav-item");
            if (item) selecionar(Number(item.dataset.i));
        });
        fundo.addEventListener("click", e => { if (e.target === fundo) fechar(); });

        // Atalhos globais: Ctrl/Cmd+K abre; "/" abre quando não está digitando em outro campo.
        document.addEventListener("keydown", e => {
            const digitando = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "") || document.activeElement?.isContentEditable;
            if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); abrir(); }
            else if (e.key === "/" && !digitando && !fundo.classList.contains("aberto")) { e.preventDefault(); abrir(); }
        });
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", pronto);
    else pronto();

})();
