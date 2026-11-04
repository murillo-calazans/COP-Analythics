create table if not exists clientes_cto (
    chave text primary key,
    cliente text,
    login text,
    cto text,
    porta text,
    lacre text,
    completo boolean generated always as (cto is not null and porta is not null) stored,
    sincronizado_em timestamptz not null default now()
);

create index if not exists clientes_cto_completo on clientes_cto (completo);

alter table clientes_cto enable row level security;

drop policy if exists "leitura autenticada" on clientes_cto;
create policy "leitura autenticada" on clientes_cto for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
