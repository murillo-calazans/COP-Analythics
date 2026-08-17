-- ==========================================================
-- COP Analytics — Schema Supabase (Fase 1: dados compartilhados + papéis)
-- ==========================================================
-- Rode este script inteiro no SQL Editor do painel do Supabase
-- (Editor SQL no menu lateral) uma única vez, no projeto criado
-- na região São Paulo (sa-east-1).
--
-- Tabelas de referência (ref_operadores/ref_eventos/ref_diagnosticos)
-- guardam a linha bruta da planilha inteira em JSONB — de propósito:
-- o app já sabe achar qualquer coluna dentro dessa linha por nome
-- (ver js/utils/planilha.js -> encontrarColuna), então não precisamos
-- prever antecipadamente quais colunas existem no Base.xlsx de cada
-- empresa. "ordens"/"movimentacoes" já são tipadas porque os modelos
-- JS (OrdemServico/Movimentacao) já são fixos.

-- ---------- Referências (Base.xlsx) ----------

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

-- ---------- Ordens de Serviço ----------

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
    -- Setor do técnico responsável ATUAL (não do fechamento) — usado
    -- só pra restringir leitura de usuário "terceiro" por RLS (ver
    -- perfis.setor abaixo e database/patch-06-terceiros-por-setor.sql).
    setor text,
    atualizado_em timestamptz not null default now(),
    auditoria_ia jsonb
);

create index if not exists ordens_setor_idx on ordens (setor);

create table if not exists movimentacoes (
    id bigint generated always as identity primary key,
    ordem_id text not null references ordens(id) on delete cascade,
    operador text,
    equipe text,
    evento text,
    diagnostico text,
    status text,
    resposta_padrao text,
    mensagem text,
    historico jsonb,
    data timestamptz
);

create index if not exists movimentacoes_ordem_id_idx on movimentacoes (ordem_id);

-- ---------- Perfis / papéis ----------
-- papel 'admin'  = importa, apaga, faz tudo
-- papel 'leitor' = só pesquisa/analisa (RLS abaixo bloqueia escrita)

create table if not exists perfis (
    id uuid primary key references auth.users(id) on delete cascade,
    papel text not null check (papel in ('admin', 'leitor')),
    -- Setor: null (padrão) = vê tudo. Preenchido = restringe leitura
    -- de ordens/movimentacoes só ao que tiver esse setor (usuário
    -- "terceiro" — LGPD, ver database/patch-06-terceiros-por-setor.sql).
    setor text,
    criado_em timestamptz not null default now()
);

-- ---------- Log de importações ----------
-- Um registro por arquivo importado (Base.xlsx ou Ordens.xlsx) — nome,
-- quem, quando, resumo. Mostrado no popup de Importar Dados.

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

-- ==========================================================
-- Row Level Security
-- ==========================================================

alter table ref_operadores enable row level security;
alter table ref_eventos enable row level security;
alter table ref_diagnosticos enable row level security;
alter table ordens enable row level security;
alter table movimentacoes enable row level security;
alter table perfis enable row level security;
alter table logs_importacao enable row level security;
alter table logs_login enable row level security;

-- Leitura: qualquer usuário logado com papel configurado em "perfis" (admin
-- OU leitor) vê tudo. NÃO basta estar autenticado — o Supabase permite
-- autocadastro por padrão, então "to authenticated using (true)" deixaria
-- qualquer um que se cadastre direto pela API (sem passar pela nossa tela
-- de login) ler os dados, mesmo sem um admin ter liberado essa pessoa.
create policy "leitura autenticada" on ref_operadores for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
create policy "leitura autenticada" on ref_eventos for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
create policy "leitura autenticada" on ref_diagnosticos for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
-- ordens/movimentacoes: além de estar em "perfis", o setor do usuário
-- (se tiver algum) precisa bater com o setor da OS — null em
-- perfis.setor = sem restrição, vê tudo (comportamento de sempre).
-- Ver database/patch-06-terceiros-por-setor.sql pro motivo/detalhe.
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

-- Perfis: cada usuário só enxerga o próprio papel.
create policy "leitura do proprio perfil" on perfis for select to authenticated using (id = auth.uid());

create policy "leitura autenticada" on logs_importacao for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
create policy "escrita admin" on logs_importacao for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));

-- Logs de login: qualquer usuário autenticado insere o próprio registro
-- (admin e leitor os dois fazem login), leitura igual ao resto.
create policy "leitura autenticada" on logs_login for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
create policy "escrita autenticada" on logs_login for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid()));

-- Escrita (insert/update/delete): só quem tem papel 'admin' na tabela perfis.
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

-- ==========================================================
-- Depois de rodar este script:
-- 1. Vá em Authentication -> Users -> Add user (ou Invite) e crie sua
--    própria conta (e-mail + senha).
-- 2. Copie o UUID desse usuário (aparece na lista de Users).
-- 3. Rode o comando abaixo, TROCANDO o UUID, pra virar admin:
--
--    insert into perfis (id, papel) values ('53877fb0-39fa-47ca-be6e-f7794ddccc13', 'admin');
--
-- 4. Pra criar um usuário "leitor" depois, repita os passos 1-3 com
--    papel = 'leitor' em vez de 'admin'.
-- 5. Pra criar um usuário "terceiro" (leitor restrito a 1 setor —
--    LGPD, só enxerga as OS desse setor), repita os passos 1-2 e rode:
--
--    insert into perfis (id, papel, setor)
--    values ('COLE-O-UUID-AQUI', 'leitor', 'NOME EXATO DO SETOR');
--
--    O nome do setor tem que bater com o que aparece no Filtro Global
--    > Setor do app (copie de lá pra evitar erro de acentuação).
-- ==========================================================
