/**
 * ==========================================================
 * Menu em engrenagem (só no index.html)
 * ==========================================================
 * Substitui o hambúrguer + as abas do topo por uma engrenagem grande,
 * meio escondida na borda esquerda: os módulos giram em volta dela e o
 * selecionado para no "3 horas" (setinha dourada), com o nome embaixo.
 * Botão no topo recolhe/expande. O rodapé é a mesma roda, deitada, com
 * as sub-abas do módulo ativo.
 *
 * Reusa 100% da navegação existente: toda troca de tela passa por
 * mostrarSecao() (js/ui/navegacao.js), que é "embrulhado" aqui pra
 * manter o menu em sincronia a cada navegação (tile do Início, URL…).
 */

(function () {

    function pronto() {
        if (typeof window.mostrarSecao !== "function" || !document.getElementById("conteudo")) return;
        if (document.querySelector(".gear-rail")) return;

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

        // Ordem dos módulos na engrenagem (+ dica curta mostrada embaixo).
        const MODULOS = [
            { id: "inicio", titulo: "Início", dica: "Resumo do dia" },
            { id: "ordens", titulo: "Gestão de Relatórios", dica: "Dashboard, indicadores e tempos" },
            { id: "agendador", titulo: "Gestão de Ordens", dica: "Agenda e acompanhamento" },
            { id: "cop", titulo: "Gestão do COP", dica: "Produção e OS em aberto" },
            { id: "clientes", titulo: "Gestão de Clientes", dica: "Cadastro, CTOs e recorrência" },
            { id: "terceiras", titulo: "Gestão de Terceiras", dica: "LPU e fechamento mensal" },
            { id: "escala", titulo: "Escala", dica: "Escala técnica do dia" },
            { id: "auditoria", titulo: "Auditoria", dica: "Qualidade dos fechamentos" },
            { id: "admin", titulo: "Painel de Administrador", dica: "Usuários e configurações" }
        ];

        const ENTRADA = {
            inicio: "inicio", ordens: "dashboard", cop: "cop-abertas", terceiras: "terceiras",
            auditoria: "auditoria", agendador: "agenda-hoje", escala: "escala-hoje",
            clientes: "clientes-cto", admin: "usuarios"
        };

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

        // ---------- Estado de módulo ----------
        const railEl = document.createElement("nav");
        railEl.className = "gear-rail"; railEl.setAttribute("aria-label", "Módulos");
        let subroda = document.createElement("div");
        subroda.className = "menu-subroda"; subroda.hidden = true;
        document.body.appendChild(railEl);
        document.body.appendChild(subroda);
        document.body.classList.add("menu-roda-ativa");

        let gearItens = [], gearGo = null;
        let visAnterior = "", rodaSub = null, rodapeModulo = null, navTimer = null;
        let col = window.innerWidth < 820;
        document.documentElement.classList.toggle("menuroda-rc", col);

        function aplicarCol() { document.documentElement.classList.toggle("menuroda-rc", col); }

        // ---------- Engrenagem ----------
        function construirEngrenagem(ids) {
            gearItens = MODULOS.filter(m => ids.indexOf(m.id) >= 0);
            if (!gearItens.length) { railEl.innerHTML = ""; gearGo = null; return; }

            // Dentes da engrenagem (fixos, só estética).
            const dentes = 10, p = [];
            for (let i = 0; i < dentes; i++) {
                const a = i * 360 / dentes;
                [[a - 9, 100], [a - 6, 118], [a + 6, 118], [a + 9, 100], [a + 18, 100]].forEach(q => {
                    const t = q[0] * Math.PI / 180;
                    p.push((q[1] * Math.cos(t)).toFixed(1) + "," + (q[1] * Math.sin(t)).toFixed(1));
                });
            }
            const gb = `<svg class="gb" viewBox="-120 -120 240 240"><defs><linearGradient id="gearGrad" gradientUnits="userSpaceOnUse" x1="-120" y1="-120" x2="120" y2="120"><stop offset="0" stop-color="#2447a8"/><stop offset="1" stop-color="#0c1630"/></linearGradient></defs><polygon points="${p.join(" ")}" fill="url(#gearGrad)" stroke="#ffffff2e" stroke-width="1.5" stroke-linejoin="round"/><circle r="92" fill="none" stroke="#ffffff1f" stroke-width="1.5"/><circle r="78" fill="none" stroke="#ffffff30" stroke-width="1.5" stroke-dasharray="2 6"/><circle r="50" fill="none" stroke="#ffffff1f" stroke-width="1.5"/><circle r="26" fill="#0c1630" stroke="#f5b335" stroke-width="2.5"/></svg>`;

            const step = 360 / gearItens.length;
            let arms = "";
            gearItens.forEach((m, k) => {
                arms += `<div class="arm" style="--a:${(k * step).toFixed(3)}deg"><button class="it2" data-mod="${m.id}" title="${m.titulo}" aria-label="${m.titulo}">${svg(ICONES[m.id] || "")}</button></div>`;
            });

            railEl.innerHTML =
                `<button class="tg" aria-label="Recolher ou expandir o menu" title="Recolher / expandir"><svg viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg></button>` +
                `<div class="gw">${gb}<div class="ring">${arms}</div><div class="pt"></div></div>` +
                `<div class="nm"><b></b><small></small><div class="pn"><button class="pv" aria-label="Módulo anterior">‹</button><button class="nx" aria-label="Próximo módulo">›</button></div></div>`;

            const elGb = railEl.querySelector(".gb"), elRing = railEl.querySelector(".ring"), its = railEl.querySelectorAll(".it2");
            const elNomeB = railEl.querySelector(".nm b"), elNomeS = railEl.querySelector(".nm small");
            const N = gearItens.length;
            let cur = 0, th = 0, sp = 0;

            function spin() { elGb.style.setProperty("--rot", (th + sp) + "deg"); }
            function go(n, navegar) {
                cur = ((n % N) + N) % N;
                const d = ((-cur * step - th) % 360 + 540) % 360 - 180;   // menor giro até o alvo
                th += d; elRing.style.setProperty("--th", th + "deg"); spin();
                its.forEach((b, k) => b.setAttribute("aria-current", k === cur ? "true" : "false"));
                const m = gearItens[cur];
                elNomeB.textContent = m.titulo; elNomeS.textContent = m.dica || "";
                if (navegar) mostrarSecao(entrada(m.id));
            }

            its.forEach((b, k) => b.onclick = () => go(k, true));
            railEl.querySelector(".pv").onclick = () => go(cur - 1, true);
            railEl.querySelector(".nx").onclick = () => go(cur + 1, true);
            railEl.querySelector(".tg").onclick = () => { col = !col; aplicarCol(); sp += 72; spin(); };

            // girar pela rolagem do mouse sobre a engrenagem (navega ao assentar)
            let acc = 0, trava = false;
            railEl.addEventListener("wheel", e => {
                e.preventDefault(); acc += e.deltaY;
                if (trava) return;
                if (Math.abs(acc) >= 40) {
                    go(cur + (acc > 0 ? 1 : -1), false); acc = 0; trava = true; setTimeout(() => { trava = false; }, 170);
                    clearTimeout(navTimer); const id = gearItens[cur].id; navTimer = setTimeout(() => mostrarSecao(entrada(id)), 240);
                }
            }, { passive: false });

            elRing.style.setProperty("--th", "0deg");
            // rotaciona (silencioso) até o módulo pedido
            gearGo = function (id) { const k = gearItens.findIndex(m => m.id === id); if (k >= 0) go(k, false); };
            go(0, false);
        }

        // ---------- Roda do rodapé (sub-abas), giro infinito ----------
        function criarRoda(cont, itens, o, onCentro) {
            const N = itens.length, HALF = Math.floor(N / 2), els = [];
            let centro = 0;
            itens.forEach((it, i) => {
                const el = document.createElement("button");
                el.type = "button"; el.className = o.cls;
                el.innerHTML = o.render(it);
                el.addEventListener("click", () => setC(i, true, false));
                el._i = i; cont.appendChild(el); els.push(el);
            });
            const wrapOff = i => ((i - centro + HALF) % N + N) % N - HALF;
            function layout(anim) {
                els.forEach(el => {
                    const off = wrapOff(el._i), prev = el._off, jump = (prev != null) && Math.abs(off - prev) > 1, d = Math.abs(off);
                    if (jump || !anim) el.style.transition = "none";
                    const px = off * o.STEP, bow = Math.sqrt(Math.max(0, o.RC * o.RC - px * px)) - o.RC, sc = (1 - Math.min(d, o.VIS) * o.shrink).toFixed(3);
                    el.style.transform = `translateX(-50%) translate(${px.toFixed(1)}px,${(bow * o.bow).toFixed(1)}px) scale(${sc})`;
                    el.style.opacity = d > o.VIS ? 0 : (1 - d * o.fade).toFixed(2);
                    el.style.pointerEvents = d > o.VIS ? "none" : "auto";
                    el.style.zIndex = 10 - d;
                    el.classList.toggle("centro", off === 0);
                    el._off = off;
                    if (jump || !anim) { void el.offsetWidth; el.style.transition = ""; }
                });
            }
            function setC(i, anim, silent) { centro = ((i % N) + N) % N; layout(anim); if (!silent && onCentro) onCentro(itens[centro]); }
            let acc = 0, trava = false;
            cont.addEventListener("wheel", e => {
                e.preventDefault(); acc += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
                if (trava) return;
                if (Math.abs(acc) >= o.thr) { setC(centro + (acc > 0 ? 1 : -1), true, false); acc = 0; trava = true; setTimeout(() => { trava = false; }, 150); }
            }, { passive: false });
            layout(false);
            return { irSilencioso(id) { const i = itens.findIndex(x => x.secao === id); if (i >= 0) setC(i, true, true); } };
        }

        function construirRodape(mod, secao) {
            if (mod === rodapeModulo && rodaSub) { rodaSub.irSilencioso(secao); return; }
            rodapeModulo = mod;
            const novo = document.createElement("div");
            novo.className = "menu-subroda";
            subroda.replaceWith(novo); subroda = novo;

            const secoes = secoesDoModulo(mod);
            if (secoes.length < 2) { subroda.hidden = true; rodaSub = null; return; }
            subroda.hidden = false;
            const itens = secoes.map(s => ({ secao: s, label: LABELS[s] || s }));
            rodaSub = criarRoda(subroda, itens, {
                cls: "ro-sitem", STEP: 152, RC: 640, VIS: 3, fade: 0.26, shrink: 0.06, thr: 42, bow: -1,
                render: it => it.label
            }, it => mostrarSecao(it.secao));
            rodaSub.irSilencioso(secao);
        }

        // ---------- Sincronização ----------
        let sincronizando = false;
        function sincronizar() {
            if (sincronizando) return;
            sincronizando = true;
            try {
                const secao = (typeof secaoAtiva === "function" ? secaoAtiva() : "inicio");
                const mod = (typeof MODULO_DA_SECAO !== "undefined" && MODULO_DA_SECAO[secao]) || "inicio";
                const vis = MODULOS.filter(m => moduloVisivel(m.id)).map(m => m.id).join(",");
                if (vis !== visAnterior) { visAnterior = vis; construirEngrenagem(vis ? vis.split(",") : []); }
                if (gearGo) gearGo(mod);
                construirRodape(mod, secao);
            } finally { sincronizando = false; }
        }

        // Embrulha mostrarSecao pra manter o menu em sincronia a cada navegação.
        const _mostrar = window.mostrarSecao;
        window.mostrarSecao = function (nome) { _mostrar(nome); sincronizar(); };

        window.sincronizarMenuRoda = sincronizar;   // pra re-sincronizar depois do login/carga
        sincronizar();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", pronto);
    else pronto();

})();
