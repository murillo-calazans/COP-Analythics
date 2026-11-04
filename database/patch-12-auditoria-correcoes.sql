create table if not exists auditoria_correcoes (
    id bigint generated always as identity primary key,
    ordem_id text not null references ordens(id) on delete cascade,
    tipo_achado text not null,
    corrigido_por text,
    corrigido_em timestamptz not null default now(),
    unique (ordem_id, tipo_achado)
);

create index if not exists auditoria_correcoes_ordem_id_idx on auditoria_correcoes (ordem_id);

alter table auditoria_correcoes enable row level security;

create policy "leitura autenticada" on auditoria_correcoes for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
create policy "escrita qualquer perfil" on auditoria_correcoes for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid()));
create policy "atualizacao qualquer perfil" on auditoria_correcoes for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
create policy "exclusao qualquer perfil" on auditoria_correcoes for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
