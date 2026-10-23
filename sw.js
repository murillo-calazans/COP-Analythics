/**
 * Service worker do app (PWA) — necessário pro "Instalar app" no celular.
 *
 * Estratégia: REDE PRIMEIRO pros arquivos do próprio site (HTML/JS/CSS/
 * imagens), guardando a última versão boa; sem internet, abre a cópia
 * guardada. Assim o app instalado sempre pega a versão nova quando há rede
 * (o site muda quase todo dia) e não fica preso numa versão velha.
 * Dados (Supabase), fontes e bibliotecas de outros domínios NÃO passam por
 * aqui — vão direto pra rede, como no navegador.
 */
const CACHE = "cop-analytics-v1";
const ESSENCIAIS = ["./", "./index.html", "./manifest.webmanifest", "./img/app/icone-192.png"];

self.addEventListener("install", evento => {
    evento.waitUntil(caches.open(CACHE).then(c => c.addAll(ESSENCIAIS)).catch(() => {}));
    self.skipWaiting();
});

self.addEventListener("activate", evento => {
    evento.waitUntil(
        caches.keys()
            .then(nomes => Promise.all(nomes.filter(n => n !== CACHE).map(n => caches.delete(n))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", evento => {
    const req = evento.request;
    if (req.method !== "GET") return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;   // Supabase, fontes, CDN: direto pra rede

    evento.respondWith(
        fetch(req)
            .then(resp => {
                if (resp && resp.ok && resp.type === "basic") {
                    const copia = resp.clone();
                    caches.open(CACHE).then(c => c.put(req, copia)).catch(() => {});
                }
                return resp;
            })
            .catch(() => caches.match(req, { ignoreSearch: true })
                .then(guardado => guardado || (req.mode === "navigate" ? caches.match("./index.html") : undefined)))
    );
});
