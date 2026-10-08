/**
 * ==========================================================
 * Menu Lateral (hambúrguer) — navegação entre os módulos do COP
 * ==========================================================
 * Componente autocontido (HTML + CSS injetados daqui) pra ser o
 * mesmo em todas as páginas: index.html, agendador.html e
 * escala.html. Cada página só precisa:
 *   1. marcar onde o botão entra com [data-menu-lateral-host]
 *      (o botão vai como primeiro filho, antes da logo);
 *   2. dizer qual módulo está ativo em <body data-modulo="...">.
 *
 * Os módulos que vivem no index.html são abertos por âncora
 * (index.html#auditoria). Quando já estamos no index, o clique não
 * recarrega a página: chama mostrarSecao() (js/ui/navegacao.js).
 *
 * As cores são fixas (navy), como o cabeçalho do index — é a cor
 * de marca e não muda com o tema claro/escuro.
 */

(function () {

    const ICONES = {
        ordens: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
        terceiras: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
        auditoria: '<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 14 2 2 4-4"/>',
        agendador: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="m9 16 2 2 4-4"/>',
        escala: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h3M13 14h3M8 18h3"/>',
        alertas: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
        admin: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>'
    };

    // secao: seção do index.html aberta pelo módulo (sem secao = outra página).
    const MODULOS = [
        { id: "ordens",    titulo: "Gestão de Ordens",        href: "index.html#dashboard",     secao: "dashboard" },
        { id: "terceiras", titulo: "Gestão de Terceiras",     href: "index.html#terceiras",     secao: "terceiras" },
        { id: "auditoria", titulo: "Auditoria",               href: "index.html#auditoria",     secao: "auditoria" },
        { id: "agendador", titulo: "Agendador IA",            href: "agendador.html" },
        { id: "escala",    titulo: "Escala",                  href: "escala.html" },
        { id: "alertas",   titulo: "Alertas",                 href: "index.html#alertas",       secao: "alertas" },
        { id: "admin",     titulo: "Painel de Administrador", href: "index.html#configuracoes", secao: "configuracoes" }
    ];

    const CSS = `
.menu-hamburguer{
    display:inline-flex; align-items:center; justify-content:center; flex-shrink:0;
    width:40px; height:40px; padding:0; margin:0;
    background:transparent; color:#CBD5E1; border:1px solid transparent; border-radius:10px;
    cursor:pointer; transition:background .2s, color .2s;
}
.menu-hamburguer:hover{ background:#1E293B; color:#fff; }
.menu-hamburguer:focus-visible{ outline:2px solid #60A5FA; outline-offset:2px; }
.menu-hamburguer svg{ width:22px; height:22px; }
.menu-hamburguer.claro{ color:#fff; background:rgba(255,255,255,.12); }
.menu-hamburguer.claro:hover{ background:rgba(255,255,255,.22); }

.menu-lateral-fundo{
    position:fixed; inset:0; z-index:9998;
    background:rgba(2,6,23,.5); opacity:0; pointer-events:none; transition:opacity .2s;
}
.menu-lateral{
    position:fixed; top:0; left:0; bottom:0; z-index:9999;
    width:300px; max-width:86vw;
    display:flex; flex-direction:column;
    background:#0F172A; color:#E2E8F0; border-right:1px solid #1E293B;
    box-shadow:8px 0 32px rgba(0,0,0,.35);
    transform:translateX(-100%); transition:transform .22s ease;
    font-family:inherit;
}
body.menu-lateral-aberto .menu-lateral{ transform:none; }
body.menu-lateral-aberto .menu-lateral-fundo{ opacity:1; pointer-events:auto; }

.menu-lateral-topo{
    display:flex; align-items:center; gap:12px;
    padding:16px 16px 14px; border-bottom:1px solid #1E293B;
}
.menu-lateral-topo img{ width:34px; height:34px; object-fit:contain; }
.menu-lateral-topo strong{ display:block; font-size:16px; color:#fff; line-height:1.2; }
.menu-lateral-topo span{ font-size:12px; color:#94A3B8; }
.menu-lateral-fechar{
    margin-left:auto; width:34px; height:34px; border:none; border-radius:8px;
    background:transparent; color:#94A3B8; font-size:22px; line-height:1; cursor:pointer;
}
.menu-lateral-fechar:hover{ background:#1E293B; color:#fff; }

.menu-lateral nav{ flex:1; overflow-y:auto; padding:12px 10px; display:flex; flex-direction:column; gap:2px; }
.menu-lateral nav a{
    display:flex; align-items:center; gap:12px;
    padding:11px 12px; border-radius:10px;
    color:#CBD5E1; text-decoration:none; font-size:14px; font-weight:500;
    transition:background .15s, color .15s;
}
.menu-lateral nav a:hover{ background:#1E293B; color:#fff; }
.menu-lateral nav a.ativo{ background:#2563EB; color:#fff; }
.menu-lateral nav a svg{ width:19px; height:19px; flex-shrink:0; }
.menu-lateral nav .separador{ height:1px; background:#1E293B; margin:8px 4px; }

.menu-lateral-badge{
    margin-left:auto; min-width:20px; padding:1px 7px; border-radius:999px;
    background:#DC2626; color:#fff; font-size:11px; font-weight:600; text-align:center;
}
.menu-lateral-badge[hidden]{ display:none; }
.menu-hamburguer{ position:relative; }
.menu-hamburguer.com-aviso::after{
    content:""; position:absolute; top:7px; right:7px; width:8px; height:8px;
    border-radius:50%; background:#DC2626; box-shadow:0 0 0 2px #0F172A;
}

.menu-lateral-rodape{ padding:12px 16px; border-top:1px solid #1E293B; font-size:11px; color:#64748B; }
`;

    function svg(caminhos) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${caminhos}</svg>`;
    }

    function estaNoIndex() {
        return typeof mostrarSecao === "function";
    }

    function abrir() {
        atualizarVisibilidadeAdmin();
        document.body.classList.add("menu-lateral-aberto");
        document.querySelector(".menu-hamburguer")?.setAttribute("aria-expanded", "true");
        document.querySelector(".menu-lateral nav a.ativo, .menu-lateral nav a")?.focus();
    }

    function fechar() {
        document.body.classList.remove("menu-lateral-aberto");
        document.querySelector(".menu-hamburguer")?.setAttribute("aria-expanded", "false");
    }

    // Painel de Administrador só pra admin. Fora do index (onde ehAdmin()
    // não existe) o item fica visível — o próprio index barra quem não pode.
    function atualizarVisibilidadeAdmin() {
        const item = document.querySelector('.menu-lateral nav a[data-modulo="admin"]');
        if (!item) return;
        item.hidden = typeof ehAdmin === "function" && !ehAdmin();
    }

    function marcarModuloAtivo(id) {
        document.body.dataset.modulo = id;
        document.querySelectorAll(".menu-lateral nav a").forEach(a => {
            const ativo = a.dataset.modulo === id;
            a.classList.toggle("ativo", ativo);
            if (ativo) a.setAttribute("aria-current", "page");
            else a.removeAttribute("aria-current");
        });
    }

    function montar() {
        const host = document.querySelector("[data-menu-lateral-host]");
        if (!host || document.querySelector(".menu-lateral")) return;

        const estilo = document.createElement("style");
        estilo.textContent = CSS;
        document.head.appendChild(estilo);

        const botao = document.createElement("button");
        botao.type = "button";
        botao.className = "menu-hamburguer" + (host.dataset.menuLateralHost === "claro" ? " claro" : "");
        botao.title = "Menu";
        botao.setAttribute("aria-label", "Abrir menu");
        botao.setAttribute("aria-controls", "menuLateral");
        botao.setAttribute("aria-expanded", "false");
        botao.innerHTML = svg('<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>');
        host.prepend(botao);

        const itens = MODULOS.map(m =>
            (m.id === "admin" ? '<div class="separador" role="presentation"></div>' : "") +
            `<a href="${m.href}" data-modulo="${m.id}"${m.secao ? ` data-secao-modulo="${m.secao}"` : ""}>${svg(ICONES[m.id])}<span>${m.titulo}</span><span class="menu-lateral-badge" hidden></span></a>`
        ).join("");

        const fundo = document.createElement("div");
        fundo.className = "menu-lateral-fundo";

        const painel = document.createElement("aside");
        painel.id = "menuLateral";
        painel.className = "menu-lateral";
        painel.setAttribute("aria-label", "Módulos do COP");
        painel.innerHTML = `
            <div class="menu-lateral-topo">
                <img src="img/logo.png" alt="" onerror="this.remove()">
                <div><strong>COP Analytics</strong><span>Centro de Operações</span></div>
                <button type="button" class="menu-lateral-fechar" aria-label="Fechar menu">×</button>
            </div>
            <nav>${itens}</nav>
            <div class="menu-lateral-rodape">AMO · Controle de Operações</div>`;

        document.body.append(fundo, painel);

        botao.addEventListener("click", abrir);
        fundo.addEventListener("click", fechar);
        painel.querySelector(".menu-lateral-fechar").addEventListener("click", fechar);
        document.addEventListener("keydown", e => {
            if (e.key === "Escape" && document.body.classList.contains("menu-lateral-aberto")) fechar();
        });

        // No index, módulos do próprio index trocam de seção sem recarregar.
        painel.querySelectorAll("a[data-secao-modulo]").forEach(a => {
            a.addEventListener("click", e => {
                if (!estaNoIndex() || e.ctrlKey || e.metaKey || e.shiftKey) return;
                e.preventDefault();
                mostrarSecao(a.dataset.secaoModulo);
                fechar();
            });
        });

        marcarModuloAtivo(document.body.dataset.modulo || "");
        atualizarVisibilidadeAdmin();
    }

    // Contador ao lado do item (ex.: alertas ativos) + ponto no hambúrguer.
    function definirBadge(id, total) {
        const badge = document.querySelector(`.menu-lateral nav a[data-modulo="${id}"] .menu-lateral-badge`);
        if (!badge) return;
        badge.textContent = total;
        badge.hidden = !total;
        const algum = [...document.querySelectorAll(".menu-lateral-badge")].some(b => !b.hidden);
        document.querySelector(".menu-hamburguer")?.classList.toggle("com-aviso", algum);
    }

    window.marcarModuloAtivoMenuLateral = marcarModuloAtivo;
    window.definirBadgeMenuLateral = definirBadge;
    window.atualizarMenuLateralAdmin = atualizarVisibilidadeAdmin;

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", montar);
    else montar();

})();
