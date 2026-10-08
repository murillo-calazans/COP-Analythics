-- ==========================================================
-- Patch 15: Tela inicial (nome do usuário) e Agenda do dia
-- ==========================================================
-- 1) perfis.nome: nome de exibição ("Bom dia, Murillo") e também o nome
--    usado pra achar o operador do usuário nas OS (produção do mês). Use
--    o nome como está no sistema de OS (aba Operadores da Base.xlsx).
--    Vazio = o app usa o começo do e-mail.
--
-- 2) agenda_publicada: o pré-agendamento (agendador.html) publica o plano
--    de um dia aqui; a tela "Agenda do dia" do COP Analytics lê. Um JSONB
--    por data, igual ao padrão de escala_tecnicos_dados.
--    Leitura: qualquer usuário com papel em "perfis". Escrita: só admin.

alter table perfis add column if not exists nome text;

create table if not exists agenda_publicada (
    data date primary key,
    itens jsonb not null,          -- uma linha por parada (técnico, horário, OS, cliente...)
    resumo jsonb,                  -- totais pro cabeçalho (OS agendadas, sem técnico, técnicos)
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
