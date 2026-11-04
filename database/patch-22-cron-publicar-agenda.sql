create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
    'publicar-agenda-diaria',
    '0 19 * * *',
    $$
    select net.http_post(
        url     := 'https://ldpiitymhvdhemdrntlx.supabase.co/functions/v1/publicas-agenda?token=TROQUE_PELO_TOKEN',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body    := '{}'::jsonb
    );
    $$
);
