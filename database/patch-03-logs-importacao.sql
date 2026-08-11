-- ==========================================================
-- Patch #3 — log de arquivos importados
-- ==========================================================
-- Rode no SQL Editor do Supabase. Guarda um registro por
-- importação (Base.xlsx ou Ordens.xlsx) — nome do arquivo, quem
-- importou, quando, e um resumo (linhas/ordens/movimentações).
-- Mostrado no popup de Importar Dados, em "Arquivos no banco".

create table if not exists logs_importacao (
    id bigint generated always as identity primary key,
    nome_arquivo text not null,
    tipo text not null check (tipo in ('base', 'ordens')),
    importado_por text,
    importado_em timestamptz not null default now(),
    estatisticas jsonb
);

alter table logs_importacao enable row level security;

create policy "leitura autenticada" on logs_importacao for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));

create policy "escrita admin" on logs_importacao for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
