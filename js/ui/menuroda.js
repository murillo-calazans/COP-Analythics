/**
 * ==========================================================
 * Menu em roda (só no index.html)
 * ==========================================================
 * Substitui o hambúrguer + as abas do topo por duas "rodas":
 *   - LATERAL: os módulos do COP. A seleção fica fixa no meio (amarela),
 *     os outros nomes opacos sobre o fundo; gira em loop infinito; fica
 *     recolhida na borda e expande no hover/toque.
 *   - RODAPÉ: as sub-abas (seções) do módulo ativo — a mesma roda, deitada.
 *
 * Reusa 100% da navegação existente: toda troca de tela passa por
 * mostrarSecao() (js/ui/navegacao.js), que é "embrulhado" aqui pra
 * manter as rodas em sincronia a cada navegação (tile do Início, URL,
 * clique…). Nada de cálculo novo — só apresentação.
 */

(function () {

    function pronto() {
        if (typeof window.mostrarSecao !== "function" || !document.getElementById("conteudo")) return;
        if (document.querySelector(".menu-roda")) return;

        // Ícones (espelham js/ui/menulateral.js).
        const ICONES = {
            inicio: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
            ordens: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
            agendador: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="m9 16 2 2 4-4"/>',
            cop: '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-3v-5h3a2 2 0 0 1 2 2zM3 19a2 2 0 0 0 2 2h3v-5H5a2 2 0 0 0-2 2z"/>',
            clientes: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/>',
            terceiras: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
            escala: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h3M13 14h3M8 18h3"/>',
            auditoria: '<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 14 2 2 4-4"/>',
            admin: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>'
        };

        // Ordem dos módulos na roda.
        const MODULOS = [
            { id: "inicio", titulo: "Início" },
            { id: "ordens", titulo: "Gestão de Relatórios" },
            { id: "agendador", titulo: "Gestão de Ordens" },
            { id: "cop", titulo: "Gestão do COP" },
            { id: "clientes", titulo: "Gestão de Clientes" },
            { id: "terceiras", titulo: "Gestão de Terceiras" },
            { id: "escala", titulo: "Escala" },
            { id: "auditoria", titulo: "Auditoria" },
            { id: "admin", titulo: "Painel de Administrador" }
        ];

        // Seção de entrada de cada módulo (fallback; o padrão é a 1ª liberada).
        const ENTRADA = {
            inicio: "inicio", ordens: "dashboard", cop: "cop-abertas", terceiras: "terceiras",
            auditoria: "auditoria", agendador: "agenda-hoje", escala: "escala-hoje",
            clientes: "clientes-cto", admin: "usuarios"
        };

        // Rótulos das sub-abas (iguais ao menu antigo do topo).
        const LABELS = {
            dashboard: "Dashboard", tempos: "TMA · TMS · TME · TMR", indicadores: "Indicadores",
            "cop-abertas": "COP em aberto", "gestao-cop": "Produção · TMR",
            ordens: "Ordens", tecnicos: "Técnicos", "mapa-calor": "Mapa de calor",
            "clientes-cto": "Cadastro na CTO", alertas: "Alertas", "ctos-lacres": "CTOs e Lacres",
            enderecos: "Endereços a corrigir",
            terceiras: "Painel", "terceiras-fechamento": "Fechamento", "terceiras-lpu": "LPU",
            "terceiras-qualidade": "Qualidade",
            auditoria: "Auditoria", "auditoria-ia": "Auditor IA",
            usuarios: "Usuários", configuracoes: "Configurações"
        };

        const svg = p => `<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;

        function moduloVisivel(id) {
            if (id === "admin") return typeof ehAdmin !== "function" || ehAdmin();
            if (id === "terceiras") return typeof podeEditarOperacao !== "function" || podeEditarOperacao();
            if (id === "inicio") return true;
            return typeof primeiraSecaoLiberada === "function" ? !!primeiraSecaoLiberada(id) : true;
        }
        function entrada(id) {
            if (id === "inicio") return "inicio";
            return (typeof primeiraSecaoLiberada === "function" && primeiraSecaoLiberada(id)) || ENTRADA[id];
        }
        function secoesDoModulo(mod) {
            if (typeof MODULO_DA_SECAO === "undefined") return [];
            return Object.keys(MODULO_DA_SECAO).filter(s =>
                MODULO_DA_SECAO[s] === mod && (typeof podeVerSecao !== "function" || podeVerSecao(s)));
        }

        // ---------- Fábrica de roda (vertical = lateral; horizontal = rodapé), giro infinito ----------
        function criarRoda(cont, itens, o, onCentro) {
            const N = itens.length, HALF = Math.floor(N / 2), els = [];
            let centro = 0;
            itens.forEach((it, i) => {
                const el = document.createElement("button");
                el.type = "button"; el.className = o.cls; if (o.titulo) el.title = o.titulo(it);
                el.innerHTML = o.render(it);
                el.addEventListener("click", () => setC(i, true, false, true));
                el._i = i; cont.appendChild(el); els.push(el);
            });
            // deslocamento simétrico em relação ao centro (é o que faz o loop infinito)
            const wrapOff = i => ((i - centro + HALF) % N + N) % N - HALF;
            function layout(anim) {
                els.forEach(el => {
                    const off = wrapOff(el._i), prev = el._off, jump = (prev != null) && Math.abs(off - prev) > 1, d = Math.abs(off);
                    if (jump || !anim) el.style.transition = "none";   // deu a volta: teleporta sem animar
                    const p = off * o.STEP, bow = Math.sqrt(Math.max(0, o.RC * o.RC - p * p)) - o.RC, sc = (1 - Math.min(d, o.VIS) * o.shrink).toFixed(3);
                    if (o.horiz) el.style.transform = `translateX(-50%) translate(${p.toFixed(1)}px,${(bow * o.bow).toFixed(1)}px) scale(${sc})`;
                    else el.style.transform = `translateY(-50%) translate(${bow.toFixed(1)}px,${p}px) scale(${sc})`;
                    el.style.opacity = d > o.VIS ? 0 : (1 - d * o.fade).toFixed(2);
                    el.style.pointerEvents = d > o.VIS ? "none" : "auto";
                    el.style.zIndex = 10 - d;
                    el.classList.toggle("centro", off === 0);
                    el._off = off;
                    if (jump || !anim) { void el.offsetWidth; el.style.transition = ""; }   // restaura a transição
                });
            }
            function setC(i, anim, silent, imediato) {
                centro = ((i % N) + N) % N; layout(anim);
                if (!silent && onCentro) onCentro(itens[centro], imediato);
            }
            let acc = 0, trava = false;
            cont.addEventListener("wheel", e => {
                e.preventDefault();
                acc += o.horiz ? (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) : e.deltaY;
                if (trava) return;
                if (Math.abs(acc) >= o.thr) { setC(centro + (acc > 0 ? 1 : -1), true, false, false); acc = 0; trava = true; setTimeout(() => { trava = false; }, 150); }
            }, { passive: false });
            layout(false);
            return {
                irSilencioso(id) { const i = itens.findIndex(x => (x.id || x.secao) === id); if (i >= 0) setC(i, true, true, false); }
            };
        }

        // ---------- Monta o DOM ----------
        const roda = document.createElement("div");
        roda.className = "menu-roda"; roda.setAttribute("aria-label", "Módulos");
        let subroda = document.createElement("div");
        subroda.className = "menu-subroda"; subroda.hidden = true;
        document.body.appendChild(roda);
        document.body.appendChild(subroda);
        document.body.classList.add("menu-roda-ativa");

        let rodaLat = null, visAnterior = "", rodaSub = null, rodapeModulo = null, navTimer = null;

        function construirLateral(ids) {
            roda.innerHTML = "";
            const itens = MODULOS.filter(m => ids.indexOf(m.id) >= 0);
            rodaLat = criarRoda(roda, itens, {
                cls: "ro-item", horiz: false, STEP: 56, RC: 460, VIS: 3, fade: 0.24, shrink: 0.07, thr: 34,
                titulo: m => m.titulo,
                render: m => `<span class="ro-ic">${svg(ICONES[m.id] || "")}</span><span class="ro-tx">${m.titulo}</span>`
            }, (m, imediato) => {
                const alvo = entrada(m.id);
                clearTimeout(navTimer);
                // clique vai na hora; rolagem espera "assentar" (240 ms) pra não renderizar módulo à toa
                if (imediato) mostrarSecao(alvo);
                else navTimer = setTimeout(() => mostrarSecao(alvo), 240);
            });
        }

        function construirRodape(mod, secao) {
            if (mod === rodapeModulo && rodaSub) { rodaSub.irSilencioso(secao); return; }
            rodapeModulo = mod;
            const novo = document.createElement("div");
            novo.className = "menu-subroda";
            subroda.replaceWith(novo); subroda = novo;   // nó novo = handlers antigos somem

            const secoes = secoesDoModulo(mod);
            if (secoes.length < 2) { subroda.hidden = true; rodaSub = null; return; }
            subroda.hidden = false;
            const itens = secoes.map(s => ({ secao: s, label: LABELS[s] || s }));
            rodaSub = criarRoda(subroda, itens, {
                cls: "ro-sitem", horiz: true, STEP: 152, RC: 640, VIS: 3, fade: 0.26, shrink: 0.06, thr: 42, bow: -1,
                render: it => it.label
            }, it => mostrarSecao(it.secao));
            rodaSub.irSilencioso(secao);
        }

        let sincronizando = false;
        function sincronizar() {
            if (sincronizando) return;
            sincronizando = true;
            try {
                const secao = (typeof secaoAtiva === "function" ? secaoAtiva() : "inicio");
                const mod = (typeof MODULO_DA_SECAO !== "undefined" && MODULO_DA_SECAO[secao]) || "inicio";
                const vis = MODULOS.filter(m => moduloVisivel(m.id)).map(m => m.id).join(",");
                if (vis !== visAnterior) { visAnterior = vis; construirLateral(vis ? vis.split(",") : []); }
                if (rodaLat) rodaLat.irSilencioso(mod);
                construirRodape(mod, secao);
            } finally { sincronizando = false; }
        }

        // Embrulha mostrarSecao pra manter as rodas em sincronia a cada navegação.
        const _mostrar = window.mostrarSecao;
        window.mostrarSecao = function (nome) { _mostrar(nome); sincronizar(); };

        // Toque (sem hover): tocar abre; ao escolher, recolhe. No desktop o hover já cuida.
        const temHover = window.matchMedia("(hover: hover)").matches;
        roda.addEventListener("click", () => {
            if (temHover) return;
            if (roda.classList.contains("aberta")) setTimeout(() => roda.classList.remove("aberta"), 10);
            else roda.classList.add("aberta");
        });
        document.addEventListener("click", e => { if (!roda.contains(e.target)) roda.classList.remove("aberta"); });

        window.sincronizarMenuRoda = sincronizar;   // pra re-sincronizar depois do login/carga
        sincronizar();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", pronto);
    else pronto();

})();
