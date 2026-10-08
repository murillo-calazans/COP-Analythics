-- ==========================================================
-- Patch 18: garante o papel "editor" (refaz o patch-11 com segurança)
-- ==========================================================
-- Sintoma: salvar um usuário como Editor dava
--   new row for relation "perfis" violates check constraint "perfis_papel_check"
-- ou seja, o patch-11 não tinha sido aplicado neste banco: a coluna
-- papel só aceitava admin/leitor, e a importação feita por editor
-- seria recusada.
--
-- Pode rodar quantas vezes quiser: cada policy é apagada (pelos dois
-- nomes possíveis) antes de ser criada de novo.

-- 1) Coluna papel aceita editor.
alter table perfis drop constraint if exists perfis_papel_check;
alter table perfis add constraint perfis_papel_check check (papel in ('admin', 'editor', 'leitor'));

-- 2) Importação (insert/update) por admin ou editor.
do $$
declare
    tabela text;
begin
    foreach tabela in array array[
        'ref_operadores', 'ref_eventos', 'ref_diagnosticos', 'ref_colaboradores_responsaveis',
        'ordens', 'movimentacoes'
    ] loop
        execute format('drop policy if exists "escrita admin" on %I', tabela);
        execute format('drop policy if exists "escrita admin ou editor" on %I', tabela);
        execute format('drop policy if exists "atualizacao admin" on %I', tabela);
        execute format('drop policy if exists "atualizacao admin ou editor" on %I', tabela);

        execute format($p$create policy "escrita admin ou editor" on %I for insert to authenticated
            with check (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')))$p$, tabela);
        execute format($p$create policy "atualizacao admin ou editor" on %I for update to authenticated
            using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')))$p$, tabela);
    end loop;
end
$$;

-- 3) Log de cada importação (insert) por admin ou editor.
drop policy if exists "escrita admin" on logs_importacao;
drop policy if exists "escrita admin ou editor" on logs_importacao;
create policy "escrita admin ou editor" on logs_importacao for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));
