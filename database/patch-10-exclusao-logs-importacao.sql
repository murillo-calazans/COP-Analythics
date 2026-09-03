-- ==========================================================
-- Patch #10 — falta política de exclusão em logs_importacao
-- ==========================================================
-- Rode no SQL Editor do Supabase.
--
-- limparDadosImportados() (botão "Limpar dados") sempre tentou apagar
-- logs_importacao junto com as outras tabelas, mas essa tabela nunca
-- teve uma política de RLS pra DELETE — só leitura e inserção. Com
-- RLS ativado e sem política de exclusão, o Postgres bloqueia o
-- delete silenciosamente (0 linhas afetadas, sem erro nenhum) — por
-- isso "Limpar dados" parecia funcionar mas os logs antigos (Arquivo/
-- Tipo/Resumo/Quem/Quando) continuavam aparecendo no popup de
-- Importar Dados depois de limpar. Todas as outras tabelas (ref_*,
-- ordens, movimentacoes) já tinham essa política — só faltava aqui.

create policy "exclusao admin" on logs_importacao for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
