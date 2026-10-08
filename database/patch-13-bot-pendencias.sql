-- ==========================================================
-- Patch 13: Bot de Pendências (cobrança de menções no WhatsApp)
-- ==========================================================
-- O chip do bot fica nos grupos (via Evolution API). Toda mensagem
-- chega na Edge Function "bot-pendencias", que registra quando os
-- números de Auxiliares/Assistentes são marcados e quando respondem.
-- O pg_cron chama a mesma function a cada minuto pra cobrar no grupo
-- "Pendencias" o que passou de 5 min sem resposta (só no expediente).
--
-- Só a Edge Function (service_role) mexe nessas tabelas — RLS ligada
-- e sem policies = ninguém do app lê/escreve por engano.
--
-- Rode no SQL Editor do Supabase. O PASSO 2 (agendamento) fica no
-- fim do arquivo e só deve ser rodado depois do deploy da function.

-- ---------- PASSO 1: tabelas ----------

create table if not exists bot_config (
    id                  int primary key default 1 check (id = 1),
    grupo_cobranca_jid  text,                       -- preenchido pelo comando "!pendencias" no grupo
    hora_inicio         int  not null default 7,    -- expediente (horário de Brasília)
    hora_fim            int  not null default 18,
    dias_semana         int[] not null default '{1,2,3,4,5,6}', -- 0=dom ... 6=sáb
    intervalo_min       int  not null default 5
);
insert into bot_config (id) values (1) on conflict (id) do nothing;

create table if not exists bot_monitorados (
    numero  text primary key,   -- só dígitos, com 55 + DDD
    rotulo  text not null,      -- como aparece no alerta
    lid     text                -- id interno do WhatsApp (@lid), aprendido sozinho
);
insert into bot_monitorados (numero, rotulo) values
    ('5522981392343', 'AUXILIARES'),
    ('5522981376625', 'ASSISTENTES')
on conflict (numero) do nothing;

create table if not exists bot_grupos (
    jid           text primary key,
    nome          text,
    atualizado_em timestamptz not null default now()
);

create table if not exists bot_pendencias (
    id               bigint generated always as identity primary key,
    grupo_jid        text not null,
    mensagem_id      text not null,
    numero           text not null references bot_monitorados(numero),
    autor_nome       text,
    texto            text,
    mencionado_em    timestamptz not null,
    respondido_em    timestamptz,
    alertas_enviados int not null default 0,
    ultimo_alerta_em timestamptz,
    unique (grupo_jid, mensagem_id, numero)
);
create index if not exists bot_pendencias_abertas
    on bot_pendencias (grupo_jid, numero) where respondido_em is null;

alter table bot_config      enable row level security;
alter table bot_monitorados enable row level security;
alter table bot_grupos      enable row level security;
alter table bot_pendencias  enable row level security;


-- ---------- PASSO 2: agendamento (rodar DEPOIS do deploy) ----------
-- Troque TROQUE_PELO_TOKEN pelo mesmo valor do secret BOT_TOKEN.
--
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
--
-- select cron.schedule(
--     'bot-pendencias-verificar',
--     '* * * * *',
--     $$
--     select net.http_post(
--         url     := 'https://ldpiitymhvdhemdrntlx.supabase.co/functions/v1/bot-pendencias?acao=verificar&token=TROQUE_PELO_TOKEN',
--         headers := '{"Content-Type": "application/json"}'::jsonb,
--         body    := '{}'::jsonb
--     );
--     $$
-- );
--
-- Pra desligar: select cron.unschedule('bot-pendencias-verificar');
