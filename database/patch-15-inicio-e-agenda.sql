alter table perfis add column if not exists nome text;

create table if not exists agenda_publicada (
    data date primary key,
    itens jsonb not null,
    resumo jsonb,
    publicado_por text,
    atualizado_em timestamptz not null default now()
);

alter table agenda_publicada enable row level security;

drop policy if exists "leitura autenticada" on agenda_publicada;
drop policy if exists "escrita admin" on agenda_publicada;
drop policy if exists "atualizacao admin" on agenda_publicada;
drop policy if exists "exclusao admin" on agenda_publicada;

create policy "leitura autenticada" on agenda_publicada for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));

create policy "escrita admin" on agenda_publicada for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
create policy "atualizacao admin" on agenda_publicada for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
create policy "exclusao admin" on agenda_publicada for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
