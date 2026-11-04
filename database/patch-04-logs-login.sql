create table if not exists logs_login (
    id bigint generated always as identity primary key,
    usuario_email text not null,
    logado_em timestamptz not null default now()
);

alter table logs_login enable row level security;

create policy "leitura autenticada" on logs_login for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));

create policy "escrita autenticada" on logs_login for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid()));
