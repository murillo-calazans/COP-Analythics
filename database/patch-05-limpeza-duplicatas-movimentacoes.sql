-- ==========================================================
-- Patch #5 — limpeza de movimentações duplicadas (uso único)
-- ==========================================================
-- Antes da proteção contra duplicidade existir na importação (ver
-- chaveMovimentacao em js/services/armazenamento.js), reimportar o
-- mesmo Ordens.xlsx mais de uma vez inseria as mesmas movimentações
-- de novo — isso já parou de acontecer em importações novas, mas o
-- que já duplicou no passado continua no banco. Esse script limpa
-- isso de uma vez, usando a MESMA regra de "é a mesma movimentação"
-- que o import já usa: mesma OS + data + evento + operador + status +
-- diagnóstico + resposta padrão. Mantém a linha de menor "id" (a mais
-- antiga) de cada grupo duplicado e apaga o resto.
--
-- Rode o PASSO 1 primeiro pra ver quantas linhas seriam apagadas —
-- só rode o PASSO 2 (delete de verdade) depois de conferir que o
-- número faz sentido.

-- PASSO 1 — conferir antes de apagar (não muda nada no banco)
select count(*) as linhas_duplicadas_a_remover
from (
    select
        id,
        row_number() over (
            partition by ordem_id, data, evento, operador, status, diagnostico, resposta_padrao
            order by id
        ) as rn
    from movimentacoes
) sub
where sub.rn > 1;

-- PASSO 2 — apagar de verdade (só depois de conferir o PASSO 1)
-- delete from movimentacoes
-- where id in (
--     select id from (
--         select
--             id,
--             row_number() over (
--                 partition by ordem_id, data, evento, operador, status, diagnostico, resposta_padrao
--                 order by id
--             ) as rn
--         from movimentacoes
--     ) sub
--     where sub.rn > 1
-- );
