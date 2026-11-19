// Publica o Worker "cop-dados" (fonte no repositório COP-Analytics\cloudflare\worker-dados.js) pela API do Cloudflare.
// Uso: node --env-file=.env cloudflare/publicar-worker.js
const fs = require("fs");
const FONTE = "C:/Users/muril/OneDrive - AMO TIC TECNOLOGIA DA INFORMACAO LTDA/02 - CONTROLE DE OPERAÇÕES/01 - GESTÃO/08 - Automação/COP-Analytics/cloudflare/worker-dados.js";
(async () => {
    const T = process.env.CLOUDFLARE_API_TOKEN.trim(), A = process.env.CLOUDFLARE_ACCOUNT_ID.trim(), H = { Authorization: "Bearer " + T };
    const base = `https://api.cloudflare.com/client/v4/accounts/${A}/workers/scripts/cop-dados`;
    const fd = new FormData();
    fd.append("metadata", new Blob([JSON.stringify({
        main_module: "worker.js", compatibility_date: "2026-10-01",
        bindings: [{ type: "r2_bucket", name: "DADOS", bucket_name: "cop-dados" }, { type: "plain_text", name: "SUPABASE_URL", text: process.env.SUPABASE_URL.trim().replace(/\/$/, "") }]
    })], { type: "application/json" }));
    fd.append("worker.js", new Blob([fs.readFileSync(FONTE, "utf8")], { type: "application/javascript+module" }), "worker.js");
    const r = await (await fetch(base, { method: "PUT", headers: H, body: fd })).json();
    console.log("publicar:", r.success, (r.errors || []).map(e => e.code + " " + e.message).join("; "));
    const s = await (await fetch(base + "/subdomain", { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({ enabled: true, previews_enabled: false }) })).json();
    console.log("workers.dev:", s.success, (s.errors || []).map(e => e.message).join("; "));
})();
