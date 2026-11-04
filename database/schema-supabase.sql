create table if not exists ref_operadores (
    chave text primary key,
    dados jsonb not null,
    atualizado_em timestamptz not null default now()
);

create table if not exists ref_eventos (
    chave text primary key,
    dados jsonb not null,
    atualizado_em timestamptz not null default now()
);

create table if not exists ref_diagnosticos (
    chave text primary key,
    dados jsonb not null,
    atualizado_em timestamptz not null default now()
);

create table if not exists ref_colaboradores_responsaveis (
    chave text primary key,
    dados jsonb not null,
    atualizado_em timestamptz not null default now()
);

create table if not exists ordens (
    id text primary key,
    cliente text,
    login text,
    cidade text,
    bairro text,
    assunto text,
    data_abertura timestamptz,
    data_fechamento timestamptz,
    status_atual text,
    tecnico_responsavel text,

    setor text,
    atualizado_em timestamptz not null default now(),
    auditoria_ia jsonb
);

create index if not exists ordens_setor_idx on ordens (setor);

create table if not exists movimentacoes (
    id bigint generated always as identity primary key,
    ordem_id text not null references ordens(id) on delete cascade,
    operador text,

    colaborador_responsavel text,
    equipe text,
    evento text,
    diagnostico text,

    proxima_tarefa text,
    status text,
    resposta_padrao text,
    mensagem text,
    historico jsonb,
    data timestamptz
);

create index if not exists movimentacoes_ordem_id_idx on movimentacoes (ordem_id);

create table if not exists perfis (
    id uuid primary key references auth.users(id) on delete cascade,
    papel text not null check (papel in ('admin', 'leitor')),

    setor text,
    criado_em timestamptz not null default now()
);

create table if not exists logs_importacao (
    id bigint generated always as identity primary key,
    nome_arquivo text not null,
    tipo text not null check (tipo in ('base', 'ordens')),
    importado_por text,
    importado_em timestamptz not null default now(),
    estatisticas jsonb
);

create table if not exists logs_login (
    id bigint generated always as identity primary key,
    usuario_email text not null,
    logado_em timestamptz not null default now()
);

alter table ref_operadores enable row level security;
alter table ref_eventos enable row level security;
alter table ref_diagnosticos enable row level security;
alter table ref_colaboradores_responsaveis enable row level security;
alter table ordens enable row level security;
alter table movimentacoes enable row level security;
alter table perfis enable row level security;
alter table logs_importacao enable row level security;
alter table logs_login enable row level security;

create policy "leitura autenticada" on ref_operadores for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
create policy "leitura autenticada" on ref_eventos for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
create policy "leitura autenticada" on ref_diagnosticos for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
create policy "leitura autenticada" on ref_colaboradores_responsaveis for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));

create policy "leitura autenticada" on ordens for select to authenticated
    using (exists (
        select 1 from perfis p
        where p.id = auth.uid()
          and (p.setor is null or upper(p.setor) = upper(ordens.setor))
    ));
create policy "leitura autenticada" on movimentacoes for select to authenticated
    using (exists (
        select 1 from perfis p
        join ordens o on o.id = movimentacoes.ordem_id
        where p.id = auth.uid()
          and (p.setor is null or upper(p.setor) = upper(o.setor))
    ));

create policy "leitura do proprio perfil" on perfis for select to authenticated using (id = auth.uid());

create policy "leitura autenticada" on logs_importacao for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
create policy "escrita admin" on logs_importacao for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
create policy "exclusao admin" on logs_importacao for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));

create policy "leitura autenticada" on logs_login for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
create policy "escrita autenticada" on logs_login for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid()));

create policy "escrita admin" on ref_operadores for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
create policy "atualizacao admin" on ref_operadores for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
create policy "exclusao admin" on ref_operadores for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));

create policy "escrita admin" on ref_eventos for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
create policy "atualizacao admin" on ref_eventos for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
create policy "exclusao admin" on ref_eventos for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));

create policy "escrita admin" on ref_diagnosticos for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
create policy "atualizacao admin" on ref_diagnosticos for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
create policy "exclusao admin" on ref_diagnosticos for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));

create policy "escrita admin" on ref_colaboradores_responsaveis for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
create policy "atualizacao admin" on ref_colaboradores_responsaveis for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
create policy "exclusao admin" on ref_colaboradores_responsaveis for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));

create policy "escrita admin" on ordens for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
create policy "atualizacao admin" on ordens for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
create policy "exclusao admin" on ordens for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));

create policy "escrita admin" on movimentacoes for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
create policy "atualizacao admin" on movimentacoes for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
create policy "exclusao admin" on movimentacoes for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
