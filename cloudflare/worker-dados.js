// Worker "cop-dados" (Cloudflare) — entrega os arquivos que o robô grava no R2 (bucket cop-dados)
// só para quem está logado no COP Analytics.
//
//   GET /dados/<caminho>   Authorization: Bearer <access_token do Supabase>
//
// - O login é conferido AQUI, sem chamar o Supabase: o token do Supabase é assinado (ES256) e a
//   chave pública vem do JWKS do projeto (guardada em memória por 1 h).
// - ETag + If-None-Match: arquivo igual ao que o navegador já tem = 304 (nada é baixado).
// - A saída do R2 é grátis; o Cloudflare compacta (gzip/brotli) a resposta sozinho.
// Bindings (definidos na publicação): DADOS = bucket R2 cop-dados; SUPABASE_URL = texto.

let jwks = null, jwksEm = 0;

const b64url = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), c => c.charCodeAt(0));
const json = (obj, status = 200, extra = {}) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...CORS, ...extra } });
const CORS = {
    "Access-Control-Allow-Origin": "*",               // o acesso é pelo token (não por cookie)
    "Access-Control-Allow-Headers": "Authorization, If-None-Match",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Expose-Headers": "ETag, Last-Modified",
    "Access-Control-Max-Age": "86400"
};

async function chaves(env) {
    if (!jwks || Date.now() - jwksEm > 3600000) {
        const r = await fetch(env.SUPABASE_URL + "/auth/v1/.well-known/jwks.json");
        if (!r.ok) throw new Error("jwks " + r.status);
        jwks = (await r.json()).keys || []; jwksEm = Date.now();
    }
    return jwks;
}

async function loginValido(token, env) {
    const partes = String(token || "").split(".");
    if (partes.length !== 3) return null;
    const cab = JSON.parse(new TextDecoder().decode(b64url(partes[0])));
    const dados = JSON.parse(new TextDecoder().decode(b64url(partes[1])));
    if (cab.alg !== "ES256") return null;
    let jwk = (await chaves(env)).find(k => k.kid === cab.kid);
    if (!jwk) { jwksEm = 0; jwk = (await chaves(env)).find(k => k.kid === cab.kid); } // chave trocada
    if (!jwk) return null;
    const chave = await crypto.subtle.importKey("jwk", { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, ext: true }, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, chave, b64url(partes[2]), new TextEncoder().encode(partes[0] + "." + partes[1]));
    if (!ok) return null;
    const agora = Math.floor(Date.now() / 1000);
    if (!dados.exp || dados.exp < agora) return null;
    if (dados.iss !== env.SUPABASE_URL + "/auth/v1") return null;
    if (dados.role !== "authenticated") return null;
    return dados;
}

export default {
    async fetch(req, env) {
        if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
        if (req.method !== "GET") return json({ erro: "método não permitido" }, 405);
        const url = new URL(req.url);
        if (url.pathname === "/" || url.pathname === "/saude") return json({ ok: true, servico: "cop-dados" });
        if (!url.pathname.startsWith("/dados/")) return json({ erro: "não encontrado" }, 404);

        const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
        let usuario = null;
        try { usuario = await loginValido(token, env); } catch (e) { return json({ erro: "falha ao conferir o login" }, 503); }
        if (!usuario) return json({ erro: "login necessário" }, 401);

        const chave = decodeURIComponent(url.pathname.slice("/dados/".length));
        if (!chave || chave.includes("..")) return json({ erro: "caminho inválido" }, 400);
        const obj = await env.DADOS.get(chave, { onlyIf: req.headers });
        if (!obj) return json({ erro: "arquivo não existe" }, 404);
        const h = new Headers(CORS);
        obj.writeHttpMetadata(h);
        h.set("ETag", obj.httpEtag);
        h.set("Cache-Control", "private, no-cache");   // sempre pergunta; igual = 304
        if (!("body" in obj) || !obj.body) return new Response(null, { status: 304, headers: h });
        if (!h.get("Content-Type")) h.set("Content-Type", "application/json; charset=utf-8");
        return new Response(obj.body, { status: 200, headers: h });
    }
};
