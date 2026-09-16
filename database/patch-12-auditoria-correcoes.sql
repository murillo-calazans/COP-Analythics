-- ==========================================================
-- Patch #12 — correções manuais de achados da Auditoria Operacional
-- ==========================================================
-- Rode no SQL Editor do Supabase.
--
-- Um achado da Auditoria (Diagnóstico x Próxima Tarefa incompatível,
-- Próxima Tarefa ausente, Diagnóstico ausente, Duplicidade) às vezes já
-- foi corrigido NO SISTEMA DE ORIGEM (reabertura pra acertar o processo)
-- antes de alguém rodar a Auditoria de novo aqui — nesse caso o achado
-- continua aparecendo (o 1º Fechamento, que é o que a Auditoria audita,
-- não muda), mesmo já estando resolvido de verdade. Esta tabela guarda
-- uma marca manual e COMPARTILHADA de "já corrigido" por achado, pra
-- não confundir isso com pendência real.
--
-- Chave é (ordem_id, tipo_achado) — uma OS pode ter mais de um tipo de
-- achado ao mesmo tempo (ex.: "inconsistencia" e "duplicidade"), cada
-- um se marca separado.

create table if not exists auditoria_correcoes (
    id bigint generated always as identity primary key,
    ordem_id text not null references ordens(id) on delete cascade,
    tipo_achado text not null,
    corrigido_por text,
    corrigido_em timestamptz not null default now(),
    unique (ordem_id, tipo_achado)
);

create index if not exists auditoria_correcoes_ordem_id_idx on auditoria_correcoes (ordem_id);

alter table auditoria_correcoes enable row level security;

-- Leitura/escrita liberada pra QUALQUER usuário autenticado com papel em
-- "perfis" (admin, editor OU leitor) — diferente do resto do sistema,
-- onde leitor nunca escreve nada. É uma marcação leve e reversível (não
-- apaga nem altera nenhum dado importado), então não faz sentido travar
-- atrás de admin/editor só isso.
create policy "leitura autenticada" on auditoria_correcoes for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
create policy "escrita qualquer perfil" on auditoria_correcoes for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid()));
create policy "atualizacao qualquer perfil" on auditoria_correcoes for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
create policy "exclusao qualquer perfil" on auditoria_correcoes for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
