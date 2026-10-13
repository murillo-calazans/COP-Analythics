// ==========================================================
// Edge Function: publicar-agenda
// ==========================================================
// Publica automaticamente a agenda do dia seguinte (Agendador IA) sem
// ninguém abrir o agendador.html. Roda na nuvem (não depende do PC).
//
// Como funciona: baixa o motor e o módulo de publicação DO PRÓPRIO SITE
// (GitHub Pages), então qualquer melhoria no agendador já vale aqui, e
// chama PublicarAgenda.publicarAgenda, que faz:
//   os_pendentes (o robô atualiza de hora em hora) + escala_tecnicos_dados
//   + mapa de regiões + histórico (ordens) -> Motor.planejar ->
//   AgendaPublicacao.montarAgenda -> grava em agenda_publicada.
// NUNCA sobrescreve uma agenda publicada à mão.
//
// Chamadas (protegidas por ?token=PUBLICAR_TOKEN):
//   - pg_cron, todo dia 19:00 UTC (= 16:00 Brasília) -> publica amanhã.
//   - teste manual: .../publicar-agenda?token=...&simular=1  (não grava)
//   - dia específico: ...&data=2026-10-15
//
// Deploy: Supabase -> Edge Functions -> New function ("publicar-agenda")
// -> cole este arquivo -> DESLIGUE "Verify JWT" -> Deploy.
// Secret (Manage secrets): PUBLICAR_TOKEN = uma senha longa qualquer
// (a mesma vai no cron). SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já vêm
// prontos no ambiente da função.

const BASE_SITE = "https://murillo-calazans.github.io/COP-Analythics";
const ARQUIVOS = [
    "js/agendador/motor.js",
    "js/agendador/escala-dia.js",
    "js/agendador/agenda-publicacao.js",
    "js/agendador/publicar-agenda.js",
];

const TOKEN = Deno.env.get("PUBLICAR_TOKEN") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Baixa os módulos do site e carrega num objeto só (eles são IIFEs no
// formato `(function(global){ ... global.X = api })(this)`; rodando o
// código com `this` = ctx, cada um pendura sua API em ctx).
async function carregarModulos() {
    const ctx: Record<string, unknown> = {};
    for (const arq of ARQUIVOS) {
        const url = `${BASE_SITE}/${arq}?t=${Date.now()}`;
        const resp = await fetch(url, { cache: "no-store" });
        if (!resp.ok) throw new Error(`não baixei ${arq}: ${resp.status}`);
        const code = await resp.text();
        new Function(code).call(ctx);
    }
    for (const nome of ["Motor", "EscalaDia", "AgendaPublicacao", "PublicarAgenda"]) {
        if (!ctx[nome]) throw new Error(`módulo ${nome} não carregou`);
    }
    return ctx as any;
}

Deno.serve(async (req) => {
    const u = new URL(req.url);
    if (!TOKEN || u.searchParams.get("token") !== TOKEN) {
        return new Response(JSON.stringify({ erro: "token inválido" }), { status: 401, headers: { "Content-Type": "application/json" } });
    }
    try {
        const ctx = await carregarModulos();
        const r = await ctx.PublicarAgenda.publicarAgenda({
            url: SUPABASE_URL,
            chave: SERVICE_KEY,
            data: u.searchParams.get("data") || undefined,      // AAAA-MM-DD; padrão = amanhã (Brasília)
            simular: u.searchParams.get("simular") === "1",
            mods: { Motor: ctx.Motor, EscalaDia: ctx.EscalaDia, AgendaPublicacao: ctx.AgendaPublicacao },
        });
        return new Response(JSON.stringify(r), { headers: { "Content-Type": "application/json" } });
    } catch (e) {
        return new Response(JSON.stringify({ erro: String(e?.message || e) }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
});
