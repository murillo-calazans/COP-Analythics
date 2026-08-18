-- ==========================================================
-- Patch #7 — limpeza de movimentações duplicadas v2 (uso único)
-- ==========================================================
-- Igual em espírito ao patch-05 (mesmo problema, banco novo) — mas com
-- uma causa diferente: a chave de deduplicação em
-- js/services/armazenamento.js (chaveMovimentacao) comparava a data
-- por milissegundo EXATO. Importações grandes que precisaram ser
-- divididas em partes (arquivo HTML disfarçado de .xlsx — ver
-- js/utils/planilha.js) calculam a data por um caminho diferente do
-- Excel binário normal (SheetJS), e erro de arredondamento de ponto
-- flutuante de 1 milissegundo entre os dois já bastava pra chave achar
-- que era uma movimentação nova — duplicando a OS inteira sempre que
-- ela aparecia nos dois lados. Isso já foi corrigido no código
-- (a chave agora arredonda pro segundo); este script limpa o que já
-- duplicou no banco por causa disso, usando a MESMA regra relaxada
-- (segundo, não milissegundo). Mantém a linha de menor "id" de cada
-- grupo duplicado e apaga o resto.
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
            partition by
                ordem_id, evento, operador, status, diagnostico, resposta_padrao,
                round(extract(epoch from data))
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
--                 partition by
--                     ordem_id, evento, operador, status, diagnostico, resposta_padrao,
--                     round(extract(epoch from data))
--                 order by id
--             ) as rn
--         from movimentacoes
--     ) sub
--     where sub.rn > 1
-- );
