create table if not exists configuracoes_app (
    chave text primary key,
    valor jsonb not null,
    atualizado_em timestamptz not null default now(),
    atualizado_por text
);

alter table configuracoes_app enable row level security;

drop policy if exists "leitura autenticada" on configuracoes_app;
drop policy if exists "escrita admin editor" on configuracoes_app;
drop policy if exists "atualizacao admin editor" on configuracoes_app;
drop policy if exists "exclusao admin editor" on configuracoes_app;
drop policy if exists "escrita admin" on configuracoes_app;
drop policy if exists "atualizacao admin" on configuracoes_app;
drop policy if exists "exclusao admin" on configuracoes_app;

create policy "leitura autenticada" on configuracoes_app for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));

create policy "escrita admin" on configuracoes_app for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
create policy "atualizacao admin" on configuracoes_app for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
create policy "exclusao admin" on configuracoes_app for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
