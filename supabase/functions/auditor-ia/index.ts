// ==========================================================
// Edge Function: auditor-ia
// ==========================================================
// Avalia qualitativamente uma OS (coerência do diagnóstico com o
// histórico, tempo de atendimento razoável, sinais de atendimento
// malfeito) usando a API da Anthropic. A chave da API fica só aqui
// (variável de ambiente da function) — nunca chega no navegador.
//
// Segurança em duas camadas:
// 1. Verifica quem chamou (token do usuário logado) e confirma que
//    o papel dele em "perfis" é 'admin' — só admin pode rodar.
// 2. Só depois disso usa a service_role key (ignora RLS) pra buscar
//    os dados da OS e gravar o resultado — a checagem de permissão
//    já foi feita no passo 1, não depende mais da RLS daqui pra frente.
//
// Deploy: cole este arquivo em Supabase -> Edge Functions -> New
// function (nome "auditor-ia") -> Deploy. Depois, em Edge Functions
// -> Manage secrets, adicione ANTHROPIC_API_KEY com sua chave da
// Anthropic. SUPABASE_URL/SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY
// já vêm prontos automaticamente, não precisa configurar.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status: number) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
}

function resolverNome(linhas: { chave: string; dados: Record<string, unknown> }[] | null, chave: unknown) {
    if (chave === null || chave === undefined || chave === "") return null;

    const linha = linhas?.find(l => String(l.chave) === String(chave));
    if (!linha) return String(chave);

    // Aproximação: primeiro valor de texto da linha bruta (JSONB) — dá
    // contexto legível suficiente pra IA, não precisa ser exato como o
    // encontrarColuna do app (que resolve por nome de coluna configurável).
    const valores = Object.values(linha.dados ?? {});
    const textoEncontrado = valores.find(v => typeof v === "string");
    return (textoEncontrado as string | undefined) ?? String(chave);
}

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: CORS_HEADERS });
    }

    try {
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
            return jsonResponse({ error: "Não autenticado." }, 401);
        }

        const clienteChamador = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } },
        });

        const { data: userData, error: userError } = await clienteChamador.auth.getUser();
        if (userError || !userData?.user) {
            return jsonResponse({ error: "Sessão inválida." }, 401);
        }

        const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        const { data: perfil } = await admin
            .from("perfis")
            .select("papel")
            .eq("id", userData.user.id)
            .maybeSingle();

        if (perfil?.papel !== "admin") {
            return jsonResponse({ error: "Só administradores podem rodar o Auditor IA." }, 403);
        }

        const { ordemId } = await req.json();
        if (!ordemId) {
            return jsonResponse({ error: "ordemId é obrigatório." }, 400);
        }

        const { data: ordem, error: ordemError } = await admin
            .from("ordens")
            .select("*")
            .eq("id", String(ordemId))
            .maybeSingle();

        if (ordemError || !ordem) {
            return jsonResponse({ error: "OS não encontrada." }, 404);
        }

        const { data: movimentacoes } = await admin
            .from("movimentacoes")
            .select("*")
            .eq("ordem_id", String(ordemId))
            .order("data", { ascending: true });

        const [{ data: eventos }, { data: diagnosticos }, { data: operadores }] = await Promise.all([
            admin.from("ref_eventos").select("chave, dados"),
            admin.from("ref_diagnosticos").select("chave, dados"),
            admin.from("ref_operadores").select("chave, dados"),
        ]);

        const historicoTexto = (movimentacoes ?? []).map((m, i) => {
            const nomeEvento = resolverNome(eventos, m.evento);
            const nomeDiagnostico = resolverNome(diagnosticos, m.diagnostico);
            const nomeOperador = resolverNome(operadores, m.operador);
            const historico = Array.isArray(m.historico) ? m.historico.join(" / ") : (m.historico ?? "-");

            return `${i + 1}. [${m.data ?? "sem data"}] Evento: ${nomeEvento ?? "-"} | Operador: ${nomeOperador ?? "-"} | ` +
                `Status: ${m.status ?? "-"} | Diagnóstico: ${nomeDiagnostico ?? "-"} | ` +
                `Resposta padrão: ${m.resposta_padrao ?? "-"} | Mensagem: ${m.mensagem ?? "-"} | Histórico: ${historico}`;
        }).join("\n");

        const prompt = `Você está auditando o atendimento de uma Ordem de Serviço (OS) de um provedor de internet.

Assunto da OS: ${ordem.assunto ?? "não informado"}
Cidade/Bairro: ${ordem.cidade ?? "-"} / ${ordem.bairro ?? "-"}
Aberta em: ${ordem.data_abertura ?? "-"}
Fechada em: ${ordem.data_fechamento ?? "-"}
Status atual: ${ordem.status_atual ?? "-"}

Histórico de movimentações (ordem cronológica):
${historicoTexto || "(sem movimentações registradas)"}

Avalie:
1. O diagnóstico registrado é coerente com o histórico (mensagens, respostas padrão, eventos)?
2. O tempo entre abertura e fechamento parece razoável para esse tipo de assunto?
3. Existe algo no histórico que sugira atendimento malfeito, incompleto, ou diagnóstico genérico/errado?

Responda usando a ferramenta "avaliar_os" com sua conclusão.`;

        const respostaIA = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            body: JSON.stringify({
                model: "claude-sonnet-5",
                max_tokens: 500,
                messages: [{ role: "user", content: prompt }],
                tools: [{
                    name: "avaliar_os",
                    description: "Registra o veredito da auditoria dessa OS.",
                    input_schema: {
                        type: "object",
                        properties: {
                            veredito: { type: "string", enum: ["ok", "questionavel", "problematico"] },
                            justificativa: { type: "string", description: "Explicação curta (2-4 frases) do veredito." },
                        },
                        required: ["veredito", "justificativa"],
                    },
                }],
                tool_choice: { type: "tool", name: "avaliar_os" },
            }),
        });

        if (!respostaIA.ok) {
            const erroTexto = await respostaIA.text();
            console.error("Erro da API Anthropic:", erroTexto);
            return jsonResponse({ error: "Falha ao consultar a IA." }, 502);
        }

        const corpoIA = await respostaIA.json();
        const blocoFerramenta = corpoIA.content?.find((b: { type: string }) => b.type === "tool_use");

        if (!blocoFerramenta) {
            return jsonResponse({ error: "A IA não retornou um veredito estruturado." }, 502);
        }

        const avaliacao = {
            veredito: blocoFerramenta.input.veredito,
            justificativa: blocoFerramenta.input.justificativa,
            avaliadoEm: new Date().toISOString(),
        };

        const { error: erroUpdate } = await admin
            .from("ordens")
            .update({ auditoria_ia: avaliacao })
            .eq("id", String(ordemId));

        if (erroUpdate) {
            console.error("Erro ao salvar avaliação:", erroUpdate);
            return jsonResponse({ error: "Avaliação feita, mas falhou ao salvar." }, 500);
        }

        return jsonResponse({ ok: true, avaliacao }, 200);

    } catch (erro) {
        console.error("Erro inesperado no Auditor IA:", erro);
        return jsonResponse({ error: "Erro inesperado no Auditor IA." }, 500);
    }
});
