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
    if (url.origin !== self.location.origin) return;

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
