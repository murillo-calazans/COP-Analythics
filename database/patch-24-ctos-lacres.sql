create table if not exists ctos_lacres_cadastro (
    os_id text primary key,
    cadastrado boolean not null default false,
    login text,
    cto text,
    porta text,
    lacre text,
    atualizado_por text,
    atualizado_em timestamptz not null default now()
);

alter table ctos_lacres_cadastro enable row level security;

drop policy if exists "leitura autenticada" on ctos_lacres_cadastro;
drop policy if exists "escrita admin ou editor" on ctos_lacres_cadastro;
drop policy if exists "atualizacao admin ou editor" on ctos_lacres_cadastro;

create policy "leitura autenticada" on ctos_lacres_cadastro for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
create policy "escrita admin ou editor" on ctos_lacres_cadastro for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));
create policy "atualizacao admin ou editor" on ctos_lacres_cadastro for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));
