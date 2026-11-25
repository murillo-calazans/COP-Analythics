(function () {

    function pronto() {
        if (typeof window.mostrarSecao !== "function" || !document.getElementById("conteudo")) return;
        if (document.querySelector(".gear-rail")) return;

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

        const MODULOS = [
            { id: "inicio", titulo: "Início", dica: "Resumo do dia" },
            { id: "agendador", titulo: "Gestão de Ordens", dica: "Agenda e acompanhamento" },
            { id: "cop", titulo: "Gestão do COP", dica: "Acompanhamento dos técnicos" },
            { id: "clientes", titulo: "Gestão de Clientes", dica: "Cadastro, CTOs e recorrência" },
            { id: "escala", titulo: "Escala", dica: "Escala técnica do dia" },
            { id: "admin", titulo: "Painel de Administrador", dica: "Usuários e configurações" }
        ];

        const ENTRADA = {
            inicio: "inicio", cop: "acompanhamento-cop", agendador: "agenda-agendadas", escala: "escala-hoje",
            clientes: "clientes-cto", admin: "usuarios"
        };

        const LABELS = {
            "acompanhamento-cop": "Acompanhamento COP",
            "clientes-cto": "Cadastro na CTO", alertas: "Alertas", "ctos-lacres": "CTOs e Lacres", enderecos: "Endereços a corrigir",
            "agenda-agendadas": "Ordens", "agenda-hoje": "Agenda",
            "escala-hoje": "Escala do dia", "escala-contatos": "Contatos", "escala-capacidade": "Capacidade", "escala-terceiras": "Programação terceiras",
            usuarios: "Usuários", configuracoes: "Configurações"
        };

        // nome curto que cabe no botão da engrenagem principal
        const CURTO = {
            agendador: "Ordens", cop: "COP", clientes: "Clientes", escala: "Escala", admin: "Admin"
        };

        const svg = p =>`<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;

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

        const railEl = document.createElement("nav");
        railEl.className = "gear-rail"; railEl.setAttribute("aria-label", "Módulos");
        document.body.appendChild(railEl);
        document.body.classList.add("menu-roda-ativa");

        let gearItens = [], gearGo = null;
        let visAnterior = "", navTimer = null;

        // Onde estou: "Módulo › Aba" no cabeçalho.
        const cabLocal = document.createElement("div");
        cabLocal.className = "cab-local"; cabLocal.setAttribute("aria-live", "polite");
        cabLocal.innerHTML = '<span class="cab-mod"></span><span class="cab-sep" aria-hidden="true">›</span><b class="cab-aba"></b>';
        const cabLogo = document.querySelector("header .logo");
        if (cabLogo) cabLogo.after(cabLocal);
        function atualizarCabLocal(mod, secao) {
            const m = MODULOS.find(x => x.id === mod);
            const naHome = mod === "inicio";
            cabLocal.querySelector(".cab-mod").textContent = naHome ? "" : (m ? m.titulo : "");
            cabLocal.querySelector(".cab-aba").textContent = naHome ? "Início" : (LABELS[secao] || (m ? m.titulo : secao));
            cabLocal.classList.toggle("so-aba", naHome);
            const nome = naHome ? "Início" : (m ? m.titulo : "") + (LABELS[secao] ? " · " + LABELS[secao] : "");
            document.title = nome ? nome + " — COP Analytics" : "COP Analytics";
        }

        // Cabeçalho some ao rolar pra baixo; volta ao chegar no topo, ao rolar pra cima
        // (toque) ou quando o mouse encosta na parte de cima da tela.
        (function cabecalhoAutoOculto() {
            const cab = document.querySelector("header");
            if (!cab) return;
            document.body.classList.add("cab-auto");
            let ultimoY = window.scrollY, mouseNoTopo = false;
            const mostrar = () => document.body.classList.remove("cab-oculto");
            const ocultar = () => { if (!mouseNoTopo && !cab.contains(document.activeElement) && !cab.querySelector(".aberto,.ativo-dropdown,[aria-expanded=true]")) document.body.classList.add("cab-oculto"); };
            window.addEventListener("scroll", () => {
                const y = window.scrollY;
                if (y < 80) mostrar();
                else if (y > ultimoY + 4) ocultar();
                else if (y < ultimoY - 30 && !temHoverCab) mostrar();   // toque: rolar pra cima mostra
                ultimoY = y;
            }, { passive: true });
            const temHoverCab = window.matchMedia("(hover: hover)").matches;
            document.addEventListener("mousemove", e => {
                const alto = cab.offsetHeight || 70;
                if (e.clientY <= 14) { mouseNoTopo = true; mostrar(); }
                else if (mouseNoTopo && e.clientY > alto + 10) { mouseNoTopo = false; if (window.scrollY >= 80) ocultar(); }
            }, { passive: true });
        })();

        const temHover = window.matchMedia("(hover: hover)").matches;
        railEl.addEventListener("click", () => { if (!temHover) railEl.classList.add("aberta"); });
        document.addEventListener("click", e => { if (!railEl.contains(e.target)) railEl.classList.remove("aberta"); });

        // ---------- Engrenagem PRINCIPAL (tela inicial, 23/11) ----------
        // Ao entrar, a engrenagem abre grande no meio da tela e fica girando devagar.
        // Passar o mouse só mostra o nome; o módulo abre ao clicar (ou Enter): ela gira
        // até a setinha, encolhe pra lateral e aí abre. Voltar = miolo da engrenagem lateral.
        const reduzMov = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        let hubEl = null, hubItens = [], hubCur = 0, hubTh = 0, hubAbrindo = false, hubEntTimer = null;
        let ultimoMod = null, railChegando = false;

        function dentesSvg(dentes) {
            const p = [];
            for (let i = 0; i < dentes; i++) {
                const a = i * 360 / dentes, pa = 360 / dentes;   // largura do dente proporcional ao passo: as engrenagens encaixam
                [[a - .3 * pa, 100], [a - .2 * pa, 118], [a + .2 * pa, 118], [a + .3 * pa, 100], [a + .5 * pa, 100]].forEach(q => {
                    const t = q[0] * Math.PI / 180;
                    p.push((q[1] * Math.cos(t)).toFixed(1) + "," + (q[1] * Math.sin(t)).toFixed(1));
                });
            }
            return p.join(" ");
        }
        // Engrenagem dourada pequena que gira engrenada na grande (ao contrário, mais rápida).
        // fase = giro inicial pra um dente cair no vão da grande.
        function engrenagemDourada(id, dentes, fase, cls) {
            return `<svg class="${cls}" viewBox="-120 -120 240 240" aria-hidden="true"><defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="-120" y1="-120" x2="120" y2="120"><stop offset="0" stop-color="#ffd47a"/><stop offset="1" stop-color="#c98a12"/></linearGradient></defs><polygon transform="rotate(${fase})" points="${dentesSvg(dentes)}" fill="url(#${id})" stroke="#ffffff55" stroke-width="2" stroke-linejoin="round"/><circle r="80" fill="none" stroke="#ffffff40" stroke-width="2" stroke-dasharray="3 7"/><circle r="34" fill="#0c1630" stroke="#ffffff55" stroke-width="3"/><circle r="12" fill="#F5B335"/></svg>`;
        }

        function construirHub(ids) {
            const host = document.getElementById("secao-inicio");
            if (!host) return;
            let sec = host.querySelector(".hub-home");
            if (!sec) {
                sec = document.createElement("div");
                sec.className = "hub-home";
                host.insertBefore(sec, host.firstChild);
            }
            hubItens = MODULOS.filter(m => m.id !== "inicio" && ids.indexOf(m.id) >= 0);
            const kpi = (id, rot, det) =>
                `<button type="button" class="hub-kpi" data-kpi="${id}"><small>${rot}</small><strong id="hubKpi-${id}">…</strong><em id="hubKpiDet-${id}">${det}</em></button>`;
            const N = hubItens.length, step = N ? 360 / N : 0;
            let arms = "";
            hubItens.forEach((m, k) => {
                arms += `<div class="hub-arm" style="--a:${(k * step).toFixed(3)}deg"><button type="button" class="hub-no" style="--i:${k}" data-k="${k}" aria-label="Abrir ${m.titulo}">${svg(ICONES[m.id] || "")}<span>${CURTO[m.id] || m.titulo}</span></button></div>`;
            });
            sec.innerHTML =
                `<div class="hub-kpis esq">${kpi("abertas", "OS de campo em aberto", "reparo, instalação e troca")}${kpi("agenda", "Agendadas hoje", "na agenda do dia")}</div>` +
                `<div class="hub-meio"><div class="hub-gear">` +
                    `<div class="hub-gb2w">${engrenagemDourada("hubGrad2", 5, 45, "hub-gb2")}</div>` +
                    `<div class="hub-gb3w"><div class="hub-gb3r">${engrenagemDourada("hubGrad3", 6, 15, "hub-gb3")}</div><div class="hub-abas" role="group" aria-label="Abas do módulo"></div></div>` +
                    `<div class="hub-gbw"><svg class="hub-gb" viewBox="-120 -120 240 240" aria-hidden="true"><defs><linearGradient id="hubGrad" gradientUnits="userSpaceOnUse" x1="-120" y1="-120" x2="120" y2="120"><stop offset="0" stop-color="#2447a8"/><stop offset="1" stop-color="#0c1630"/></linearGradient></defs><polygon points="${dentesSvg(12)}" fill="url(#hubGrad)" stroke="#ffffff2e" stroke-width="1.5" stroke-linejoin="round"/><circle r="92" fill="none" stroke="#ffffff1f" stroke-width="1.5"/><circle r="80" fill="none" stroke="#ffffff30" stroke-width="1.5" stroke-dasharray="2 6"/><circle r="50" fill="none" stroke="#ffffff1f" stroke-width="1.5"/></svg></div>` +
                    `<div class="hub-ring">${arms}</div><div class="hub-pt" aria-hidden="true"></div>` +
                    `<div class="hub-centro"><small class="hub-saud"></small><b class="hub-nome"></b><span class="hub-dica-mod"></span>${N ? '<button type="button" class="hub-abrir">Abrir ›</button>' : ""}</div>` +
                `</div>${N ? "" : '<p class="hub-dica">Nenhum módulo liberado para você</p>'}</div>` +
                `<div class="hub-kpis dir">${kpi("fech", "Finalizadas hoje", "fechamentos do dia")}${kpi("romp", "Possíveis rompimentos", "grupos caídos juntos")}</div>`;
            hubEl = sec;
            hubTh = 0;

            sec.querySelectorAll(".hub-no").forEach(b => {
                const k = +b.dataset.k;
                b.addEventListener("mouseenter", () => hubMostrar(k));
                b.addEventListener("focus", () => hubMostrar(k));
                b.addEventListener("mouseleave", () => hubMostrar(hubCur));
                b.addEventListener("click", () => hubSelecionar(k));
            });
            sec.querySelector(".hub-abrir")?.addEventListener("click", () => hubSelecionar(hubCur));
            const IR = { abertas: "agenda-hoje", agenda: "agenda-hoje", fech: "agenda-hoje" };
            sec.querySelectorAll(".hub-kpi").forEach(b => b.addEventListener("click", () => {
                const q = b.dataset.kpi;
                if (q === "romp") { if (typeof abrirPopupRompimentos === "function") abrirPopupRompimentos(); return; }
                mostrarSecao(IR[q]);
            }));
            const gear = sec.querySelector(".hub-gear");
            let trava = false;
            gear.addEventListener("wheel", e => {
                if (!hubItens.length) return;
                e.preventDefault();
                if (trava || Math.abs(e.deltaY) < 4) return;
                hubGirar(hubCur + (e.deltaY > 0 ? 1 : -1));
                trava = true; setTimeout(() => { trava = false; }, 180);
            }, { passive: false });
            if (hubItens.length) hubGirar(Math.min(hubCur, hubItens.length - 1));
        }

        function hubMostrar(k) {
            if (!hubEl || !hubItens[k]) return;
            hubEl.querySelector(".hub-nome").textContent = hubItens[k].titulo;
            hubEl.querySelector(".hub-dica-mod").textContent = hubItens[k].dica || "";
            hubAbas(k);
        }
        // Engrenagem de abas (canto de baixo à esquerda): abas redondas do módulo que está
        // na setinha (ou sob o mouse). Clicar numa aba abre direto nela.
        function hubAbas(k) {
            const box = hubEl && hubEl.querySelector(".hub-abas");
            if (!box || box.dataset.mod === hubItens[k].id) return;
            box.dataset.mod = hubItens[k].id;
            let secoes = secoesDoModulo(hubItens[k].id);
            if (!secoes.length) secoes = [entrada(hubItens[k].id)];
            const ent = entrada(hubItens[k].id), n = secoes.length;
            box.innerHTML = secoes.map((s, i) =>
                `<button type="button" class="hub-aba${s === ent ? " ent" : ""}" style="--ang:${(-90 + i * 360 / n).toFixed(2)}deg;--j:${i}" data-ir="${s}">${LABELS[s] || s}</button>`
            ).join("");
            box.querySelectorAll("button").forEach(b => b.addEventListener("click", () => hubSelecionar(k, b.dataset.ir)));
            if (!reduzMov) { box.classList.remove("troca"); void box.offsetWidth; box.classList.add("troca"); }
        }
        function hubGirar(n) {
            const N = hubItens.length;
            if (!hubEl || !N) return;
            const step = 360 / N;
            hubCur = ((n % N) + N) % N;
            hubTh += ((-hubCur * step - hubTh) % 360 + 540) % 360 - 180;   // caminho mais curto até a setinha
            const gear = hubEl.querySelector(".hub-gear");
            gear.style.setProperty("--th", hubTh + "deg");
            gear.style.setProperty("--rot", (hubTh * 1.6) + "deg");
            gear.style.setProperty("--rot2", (-hubTh * 1.6 * 2.4) + "deg");   // dourada: engrenada, ao contrário e 2,4x
            gear.style.setProperty("--rot3", (-hubTh * 1.6 * 2) + "deg");     // abas: 6 dentes x 12 = 2x, ao contrário
            hubEl.querySelectorAll(".hub-no").forEach((b, i) => b.setAttribute("aria-current", i === hubCur ? "true" : "false"));
            hubMostrar(hubCur);
        }
        function hubSelecionar(k, secao) {
            if (hubAbrindo || !hubItens[k]) return;
            const id = hubItens[k].id, destino = secao || entrada(id);
            if (reduzMov) { mostrarSecao(destino); return; }
            hubAbrindo = true;
            hubGirar(k);                                                    // gira até a setinha…
            setTimeout(() => hubEl && hubEl.classList.add("saindo"), 650);  // …encolhe pra lateral…
            setTimeout(() => {                                              // …e abre o módulo
                railChegando = true;
                mostrarSecao(destino);
                hubAbrindo = false;
                if (hubEl) hubEl.classList.remove("saindo");
            }, 1250);
        }
        function hubAnimarEntrada() {
            if (!hubEl || reduzMov) return;
            hubEl.classList.remove("entrando"); void hubEl.offsetWidth; hubEl.classList.add("entrando");
            clearTimeout(hubEntTimer);
            // tira a classe depois da abertura pra liberar o giro com mola
            hubEntTimer = setTimeout(() => hubEl && hubEl.classList.remove("entrando"), 1900);
        }
        function hubAtualizarSaudacao() {
            if (!hubEl) return;
            const s = typeof saudacaoDoHorario === "function" ? saudacaoDoHorario() : "Olá";
            const nome = typeof primeiroNomeUsuario === "function" ? primeiroNomeUsuario() : "";
            hubEl.querySelector(".hub-saud").textContent = s + (nome ? ", " + nome : "");
        }
        document.addEventListener("keydown", e => {
            if (!document.body.classList.contains("cop-home") || hubAbrindo || !hubItens.length) return;
            const a = document.activeElement;
            if (a && a !== document.body && !(hubEl && hubEl.contains(a))) return;   // não rouba setas de campos/tabelas
            if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); hubGirar(hubCur + 1); }
            else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); hubGirar(hubCur - 1); }
            else if (e.key === "Enter" && (!a || a === document.body)) { e.preventDefault(); hubSelecionar(hubCur); }
        });

        function construirEngrenagem(ids) {
            gearItens = MODULOS.filter(m => m.id !== "inicio" && ids.indexOf(m.id) >= 0);
            if (!gearItens.length) { railEl.innerHTML = ""; gearGo = null; return; }

            const gb = `<svg class="gb" viewBox="-120 -120 240 240"><defs><linearGradient id="gearGrad" gradientUnits="userSpaceOnUse" x1="-120" y1="-120" x2="120" y2="120"><stop offset="0" stop-color="#2447a8"/><stop offset="1" stop-color="#0c1630"/></linearGradient></defs><polygon points="${dentesSvg(10)}" fill="url(#gearGrad)" stroke="#ffffff2e" stroke-width="1.5" stroke-linejoin="round"/><circle r="92" fill="none" stroke="#ffffff1f" stroke-width="1.5"/><circle r="78" fill="none" stroke="#ffffff30" stroke-width="1.5" stroke-dasharray="2 6"/><circle r="50" fill="none" stroke="#ffffff1f" stroke-width="1.5"/><circle r="26" fill="#0c1630" stroke="#f5b335" stroke-width="2.5"/></svg>`;

            const step = 360 / gearItens.length;
            let arms = "";
            gearItens.forEach((m, k) => {
                arms += `<div class="arm" style="--a:${(k * step).toFixed(3)}deg"><button class="it2" data-mod="${m.id}" title="${m.titulo}" aria-label="${m.titulo}">${svg(ICONES[m.id] || "")}</button></div>`;
            });

            railEl.innerHTML =
                `<div class="gw"><div class="gb2r">${engrenagemDourada("gearGrad2", 4, 36, "gb2")}</div><div class="gbr">${gb}</div><div class="ring">${arms}</div><div class="pt"></div><button type="button" class="casa" title="Voltar ao centro" aria-label="Voltar ao centro"></button></div>` +
                `<div class="nm"><b></b><small></small><div class="pn"><button class="pv" aria-label="Módulo anterior">‹</button><button class="nx" aria-label="Próximo módulo">›</button></div><button type="button" class="voltar-centro">⟲ Voltar ao centro</button></div>`;
            railEl.querySelector(".casa").onclick = railEl.querySelector(".voltar-centro").onclick = e => {
                e.stopPropagation(); railEl.classList.remove("aberta"); mostrarSecao("inicio");
            };

            const elGb = railEl.querySelector(".gbr"), elGb2 = railEl.querySelector(".gb2r"), elRing = railEl.querySelector(".ring"), its = railEl.querySelectorAll(".it2");
            const elNomeB = railEl.querySelector(".nm b"), elNomeS = railEl.querySelector(".nm small");
            const N = gearItens.length;
            let cur = 0, th = 0, sp = 0;

            function spin() {
                elGb.style.setProperty("--rot", (th + sp) + "deg");
                elGb2.style.setProperty("--rot2", (-(th + sp) * 2.5) + "deg");   // dourada engrenada: ao contrário e 2,5x
                canto.style.setProperty("--rot3", (-(th + sp) * 10 / 6) + "deg");  // abas do canto giram junto
            }
            function go(n, navegar) {
                cur = ((n % N) + N) % N;
                const d = ((-cur * step - th) % 360 + 540) % 360 - 180;
                th += d; elRing.style.setProperty("--th", th + "deg"); spin();
                its.forEach((b, k) => b.setAttribute("aria-current", k === cur ? "true" : "false"));
                const m = gearItens[cur];
                elNomeB.textContent = m.titulo; elNomeS.textContent = m.dica || "";
                if (navegar) mostrarSecao(entrada(m.id));
            }

            its.forEach((b, k) => b.onclick = () => go(k, true));
            railEl.querySelector(".pv").onclick = () => go(cur - 1, true);
            railEl.querySelector(".nx").onclick = () => go(cur + 1, true);

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

            gearGo = function (id) { const k = gearItens.findIndex(m => m.id === id); if (k >= 0) go(k, false); };
            go(0, false);
        }

        // ---------- Abas dentro do módulo: engrenagem dourada no canto de baixo à esquerda (24/11) ----------
        // Substitui a meia-lua do rodapé. Recolhida: um quarto da engrenagem com a aba atual.
        // Mouse em cima (ou toque): cresce e as abas abrem em leque, redondas. Gira junto com a lateral.
        const canto = document.createElement("nav");
        canto.className = "abas-canto"; canto.hidden = true; canto.setAttribute("aria-label", "Abas do módulo");
        canto.innerHTML = `<div class="ac-gw"><div class="ac-gbr">${engrenagemDourada("acGrad", 6, 0, "ac-gb")}</div></div><div class="ac-abas"></div>`;
        document.body.appendChild(canto);
        canto.addEventListener("click", e => { if (!temHover && !canto.classList.contains("aberta")) { canto.classList.add("aberta"); e.stopPropagation(); } }, true);
        document.addEventListener("click", e => { if (!canto.contains(e.target)) canto.classList.remove("aberta"); });
        let cantoMod = null;
        function construirRodape(mod, secao) {
            const secoes = mod === "inicio" ? [] : secoesDoModulo(mod);
            if (secoes.length < 2) { canto.hidden = true; cantoMod = null; return; }
            canto.hidden = false;
            const box = canto.querySelector(".ac-abas");
            if (mod !== cantoMod) {
                cantoMod = mod;
                // até 4 abas: um arco; mais que isso: dois arcos (dentro e fora)
                const n = secoes.length, dentro = n <= 4 ? n : Math.ceil(n / 2);
                box.innerHTML = secoes.map((sec, i) => {
                    const arco = i < dentro ? 0 : 1, qtd = arco ? n - dentro : dentro, pos = arco ? i - dentro : i;
                    const rf = n <= 4 ? .36 : (arco ? .44 : .29);
                    const ang = (qtd === 1 ? 45 : 20 + pos * 50 / (qtd - 1)) * Math.PI / 180;   // 20°–70°: nada encosta na borda
                    return `<button type="button" class="ac-aba" data-ir="${sec}" style="--cx:${(Math.cos(ang) * rf).toFixed(4)};--cy:${(Math.sin(ang) * rf).toFixed(4)};--j:${i}">${LABELS[sec] || sec}</button>`;
                }).join("");
                box.querySelectorAll(".ac-aba").forEach(b => b.addEventListener("click", e => {
                    if (!temHover && !canto.classList.contains("aberta")) return;
                    e.stopPropagation(); canto.classList.remove("aberta"); mostrarSecao(b.dataset.ir);
                }));
            }
            box.querySelectorAll(".ac-aba").forEach(b => {
                const atual = b.dataset.ir === secao;
                b.classList.toggle("atual", atual);
                b.setAttribute("aria-current", atual ? "page" : "false");
            });
        }

        let sincronizando = false;
        function sincronizar() {
            if (sincronizando) return;
            sincronizando = true;
            try {
                const secao = (typeof secaoAtiva === "function" ? secaoAtiva() : "inicio");
                const mod = (typeof MODULO_DA_SECAO !== "undefined" && MODULO_DA_SECAO[secao]) || "inicio";
                const vis = MODULOS.filter(m => moduloVisivel(m.id)).map(m => m.id).join(",");
                if (vis !== visAnterior) {
                    visAnterior = vis;
                    construirEngrenagem(vis ? vis.split(",") : []);
                    construirHub(vis ? vis.split(",") : []);
                    if (mod === "inicio") ultimoMod = null;   // reconstruiu: anima de novo
                }
                if (gearGo) gearGo(mod);
                construirRodape(mod, secao);

                const naHome = mod === "inicio";
                document.body.classList.toggle("cop-home", naHome);
                atualizarCabLocal(mod, secao);
                if (naHome) {
                    hubAtualizarSaudacao();
                    if (ultimoMod !== "inicio") {
                        hubAnimarEntrada();
                        if (typeof preencherKpisHub === "function") preencherKpisHub();
                    }
                } else if (railChegando && !reduzMov) {
                    railEl.classList.remove("chegando"); void railEl.offsetWidth; railEl.classList.add("chegando");
                    setTimeout(() => railEl.classList.remove("chegando"), 800);
                }
                railChegando = false;
                ultimoMod = mod;
            } finally { sincronizando = false; }
        }

        const _mostrar = window.mostrarSecao;
        window.mostrarSecao = function (nome) { _mostrar(nome); sincronizar(); };

        window.sincronizarMenuRoda = sincronizar;
        sincronizar();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", pronto);
    else pronto();

})();
