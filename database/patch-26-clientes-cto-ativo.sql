-- ==========================================================
-- Patch 26: Cadastro na CTO — logins inativos
-- ==========================================================
-- A visão "CTOs de Clientes" traz a coluna Ativo (S/N). Até aqui o robô
-- descartava os inativos; agora grava todos e marca ativo = false, pra o
-- site alertar login INATIVO que ainda ocupa CTO/porta (porta que devia
-- ter sido liberada). Os cards e a lista normais contam só ativo = true.

alter table clientes_cto add column if not exists ativo boolean not null default true;

create index if not exists clientes_cto_ativo_completo on clientes_cto (ativo, completo);
