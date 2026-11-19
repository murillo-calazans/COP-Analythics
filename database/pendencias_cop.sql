-- ============================================================================
-- Pendências para reabrir/cobrar (19/11/2026)
-- O bot do WhatsApp grava aqui, às 13h e às 18h, as OS de campo finalizadas
-- com inconsistência (mesma regra do texto "pendências para reabrir/cobrar").
-- A página pendencias.html lista por equipe → cidade e quem está logado marca
-- o status (cobrado, OS reaberta, auditoria aberta, resolvido, não procede).
-- Usuários do site só alteram status/obs/tratado_*; inserir é só do robô (service key).
-- Também consta no fim de database/schema.sql.
-- ============================================================================
create table if not exists pendencias_cop (
    os_id         bigint primary key,
    dia           date not null,                 -- dia do relatório em que apareceu
    equipe        text not null,                 -- INTERNA / AZUL / VELOZ / ...
    cidade        text,
    tecnico       text,
    cliente       text,
    assunto       text,
    diagnostico   text,
    finalizada_em text,
    problemas     jsonb not null default '[]'::jsonb,
    status        text not null default 'pendente'
                  check (status in ('pendente','cobrado','reaberta','auditoria','resolvido','nao_procede')),
    obs           text,
    tratado_por   text,
    tratado_em    timestamptz,
    criado_em     timestamptz not null default now(),
    atualizado_em timestamptz not null default now()
);
create index if not exists pendencias_cop_dia on pendencias_cop (dia);
create index if not exists pendencias_cop_status on pendencias_cop (status);

alter table pendencias_cop enable row level security;
drop policy if exists "leitura autenticada" on pendencias_cop;
create policy "leitura autenticada" on pendencias_cop for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
drop policy if exists "marcar status" on pendencias_cop;
create policy "marcar status" on pendencias_cop for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid()))
    with check (exists (select 1 from perfis where id = auth.uid()));
-- só as colunas de tratamento podem ser alteradas pelo site
revoke insert, update, delete on pendencias_cop from authenticated, anon;
grant select on pendencias_cop to authenticated;
grant update (status, obs, tratado_por, tratado_em) on pendencias_cop to authenticated;
