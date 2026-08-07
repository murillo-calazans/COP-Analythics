-- ==========================================================
-- Patch #2 — coluna pro resultado do Auditor IA
-- ==========================================================
-- Rode no SQL Editor do Supabase. Guarda o veredito estruturado
-- (veredito/justificativa/avaliadoEm) que a Edge Function
-- "auditor-ia" grava depois de avaliar uma OS. Null = OS ainda
-- não avaliada.
--
-- Não precisa de política de RLS nova: a Edge Function usa a
-- service_role key (que ignora RLS) pra gravar, depois de ela
-- mesma checar que quem chamou é admin. A LEITURA desse campo já
-- está coberta pela política "leitura autenticada" que já existe
-- na tabela ordens (qualquer usuário com papel em "perfis").

alter table ordens add column if not exists auditoria_ia jsonb;
