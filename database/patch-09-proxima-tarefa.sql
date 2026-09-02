-- ==========================================================
-- Patch #9 — Próxima Tarefa (Auditoria Operacional)
-- ==========================================================
-- Rode no SQL Editor do Supabase.
--
-- Nova coluna "PROXIMA TAREFA" na planilha de Ordens: processo a
-- seguir depois que a OS for finalizada (ex.: "INSTALAÇÃO CONCLUÍDA",
-- "EQUIPAMENTO TROCADO - IR PARA CONFERÊNCIA"). Só faz sentido na
-- movimentação de Fechamento (evento 6 / status Finalizada) — usada
-- pela Auditoria Operacional (ver js/engine/auditoriaoperacionalengine.js)
-- pra checar se o Diagnóstico do fechamento é coerente com o próximo
-- passo esperado do processo.

alter table movimentacoes add column if not exists proxima_tarefa text;
