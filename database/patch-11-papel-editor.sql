-- ==========================================================
-- Patch #11 — papel intermediário "editor"
-- ==========================================================
-- Rode no SQL Editor do Supabase.
--
-- Até aqui só existiam dois papéis: "admin" (importa, apaga dados
-- compartilhados, vê Logs de Importação, roda o Auditor IA) e "leitor"
-- (só enxerga, nenhuma escrita). Este patch adiciona "editor": pode
-- IMPORTAR dados (Base/Ordens) e ver o card de Diagnósticos Não
-- Resolvidos, igual admin — mas NÃO pode apagar os dados compartilhados
-- ("Limpar Dados") nem ver os Logs de Importação, que continuam só
-- admin (ver js/ui/login.js -> aplicarGateDePapel e
-- js/services/auth.js -> podeImportar/ehAdmin).
--
-- 1) Permite "editor" na coluna perfis.papel.

alter table perfis drop constraint if exists perfis_papel_check;
alter table perfis add constraint perfis_papel_check check (papel in ('admin', 'editor', 'leitor'));

-- 2) Escrita (insert/update) nas tabelas de importação passa a aceitar
-- admin OU editor — exclusão ("exclusao admin", patches anteriores e
-- schema-supabase.sql) continua SEM alteração, só admin.

drop policy if exists "escrita admin" on ref_operadores;
create policy "escrita admin ou editor" on ref_operadores for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));
drop policy if exists "atualizacao admin" on ref_operadores;
create policy "atualizacao admin ou editor" on ref_operadores for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

drop policy if exists "escrita admin" on ref_eventos;
create policy "escrita admin ou editor" on ref_eventos for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));
drop policy if exists "atualizacao admin" on ref_eventos;
create policy "atualizacao admin ou editor" on ref_eventos for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

drop policy if exists "escrita admin" on ref_diagnosticos;
create policy "escrita admin ou editor" on ref_diagnosticos for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));
drop policy if exists "atualizacao admin" on ref_diagnosticos;
create policy "atualizacao admin ou editor" on ref_diagnosticos for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

drop policy if exists "escrita admin" on ref_colaboradores_responsaveis;
create policy "escrita admin ou editor" on ref_colaboradores_responsaveis for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));
drop policy if exists "atualizacao admin" on ref_colaboradores_responsaveis;
create policy "atualizacao admin ou editor" on ref_colaboradores_responsaveis for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

drop policy if exists "escrita admin" on ordens;
create policy "escrita admin ou editor" on ordens for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));
drop policy if exists "atualizacao admin" on ordens;
create policy "atualizacao admin ou editor" on ordens for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

drop policy if exists "escrita admin" on movimentacoes;
create policy "escrita admin ou editor" on movimentacoes for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));
drop policy if exists "atualizacao admin" on movimentacoes;
create policy "atualizacao admin ou editor" on movimentacoes for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

-- logs_importacao: cada importação (de admin OU editor) grava 1 linha
-- aqui (ver armazenamento.js -> registrarLogImportacao) — sem isso, a
-- RLS bloquearia silenciosamente o log de toda importação feita por um
-- editor. A LEITURA dessa tabela já não muda (qualquer autenticado com
-- perfil já lê, ver schema-supabase.sql) — o card em si só some da UI
-- pra quem não é admin (aplicarGateDePapel).
drop policy if exists "escrita admin" on logs_importacao;
create policy "escrita admin ou editor" on logs_importacao for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

-- ==========================================================
-- Pra criar um usuário "editor":
-- 1. Authentication -> Users -> Add user (e-mail + senha), como já
--    fazia pra admin/leitor.
-- 2. Copie o UUID do usuário.
-- 3. Rode, trocando o UUID:
--
--    insert into perfis (id, papel) values ('COLE-O-UUID-AQUI', 'editor');
-- ==========================================================
