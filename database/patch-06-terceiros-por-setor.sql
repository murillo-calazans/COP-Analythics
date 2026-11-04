alter table perfis add column if not exists setor text;
alter table ordens add column if not exists setor text;

create index if not exists ordens_setor_idx on ordens (setor);

drop policy if exists "leitura autenticada" on ordens;
create policy "leitura autenticada" on ordens for select to authenticated
    using (exists (
        select 1 from perfis p
        where p.id = auth.uid()
          and (p.setor is null or upper(p.setor) = upper(ordens.setor))
    ));

drop policy if exists "leitura autenticada" on movimentacoes;
create policy "leitura autenticada" on movimentacoes for select to authenticated
    using (exists (
        select 1 from perfis p
        join ordens o on o.id = movimentacoes.ordem_id
        where p.id = auth.uid()
          and (p.setor is null or upper(p.setor) = upper(o.setor))
    ));

update ordens o
set setor = sub.valor
from (
    select ro.chave, ro.dados ->> ok.chave_coluna as valor
    from ref_operadores ro
    cross join lateral (
        select key as chave_coluna from jsonb_object_keys(ro.dados) as key
        where upper(key) = 'SETOR'
        limit 1
    ) ok
) sub
where o.tecnico_responsavel = sub.chave;
