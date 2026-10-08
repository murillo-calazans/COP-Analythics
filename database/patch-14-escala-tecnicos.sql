-- ==========================================================
-- Patch 14: Escala de Técnicos (escala.html)
-- ==========================================================
-- Guarda o array inteiro de técnicos/horários/exceções como um único JSONB
-- (igual ao padrão de ref_operadores etc.) — o app já sabe ler essa
-- estrutura, não precisamos relacionalizar nada aqui.
--
-- Leitura: qualquer usuário autenticado com papel em "perfis" (admin,
-- editor ou leitor) — igual ao resto do COP Analytics.
-- Escrita: só papel 'admin' (ver escala.html).

create table if not exists escala_tecnicos_dados (
    id text primary key default 'default',
    dados jsonb not null,
    atualizado_em timestamptz not null default now()
);

alter table escala_tecnicos_dados enable row level security;

-- Supersede versões anteriores desta tabela (rascunhos de quando a escala
-- ainda era um site à parte, com leitura aberta a qualquer um com o link):
drop policy if exists "leitura publica" on escala_tecnicos_dados;
drop policy if exists "escrita publica" on escala_tecnicos_dados;
drop policy if exists "atualizacao publica" on escala_tecnicos_dados;
drop policy if exists "escrita autenticada" on escala_tecnicos_dados;
drop policy if exists "atualizacao autenticada" on escala_tecnicos_dados;

create policy "leitura autenticada" on escala_tecnicos_dados for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));

create policy "escrita admin" on escala_tecnicos_dados for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
create policy "atualizacao admin" on escala_tecnicos_dados for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
create policy "exclusao admin" on escala_tecnicos_dados for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
