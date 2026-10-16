-- ==========================================================
-- Patch 30: coordenada (lat/long) de cada OS
-- ==========================================================
-- A visão 343 do IXC já traz latitude/longitude da OS (endereço do
-- atendimento); o robô passa a gravar aqui. Usado pelo Mapa de calor
-- (posição exata da OS, antes de CTO/bairro/cidade).
--
-- preencher_coordenadas_ordens: preenchimento em massa das OS antigas,
-- feito pelo robô aos poucos (um mês por rodada). Só a chave service chama.

alter table ordens add column if not exists lat double precision;
alter table ordens add column if not exists lng double precision;

create or replace function preencher_coordenadas_ordens(p_linhas jsonb)
returns integer
language sql
as $$
    with atualizadas as (
        update ordens o
        set lat = x.lat, lng = x.lng
        from jsonb_to_recordset(p_linhas) as x(id text, lat double precision, lng double precision)
        where o.id = x.id
          and (o.lat is distinct from x.lat or o.lng is distinct from x.lng)
        returning 1
    )
    select count(*)::integer from atualizadas;
$$;

revoke all on function preencher_coordenadas_ordens(jsonb) from public, anon, authenticated;
grant execute on function preencher_coordenadas_ordens(jsonb) to service_role;
