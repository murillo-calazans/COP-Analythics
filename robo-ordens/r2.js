// Envio de arquivos para o Cloudflare R2 (bucket cop-dados) pela API do Cloudflare.
// O site lê pelo Worker cop-dados (só com login). Chave em .env: CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID.
const BUCKET = "cop-dados";

async function enviar(chave, corpo, tipo = "application/json; charset=utf-8") {
    const T = (process.env.CLOUDFLARE_API_TOKEN || "").trim(), A = (process.env.CLOUDFLARE_ACCOUNT_ID || "").trim();
    if (!T || !A) throw new Error("R2: falta CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID no .env");
    const url = `https://api.cloudflare.com/client/v4/accounts/${A}/r2/buckets/${BUCKET}/objects/${chave.split("/").map(encodeURIComponent).join("/")}`;
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 120000);
    try {
        const r = await fetch(url, { method: "PUT", headers: { Authorization: "Bearer " + T, "Content-Type": tipo }, body: corpo, signal: ctrl.signal });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j.success === false) throw new Error(`R2 ${r.status}: ${(j.errors || []).map(e => e.message).join("; ")}`);
        return j.result || {};
    } finally { clearTimeout(t); }
}

module.exports = { enviar, BUCKET };
