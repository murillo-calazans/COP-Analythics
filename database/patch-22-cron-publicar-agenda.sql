-- ==========================================================
-- Patch #22 — agendar a publicação automática da agenda
-- ==========================================================
-- Roda a Edge Function "publicar-agenda" todo dia às 19:00 UTC
-- (= 16:00 de Brasília), publicando a agenda do DIA SEGUINTE.
--
-- PRÉ-REQUISITO: a Edge Function "publicar-agenda" já deployada, com o
-- secret PUBLICAR_TOKEN definido (Edge Functions -> Manage secrets).
-- Troque TROQUE_PELO_TOKEN pelo MESMO valor do secret.
--
-- Rode no SQL Editor do Supabase:

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
    'publicar-agenda-diaria',
    '0 19 * * *',   -- 19:00 UTC = 16:00 Brasília, todo dia
    $$
    select net.http_post(
        url     := 'https://ldpiitymhvdhemdrntlx.supabase.co/functions/v1/publicar-agenda?token=TROQUE_PELO_TOKEN',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body    := '{}'::jsonb
    );
    $$
);

-- Conferir o agendamento:   select * from cron.job where jobname = 'publicar-agenda-diaria';
-- Desligar:                 select cron.unschedule('publicar-agenda-diaria');
-- Publicar na hora (teste):  select net.http_post(url := 'https://ldpiitymhvdhemdrntlx.supabase.co/functions/v1/publicar-agenda?token=TROQUE_PELO_TOKEN', headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb);
