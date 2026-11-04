create table if not exists clientes_offline (
    login text primary key,
    cliente text,
    bairro text,
    olt text,
    cto text,
    interface_pon text,
    sinal_rx numeric,
    causa text,
    status_acesso text,
    ultima_conexao text,
    latitude numeric,
    longitude numeric,
    sincronizado_em timestamptz not null default now()
);

create index if not exists clientes_offline_olt on clientes_offline (olt);
create index if not exists clientes_offline_cto on clientes_offline (cto);
create index if not exists clientes_offline_causa on clientes_offline (causa);

alter table clientes_offline enable row level security;

drop policy if exists "leitura autenticada" on clientes_offline;
create policy "leitura autenticada" on clientes_offline for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
