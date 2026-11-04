create table if not exists ctos (
    descricao text primary key,
    lat double precision,
    lng double precision,
    endereco text,
    projeto text,
    splitter text,
    logins_ativos integer not null default 0,
    sincronizado_em timestamptz not null default now()
);

alter table ctos enable row level security;

drop policy if exists "leitura autenticada" on ctos;
create policy "leitura autenticada" on ctos for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
