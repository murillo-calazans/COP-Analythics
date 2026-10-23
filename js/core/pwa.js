/**
 * ==========================================================
 * App instalável (PWA) — botão "Instalar app"
 * ==========================================================
 * Registra o service worker (sw.js) e mostra o botão de baixar no
 * cabeçalho (#btnInstalarApp):
 * - Android / Chrome / Edge: o navegador avisa que dá pra instalar
 *   (beforeinstallprompt) e o botão abre a instalação de verdade;
 * - iPhone/iPad: a Apple não deixa o site instalar sozinho — o botão abre
 *   o passo a passo (Compartilhar → Adicionar à Tela de Início).
 * Já aberto como app (tela cheia), o botão some.
 */
(function () {
    const jaInstalado = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    const ehIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    let pedidoInstalacao = null;

    if ("serviceWorker" in navigator && location.protocol === "https:") {
        window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(e => console.warn("Service worker:", e)));
    }

    const botao = () => document.getElementById("btnInstalarApp");
    function mostrarBotao() {
        const b = botao();
        if (b && !jaInstalado()) b.hidden = false;
    }

    window.addEventListener("beforeinstallprompt", evento => {
        evento.preventDefault();
        pedidoInstalacao = evento;
        mostrarBotao();
    });
    window.addEventListener("appinstalled", () => {
        pedidoInstalacao = null;
        const b = botao();
        if (b) b.hidden = true;
    });

    function fecharAjuda() {
        document.querySelector(".pwa-ajuda-fundo")?.remove();
        if (!document.querySelector(".ixc-popup-fundo")) document.body.classList.remove("ixc-popup-aberto");
    }

    function abrirAjuda() {
        fecharAjuda();
        const passos = ehIOS
            ? `<ol class="pwa-passos">
                 <li>Abra este site no <b>Safari</b> (no Chrome do iPhone não aparece a opção).</li>
                 <li>Toque em <b>Compartilhar</b> <span aria-hidden="true">(o quadrado com a seta para cima, na barra de baixo)</span>.</li>
                 <li>Role e toque em <b>Adicionar à Tela de Início</b>.</li>
                 <li>Confirme em <b>Adicionar</b>. O ícone do COP aparece na tela do celular.</li>
               </ol>`
            : `<ol class="pwa-passos">
                 <li>No <b>Chrome</b>, toque nos <b>três pontinhos</b> (canto de cima).</li>
                 <li>Toque em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.</li>
                 <li>Confirme em <b>Instalar</b>. O ícone do COP aparece na tela do celular.</li>
               </ol>`;
        const fundo = document.createElement("div");
        fundo.className = "ixc-popup-fundo pwa-ajuda-fundo";
        fundo.innerHTML = `
          <div class="ixc-popup" role="dialog" aria-modal="true" aria-label="Instalar o app">
            <div class="ixc-popup-topo">
              <div><h2>Instalar o COP Analytics</h2><p>Vira um app na tela do celular, abre em tela cheia e entra com o mesmo login.</p></div>
              <button type="button" class="ixc-popup-fechar" aria-label="Fechar">✕</button>
            </div>
            <div class="ixc-popup-corpo">${passos}</div>
          </div>`;
        document.body.appendChild(fundo);
        document.body.classList.add("ixc-popup-aberto");
        fundo.addEventListener("click", e => { if (e.target === fundo) fecharAjuda(); });
        fundo.querySelector(".ixc-popup-fechar").addEventListener("click", fecharAjuda);
        fundo.querySelector(".ixc-popup-fechar").focus();
    }

    function ligarBotao() {
        const b = botao();
        if (!b) return;
        if (ehIOS && !jaInstalado()) b.hidden = false;   // no iPhone não há aviso automático: mostra direto
        b.addEventListener("click", async () => {
            if (pedidoInstalacao) {
                pedidoInstalacao.prompt();
                const escolha = await pedidoInstalacao.userChoice.catch(() => null);
                if (escolha?.outcome === "accepted") b.hidden = true;
                pedidoInstalacao = null;
            } else {
                abrirAjuda();
            }
        });
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ligarBotao);
    else ligarBotao();
})();
