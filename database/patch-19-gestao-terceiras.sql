-- ==========================================================
-- Patch 19: Gestão de Terceiras (LPU + fechamento mensal)
-- ==========================================================
-- 1) terceiras_config: uma linha só (id 'default'), igual ao padrão da
--    escala. Guarda
--      lpu          -> { "ASSUNTO": { "AZUL": 85, "VELOZ": 80, ... } }
--                      (sem valor = sem preço/pendência; 0 = não paga)
--      diagnosticos -> { "DIAGNÓSTICO": true|false }  (produtivo?)
--    Editada na aba LPU (js/ui/terceiras.js).
--
-- 2) terceiras_fechamentos: o mês "congelado" de cada terceirizada.
--    Ao fechar, grava o total e a lista de OS pagas daquele momento;
--    reimportar dados depois não muda o que foi aprovado. Reabrir
--    (apagar o fechamento) é só admin.
--
-- Leitura: qualquer perfil. Escrita: admin ou editor.

create table if not exists terceiras_config (
    id text primary key default 'default',
    lpu jsonb not null default '{}'::jsonb,
    diagnosticos jsonb not null default '{}'::jsonb,
    atualizado_por text,
    atualizado_em timestamptz not null default now()
);

create table if not exists terceiras_fechamentos (
    mes text not null,              -- 'AAAA-MM'
    terceira text not null,         -- 'AZUL' | 'VELOZ' | 'TECHNOMAIS'
    total numeric(12, 2) not null,
    resumo jsonb,                   -- contagens e subtotais por assunto
    itens jsonb not null,           -- uma linha por OS do mês (paga ou não, com o motivo)
    aprovado_por text,
    aprovado_em timestamptz not null default now(),
    primary key (mes, terceira)
);

alter table terceiras_config enable row level security;
alter table terceiras_fechamentos enable row level security;

drop policy if exists "leitura autenticada" on terceiras_config;
drop policy if exists "escrita admin ou editor" on terceiras_config;
drop policy if exists "atualizacao admin ou editor" on terceiras_config;

create policy "leitura autenticada" on terceiras_config for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
create policy "escrita admin ou editor" on terceiras_config for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));
create policy "atualizacao admin ou editor" on terceiras_config for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

drop policy if exists "leitura autenticada" on terceiras_fechamentos;
drop policy if exists "escrita admin ou editor" on terceiras_fechamentos;
drop policy if exists "atualizacao admin ou editor" on terceiras_fechamentos;
drop policy if exists "exclusao admin" on terceiras_fechamentos;

create policy "leitura autenticada" on terceiras_fechamentos for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
create policy "escrita admin ou editor" on terceiras_fechamentos for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));
create policy "atualizacao admin ou editor" on terceiras_fechamentos for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));
create policy "exclusao admin" on terceiras_fechamentos for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
