create table if not exists bot_config (
    id                  int primary key default 1 check (id = 1),
    grupo_cobranca_jid  text,
    hora_inicio         int  not null default 7,
    hora_fim            int  not null default 18,
    dias_semana         int[] not null default '{1,2,3,4,5,6}',
    intervalo_min       int  not null default 5
);
insert into bot_config (id) values (1) on conflict (id) do nothing;

create table if not exists bot_monitorados (
    numero  text primary key,
    rotulo  text not null,
    lid     text
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
