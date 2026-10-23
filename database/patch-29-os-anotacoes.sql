-- ==========================================================
-- Patch #29 — Anotações manuais por OS (acompanhamento do COP)
-- ==========================================================
-- Uma etiqueta/nota curta que o COP cola numa OS pendente (ex.: "área de
-- risco", "em tratativa", "agendado") só pra sinalizar que já está sendo
-- tratada. Fica presa ao NÚMERO da OS (os_id), então sobrevive à puxada de
-- hora em hora; quando a OS é agendada/fechada ela sai naturalmente da lista
-- "sem agendamento" (que é calculada pelo status atual), mas a nota continua
-- salva e aparece onde a OS aparecer.
--
-- Rode no SQL Editor do Supabase.

create table if not exists os_anotacoes (
    os_id         text primary key,
    texto         text not null,
    autor         text,
    atualizado_em timestamptz not null default now()
);

alter table os_anotacoes enable row level security;

-- Qualquer usuário com perfil (logado no COP) lê e escreve — é nota interna.
drop policy if exists "os_anotacoes_select" on os_anotacoes;
create policy "os_anotacoes_select" on os_anotacoes for select
    using (exists (select 1 from perfis where id = auth.uid()));

drop policy if exists "os_anotacoes_insert" on os_anotacoes;
create policy "os_anotacoes_insert" on os_anotacoes for insert
    with check (exists (select 1 from perfis where id = auth.uid()));

drop policy if exists "os_anotacoes_update" on os_anotacoes;
create policy "os_anotacoes_update" on os_anotacoes for update
    using (exists (select 1 from perfis where id = auth.uid()))
    with check (exists (select 1 from perfis where id = auth.uid()));

drop policy if exists "os_anotacoes_delete" on os_anotacoes;
create policy "os_anotacoes_delete" on os_anotacoes for delete
    using (exists (select 1 from perfis where id = auth.uid()));
