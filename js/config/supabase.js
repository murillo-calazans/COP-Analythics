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

const SUPABASE_URL = "https://ldpiitymhvdhemdrntlx.supabase.co";
const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkcGlpdHltaHZkaGVtZHJudGx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2NDY3ODUsImV4cCI6MjEwMjIyMjc4NX0.M0_0vZicw_y-WOqJuDHL5NodyRS11JgxmEA3TGDGB9I";

// window.supabase vem do script CDN (@supabase/supabase-js, carregado
// no index.html antes deste arquivo) — createClient é a função de fábrica.
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
