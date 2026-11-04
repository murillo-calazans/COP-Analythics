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
