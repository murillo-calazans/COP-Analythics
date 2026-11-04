alter table movimentacoes add column if not exists colaborador_responsavel text;

create table if not exists ref_colaboradores_responsaveis (
    chave text primary key,
    dados jsonb not null,
    atualizado_em timestamptz not null default now()
);

alter table ref_colaboradores_responsaveis enable row level security;

create policy "leitura autenticada" on ref_colaboradores_responsaveis for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
create policy "escrita admin" on ref_colaboradores_responsaveis for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
create policy "atualizacao admin" on ref_colaboradores_responsaveis for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
create policy "exclusao admin" on ref_colaboradores_responsaveis for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
