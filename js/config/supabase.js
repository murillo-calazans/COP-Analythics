/**
 * ==========================================================
 * Configuração do Supabase
 * ==========================================================
 * URL do projeto e "anon key" pública — não são segredo. Quem
 * protege os dados é a Row Level Security (RLS) configurada no
 * banco (ver database/schema-supabase.sql), não o sigilo dessa
 * chave: ela é feita pra ficar embutida no código do navegador.
 * A chave secreta (service_role) NUNCA deve entrar aqui.
 */

// Projeto novo (migração 19/10/2026 — o antigo foi bloqueado por egress).
// "anon key" aqui = a publishable key nova (sb_publishable_…), equivalente
// pública da anon; o supabase-js aceita normalmente.
const SUPABASE_URL = "https://tdeyuiicayhcxsikzotj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_BV33dmVQ6axdL4Kb0_p-oA_Peqqrbpq";

// window.supabase vem do script CDN (@supabase/supabase-js, carregado
// no index.html antes deste arquivo) — createClient é a função de fábrica.
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
