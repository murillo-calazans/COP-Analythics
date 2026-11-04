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

create policy "leitura autenticada" on robo_comandos for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));

create policy "pedido admin/editor" on robo_comandos for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));
