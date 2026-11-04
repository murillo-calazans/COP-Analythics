create table if not exists os_anotacoes (
    os_id         text primary key,
    texto         text not null,
    autor         text,
    atualizado_em timestamptz not null default now()
);

alter table os_anotacoes enable row level security;

drop policy if exists "os_anotacoes_select" on os_anotacoes;
create policy "os_anotacoes_select" on os_anotacoes for select
    using (exists (select 1 from perfis where id = auth.uid()));

drop policy if exists "os_anotacoes_insert" on os_anotacoes;
create policy "os_anotacoes_insert" on os_anotacoes for insert
    with check (exists (select 1 from perfis where id = auth.uid()));

drop policy if exists "os_anotacoes_update" on os_anotacoes;
create policy "os_anotacoes_update" on os_anotacoes for update
    using (exists (select 1 from perfis where id = auth.uid()))
    with check (exists (select 1 from perfis where id = auth.uid()));

drop policy if exists "os_anotacoes_delete" on os_anotacoes;
create policy "os_anotacoes_delete" on os_anotacoes for delete
    using (exists (select 1 from perfis where id = auth.uid()));
