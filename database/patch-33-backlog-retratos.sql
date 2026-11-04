create table if not exists backlog_retratos (
    dia date not null,
    os_id text not null,
    cliente text,
    cidade text,
    bairro text,
    assunto text,
    status text,
    abertura text,
    agendamento text,
    salvo_em timestamptz not null default now(),
    primary key (dia, os_id)
);

alter table backlog_retratos enable row level security;

drop policy if exists "leitura autenticada" on backlog_retratos;
create policy "leitura autenticada" on backlog_retratos for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));

create or replace function salvar_retrato_backlog()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_dia date := (now() at time zone 'America/Sao_Paulo')::date;
    v_n integer;
begin
    delete from backlog_retratos where dia = v_dia or dia < v_dia - 100;

    with ev as (
        select id, dados, dados->>'ID OS' as os_id,
               case when dados->>'DATA' ~ '^\d{2}/\d{2}/\d{4} \d{2}:\d{2}:\d{2}'
                    then to_timestamp(left(dados->>'DATA', 19), 'DD/MM/YYYY HH24:MI:SS') end as quando
        from os_pendentes
        where coalesce(dados->>'ID OS', '') <> ''
    ), ult as (
        select distinct on (os_id) os_id, dados
        from ev
        order by os_id, quando desc nulls last, id desc
    ), ag as (
        select distinct on (os_id) os_id, dados->>'AGENDAMENTO' as agendamento
        from ev
        where coalesce(dados->>'AGENDAMENTO', '') <> ''
        order by os_id, id desc
    )
    insert into backlog_retratos (dia, os_id, cliente, cidade, bairro, assunto, status, abertura, agendamento)
    select v_dia, u.os_id, u.dados->>'CLIENTE', u.dados->>'CIDADE', u.dados->>'BAIRRO', u.dados->>'ASSUNTO',
           u.dados->>'STATUS', u.dados->>'DATA/HORA ABERTURA', ag.agendamento
    from ult u
    left join ag using (os_id);

    get diagnostics v_n = row_count;
    return v_n;
end;
$$;

revoke execute on function salvar_retrato_backlog() from public, anon, authenticated;

create extension if not exists pg_cron;

select cron.unschedule('retrato-backlog-diario')
where exists (select 1 from cron.job where jobname = 'retrato-backlog-diario');

select cron.schedule('retrato-backlog-diario', '55 2 * * *', $$select salvar_retrato_backlog()$$);

select salvar_retrato_backlog();
