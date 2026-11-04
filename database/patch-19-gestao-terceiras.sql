create table if not exists terceiras_config (
    id text primary key default 'default',
    lpu jsonb not null default '{}'::jsonb,
    diagnosticos jsonb not null default '{}'::jsonb,
    atualizado_por text,
    atualizado_em timestamptz not null default now()
);

create table if not exists terceiras_fechamentos (
    mes text not null,
    terceira text not null,
    total numeric(12, 2) not null,
    resumo jsonb,
    itens jsonb not null,
    aprovado_por text,
    aprovado_em timestamptz not null default now(),
    primary key (mes, terceira)
);

alter table terceiras_config enable row level security;
alter table terceiras_fechamentos enable row level security;

drop policy if exists "leitura autenticada" on terceiras_config;
drop policy if exists "escrita admin ou editor" on terceiras_config;
drop policy if exists "atualizacao admin ou editor" on terceiras_config;

create policy "leitura autenticada" on terceiras_config for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
create policy "escrita admin ou editor" on terceiras_config for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));
create policy "atualizacao admin ou editor" on terceiras_config for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

drop policy if exists "leitura autenticada" on terceiras_fechamentos;
drop policy if exists "escrita admin ou editor" on terceiras_fechamentos;
drop policy if exists "atualizacao admin ou editor" on terceiras_fechamentos;
drop policy if exists "exclusao admin" on terceiras_fechamentos;

create policy "leitura autenticada" on terceiras_fechamentos for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
create policy "escrita admin ou editor" on terceiras_fechamentos for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));
create policy "atualizacao admin ou editor" on terceiras_fechamentos for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));
create policy "exclusao admin" on terceiras_fechamentos for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
