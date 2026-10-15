-- ==========================================================
-- Patch 25: Gestão de Clientes > Cadastro na CTO
-- ==========================================================
-- Retrato da base de clientes do IXC (visão do Query Builder puxada pelo
-- robô, 1x por dia — ver VISAO_CLIENTES_CTO em robo-ordens/robo.js):
-- uma linha por login, com a CTO, a porta e o lacre cadastrados.
-- Vazio = não cadastrado no IXC (o robô grava null, nunca "").
--
-- completo = CTO e porta preenchidas (o card "com cadastro" do site).
-- sincronizado_em = rodada do robô que viu a linha por último; linha que
-- sumiu da visão (cliente cancelado/apagado) é apagada pelo robô no fim
-- da rodada.
--
-- Leitura: qualquer perfil. Escrita: só o robô (chave service, sem RLS).

create table if not exists clientes_cto (
    chave text primary key,          -- login (ou o nome do cliente, se vier sem login)
    cliente text,
    login text,
    cto text,
    porta text,
    lacre text,
    completo boolean generated always as (cto is not null and porta is not null) stored,
    sincronizado_em timestamptz not null default now()
);

create index if not exists clientes_cto_completo on clientes_cto (completo);

alter table clientes_cto enable row level security;

drop policy if exists "leitura autenticada" on clientes_cto;
create policy "leitura autenticada" on clientes_cto for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
