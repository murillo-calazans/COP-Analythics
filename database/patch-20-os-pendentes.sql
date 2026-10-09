-- ==========================================================
-- Patch #20 — OS pendentes (pré-agendamento)
-- ==========================================================
-- Rode no SQL Editor do Supabase. Guarda um RETRATO atual das OS
-- em aberto (visão "PRÉ AGENDAMENTO" do Query Builder do IXC: OS
-- abertas no ano, dos setores de campo, com status <> Finalizada).
--
-- Quem grava é o robô (C:\cop-robo\robo.js), de hora em hora, usando
-- a chave service_role — ele APAGA tudo e reinsere o retrato novo a
-- cada rodada (as OS que já foram agendadas/fechadas somem sozinhas).
-- Cada linha é um evento/movimentação, no MESMO formato do .xlsx que o
-- Agendador já lê (colunas "ID OS", "CLIENTE", "BAIRRO", "LATITUDE"...),
-- guardado em JSONB — por isso o Agendador consegue usar sem conversão.

create table if not exists os_pendentes (
    id bigint generated always as identity primary key,
    dados jsonb not null,
    capturado_em timestamptz not null default now()
);

alter table os_pendentes enable row level security;

-- Leitura: qualquer usuário autenticado (o Agendador roda logado).
create policy "leitura autenticada" on os_pendentes for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));

-- Escrita fica só com a service_role (o robô), que ignora a RLS — por
-- isso NÃO criamos policy de insert/delete pra usuário comum.
