-- ==========================================================
-- Patch #21 — comandos pro robô (atualizar sob demanda)
-- ==========================================================
-- Rode no SQL Editor do Supabase. Fila de comandos que o site manda
-- pro robô (C:\cop-robo\robo.js). O botão "Atualizar banco" (só admin/
-- editor) insere um comando 'pendente'; o robô, que fica checando esta
-- tabela a cada ~30s, abre o IXC, atualiza ordens + os_pendentes e marca
-- 'concluido' (ou 'erro'). O site acompanha o status pra dar o retorno.

create table if not exists robo_comandos (
    id bigint generated always as identity primary key,
    tipo text not null default 'atualizar',
    solicitado_por text,
    solicitado_em timestamptz not null default now(),
    status text not null default 'pendente' check (status in ('pendente', 'processando', 'concluido', 'erro')),
    processado_em timestamptz,
    resultado jsonb
);

create index if not exists robo_comandos_status_idx on robo_comandos (status, solicitado_em);

alter table robo_comandos enable row level security;

-- Leitura: qualquer autenticado (o site precisa acompanhar o status).
create policy "leitura autenticada" on robo_comandos for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));

-- Só admin/editor pode PEDIR uma atualização.
create policy "pedido admin/editor" on robo_comandos for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

-- Quem atualiza o status é o robô (service_role), que ignora a RLS — por
-- isso não há policy de update/delete pra usuário comum.
