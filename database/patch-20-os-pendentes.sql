create table if not exists os_pendentes (
    id bigint generated always as identity primary key,
    dados jsonb not null,
    capturado_em timestamptz not null default now()
);

alter table os_pendentes enable row level security;

create policy "leitura autenticada" on os_pendentes for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
