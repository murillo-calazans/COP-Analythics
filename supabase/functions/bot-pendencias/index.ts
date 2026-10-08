// ==========================================================
// Edge Function: bot-pendencias
// ==========================================================
// Cobra no grupo "Pendencias" quando os números de Auxiliares ou
// Assistentes são marcados (@) num grupo e não respondem.
//
// Duas entradas, ambas protegidas por ?token=BOT_TOKEN:
// - Webhook da Evolution API (POST com evento messages.upsert):
//   registra menções e marca como respondido quando o número fala
//   no grupo. O comando "!pendencias" num grupo define ele como o
//   grupo de cobrança.
// - ?acao=verificar (chamado pelo pg_cron a cada minuto): manda um
//   alerta consolidado com tudo que está sem resposta há mais de
//   intervalo_min, repetindo a cada intervalo_min, só no expediente.
//   Menção fora do expediente começa a contar na abertura (7h).
//
// Deploy: Supabase -> Edge Functions -> New function (nome
// "bot-pendencias") -> cole este arquivo -> DESLIGUE "Verify JWT"
// (a Evolution não manda token do Supabase) -> Deploy.
// Secrets (Edge Functions -> Manage secrets):
//   BOT_TOKEN      senha qualquer, longa (a mesma vai no webhook e no cron)
//   EVO_URL        ex.: https://evo.seudominio.com.br (sem / no fim)
//   EVO_APIKEY     AUTHENTICATION_API_KEY da Evolution
//   EVO_INSTANCIA  nome da instância criada na Evolution (ex.: bot-pendencias)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("BOT_TOKEN") ?? "";
const EVO_URL = (Deno.env.get("EVO_URL") ?? "").replace(/\/+$/, "");
const EVO_APIKEY = Deno.env.get("EVO_APIKEY") ?? "";
const EVO_INSTANCIA = Deno.env.get("EVO_INSTANCIA") ?? "";

const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

// Brasil sem horário de verão desde 2019 — offset fixo basta.
const OFFSET_BRASILIA_MS = -3 * 60 * 60 * 1000;
const MINUTO_MS = 60 * 1000;

type Config = {
    grupo_cobranca_jid: string | null;
    hora_inicio: number;
    hora_fim: number;
    dias_semana: number[];
    intervalo_min: number;
};
type Monitorado = { numero: string; rotulo: string; lid: string | null };

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

// ---------- números / jids ----------

// "5522981392343:12@s.whatsapp.net" -> "5522981392343"
function digitosDoJid(jid: unknown): string {
    if (typeof jid !== "string") return "";
    return jid.split("@")[0].split(":")[0].replace(/\D/g, "");
}

// WhatsApp às vezes guarda celular BR sem o 9 (55 22 8139-2343).
// Normaliza os dois formatos pra mesma chave de 12 dígitos.
function chaveNumero(numero: string): string {
    const d = numero.replace(/\D/g, "");
    if (d.length === 13 && d.startsWith("55") && d[4] === "9") return d.slice(0, 4) + d.slice(5);
    return d;
}

function acharMonitorado(jid: unknown, monitorados: Monitorado[]): Monitorado | undefined {
    if (typeof jid !== "string" || !jid) return undefined;
    const d = digitosDoJid(jid);
    if (!d) return undefined;
    if (jid.endsWith("@lid")) return monitorados.find(m => m.lid === d);
    return monitorados.find(m => chaveNumero(m.numero) === chaveNumero(d));
}

async function aprenderLid(m: Monitorado, lid: string) {
    if (!lid || m.lid === lid) return;
    m.lid = lid;
    await supabase.from("bot_monitorados").update({ lid }).eq("numero", m.numero);
}

// ---------- expediente ----------

function paraBrasilia(d: Date) { return new Date(d.getTime() + OFFSET_BRASILIA_MS); }
function deBrasilia(d: Date) { return new Date(d.getTime() - OFFSET_BRASILIA_MS); }

function noExpediente(d: Date, cfg: Config): boolean {
    const l = paraBrasilia(d);
    const h = l.getUTCHours();
    return cfg.dias_semana.includes(l.getUTCDay()) && h >= cfg.hora_inicio && h < cfg.hora_fim;
}

// Primeiro instante >= d que está dentro do expediente.
function inicioUtil(d: Date, cfg: Config): Date {
    if (noExpediente(d, cfg)) return d;
    const l = paraBrasilia(d);
    for (let i = 0; i < 8; i++) {
        const dia = new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate() + i, cfg.hora_inicio));
        const candidato = deBrasilia(dia);
        if (candidato >= d && cfg.dias_semana.includes(dia.getUTCDay())) return candidato;
    }
    return d;
}

function horaBrasilia(d: Date): string {
    const l = paraBrasilia(d);
    const hm = `${String(l.getUTCHours()).padStart(2, "0")}:${String(l.getUTCMinutes()).padStart(2, "0")}`;
    const hoje = paraBrasilia(new Date());
    if (l.getUTCDate() === hoje.getUTCDate() && l.getUTCMonth() === hoje.getUTCMonth()) return hm;
    return `${String(l.getUTCDate()).padStart(2, "0")}/${String(l.getUTCMonth() + 1).padStart(2, "0")} ${hm}`;
}

// ---------- Evolution API ----------

async function enviarTexto(jid: string, texto: string) {
    const resp = await fetch(`${EVO_URL}/message/sendText/${EVO_INSTANCIA}`, {
        method: "POST",
        headers: { "content-type": "application/json", apikey: EVO_APIKEY },
        body: JSON.stringify({ number: jid, text: texto }),
    });
    if (!resp.ok) console.error("Falha ao enviar mensagem", resp.status, await resp.text());
}

// Busca o nome do grupo (cache em bot_grupos) e aproveita a lista de
// participantes pra aprender o @lid dos números monitorados.
async function nomeDoGrupo(jid: string, monitorados: Monitorado[]): Promise<string> {
    const { data: cache } = await supabase.from("bot_grupos").select("nome").eq("jid", jid).maybeSingle();
    if (cache?.nome) return cache.nome;

    let nome = jid;
    try {
        const resp = await fetch(
            `${EVO_URL}/group/findGroupInfos/${EVO_INSTANCIA}?groupJid=${encodeURIComponent(jid)}`,
            { headers: { apikey: EVO_APIKEY } },
        );
        if (resp.ok) {
            const info = await resp.json();
            nome = info?.subject || jid;
            for (const p of info?.participants ?? []) {
                const ids = [p.id, p.jid, p.lid, p.phoneNumber].filter((x: unknown) => typeof x === "string");
                const lid = ids.find((x: string) => x.endsWith("@lid"));
                const pn = ids.find((x: string) => x.endsWith("@s.whatsapp.net"));
                const m = acharMonitorado(pn, monitorados);
                if (m && lid) await aprenderLid(m, digitosDoJid(lid));
            }
        }
    } catch (e) {
        console.error("Falha ao buscar grupo", jid, e);
    }
    await supabase.from("bot_grupos").upsert({ jid, nome, atualizado_em: new Date().toISOString() });
    return nome;
}

// ---------- webhook ----------

function extrairTexto(msg: Record<string, any>): string {
    return msg?.conversation
        ?? msg?.extendedTextMessage?.text
        ?? msg?.imageMessage?.caption
        ?? msg?.videoMessage?.caption
        ?? msg?.documentMessage?.caption
        ?? "";
}

function extrairMencoes(data: Record<string, any>): string[] {
    const msg = data.message ?? {};
    const lista: string[] = [...(data.contextInfo?.mentionedJid ?? [])];
    for (const parte of Object.values(msg)) {
        const ctx = (parte as any)?.contextInfo;
        if (Array.isArray(ctx?.mentionedJid)) lista.push(...ctx.mentionedJid);
    }
    return lista;
}

async function tratarMensagem(data: Record<string, any>) {
    const key = data.key ?? {};
    const grupo: string = key.remoteJid ?? "";
    if (!grupo.endsWith("@g.us") || key.fromMe) return;

    const texto = extrairTexto(data.message ?? {}).trim();
    const quando = new Date((Number(data.messageTimestamp) || Date.now() / 1000) * 1000);

    if (texto.toLowerCase() === "!pendencias") {
        await supabase.from("bot_config").update({ grupo_cobranca_jid: grupo }).eq("id", 1);
        await enviarTexto(grupo, "✅ Este grupo agora recebe as cobranças de pendências.");
        return;
    }

    const { data: cfg } = await supabase.from("bot_config").select("*").eq("id", 1).single();
    if (grupo === cfg?.grupo_cobranca_jid) return;

    const { data: mons } = await supabase.from("bot_monitorados").select("*");
    const monitorados = (mons ?? []) as Monitorado[];

    // Quem mandou? Em grupos novos o participant pode vir como @lid,
    // com o número real em participantAlt/participantPn/senderPn.
    const idsAutor = [key.participant, key.participantAlt, key.participantPn, key.senderPn, data.participant]
        .filter((x: unknown) => typeof x === "string") as string[];
    const autor = idsAutor.map(j => acharMonitorado(j, monitorados)).find(Boolean);

    if (autor) {
        const lid = idsAutor.find(j => j.endsWith("@lid"));
        if (lid) await aprenderLid(autor, digitosDoJid(lid));
        await marcarRespondido(grupo, autor, quando, cfg as Config, monitorados);
        return;
    }

    // Quem foi marcado?
    const marcados = new Map<string, Monitorado>();
    for (const jid of extrairMencoes(data)) {
        const m = acharMonitorado(jid, monitorados);
        if (m) marcados.set(m.numero, m);
    }
    // Reserva: o texto da menção vem como "@5522981392343" ou "@<lid>".
    for (const m of monitorados) {
        const alvos = [m.numero, chaveNumero(m.numero), m.lid].filter(Boolean) as string[];
        if (alvos.some(a => texto.includes("@" + a))) marcados.set(m.numero, m);
    }
    if (marcados.size === 0) return;

    await nomeDoGrupo(grupo, monitorados);
    const linhas = [...marcados.values()].map(m => ({
        grupo_jid: grupo,
        mensagem_id: key.id ?? crypto.randomUUID(),
        numero: m.numero,
        autor_nome: data.pushName ?? null,
        texto: texto.slice(0, 500),
        mencionado_em: quando.toISOString(),
    }));
    await supabase.from("bot_pendencias")
        .upsert(linhas, { onConflict: "grupo_jid,mensagem_id,numero", ignoreDuplicates: true });
}

async function marcarRespondido(grupo: string, m: Monitorado, quando: Date, cfg: Config, monitorados: Monitorado[]) {
    const { data: abertas } = await supabase.from("bot_pendencias")
        .update({ respondido_em: quando.toISOString() })
        .eq("grupo_jid", grupo).eq("numero", m.numero).is("respondido_em", null)
        .lte("mencionado_em", quando.toISOString())
        .select("*");

    const cobradas = (abertas ?? []).filter(p => p.alertas_enviados > 0);
    if (cobradas.length === 0 || !cfg?.grupo_cobranca_jid) return;

    const nome = await nomeDoGrupo(grupo, monitorados);
    const primeira = cobradas.reduce((a, b) => (a.mencionado_em < b.mencionado_em ? a : b));
    const base = inicioUtil(new Date(primeira.mencionado_em), cfg);
    const min = Math.max(0, Math.round((quando.getTime() - base.getTime()) / MINUTO_MS));
    const qtd = cobradas.length > 1 ? ` (${cobradas.length} pendências)` : "";
    await enviarTexto(cfg.grupo_cobranca_jid,
        `✅ *${m.rotulo}* respondido em *${nome}* após ${min} min${qtd}`);
}

// ---------- verificação periódica ----------

async function verificar() {
    const { data: cfg } = await supabase.from("bot_config").select("*").eq("id", 1).single();
    const config = cfg as Config;
    const agora = new Date();
    if (!config?.grupo_cobranca_jid) return { ok: true, motivo: "grupo de cobrança não definido" };
    if (!noExpediente(agora, config)) return { ok: true, motivo: "fora do expediente" };

    const { data: abertas } = await supabase.from("bot_pendencias")
        .select("*").is("respondido_em", null).order("mencionado_em");
    const { data: mons } = await supabase.from("bot_monitorados").select("*");
    const monitorados = (mons ?? []) as Monitorado[];
    const intervalo = config.intervalo_min * MINUTO_MS;

    const vencidas = (abertas ?? []).filter(p => {
        const proxima = p.ultimo_alerta_em
            ? new Date(p.ultimo_alerta_em).getTime() + intervalo
            : inicioUtil(new Date(p.mencionado_em), config).getTime() + intervalo;
        // 20s de folga pro cron de 1 em 1 min não pular um ciclo
        return agora.getTime() >= proxima - 20 * 1000;
    });
    if (vencidas.length === 0) return { ok: true, alertas: 0 };

    const blocos: string[] = [];
    for (const p of vencidas) {
        const m = monitorados.find(x => x.numero === p.numero);
        const nome = await nomeDoGrupo(p.grupo_jid, monitorados);
        const base = inicioUtil(new Date(p.mencionado_em), config);
        const min = Math.round((agora.getTime() - base.getTime()) / MINUTO_MS);
        const cobranca = p.alertas_enviados + 1;
        blocos.push(
            `⚠️ *${m?.rotulo ?? p.numero}* sem resposta há *${min} min*` +
            (cobranca > 1 ? ` (${cobranca}ª cobrança)` : "") +
            `\n👥 ${nome}` +
            `\n🙋 ${p.autor_nome ?? "?"} às ${horaBrasilia(new Date(p.mencionado_em))}` +
            (p.texto ? `\n💬 "${p.texto.length > 200 ? p.texto.slice(0, 200) + "…" : p.texto}"` : ""),
        );
    }

    await enviarTexto(config.grupo_cobranca_jid, blocos.join("\n\n"));

    for (const p of vencidas) {
        await supabase.from("bot_pendencias")
            .update({ alertas_enviados: p.alertas_enviados + 1, ultimo_alerta_em: agora.toISOString() })
            .eq("id", p.id);
    }
    return { ok: true, alertas: vencidas.length };
}

// ---------- entrada ----------

Deno.serve(async (req: Request) => {
    const url = new URL(req.url);
    if (!BOT_TOKEN || url.searchParams.get("token") !== BOT_TOKEN) return json({ erro: "não autorizado" }, 401);

    try {
        if (url.searchParams.get("acao") === "verificar") return json(await verificar());

        const corpo = await req.json().catch(() => ({}));
        const evento = String(corpo?.event ?? "").toLowerCase().replace("_", ".");
        if (evento !== "messages.upsert") return json({ ok: true, ignorado: evento });

        const lista = Array.isArray(corpo.data) ? corpo.data : [corpo.data];
        for (const data of lista) if (data) await tratarMensagem(data);
        return json({ ok: true });
    } catch (e) {
        console.error(e);
        return json({ erro: String(e) }, 500);
    }
});
