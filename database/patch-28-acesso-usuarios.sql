-- ==========================================================
-- Patch 28: acesso por usuário — setores das OS e abas
-- ==========================================================
-- Configurado no site (Configurações > Acesso dos usuários, só admin):
--   perfis.setores_visiveis -> setores das OS que o usuário enxerga
--                              (null = todos). Vale NO BANCO (RLS de
--                              ordens/movimentacoes), não dá pra burlar.
--   perfis.abas_visiveis    -> abas do site que ele abre (null = todas;
--                              ids das seções, ex.: 'dashboard',
--                              'clientes-cto'). Só esconde no site.
-- Admin sempre vê tudo (setores e abas).
--
-- perfis.setor passa a ser só identificação da pessoa (saudação, tela de
-- Usuários) — não restringe mais nada. Substitui o patch-06/27: quem
-- estava restrito pelo setor continua restrito (migração abaixo), menos
-- o CONTROLE DE OPERAÇÕES, que passa a ver todos os setores.
--
-- Pode rodar mesmo sem ter rodado o patch-27 (ele fica obsoleto).

alter table perfis add column if not exists setores_visiveis text[];
alter table perfis add column if not exists abas_visiveis text[];

-- Migração (1x): mantém a restrição de hoje pra quem tinha setor, menos COP
-- e admin. Rodar de novo NÃO desfaz o que foi configurado no site depois:
-- só mexe em quem ainda está sem configuração E nunca foi salvo pela tela.
alter table perfis add column if not exists acesso_configurado boolean not null default false;

update perfis
set setores_visiveis = array[setor]
where setor is not null
  and setores_visiveis is null
  and not acesso_configurado
  and papel <> 'admin'
  and upper(setor) <> upper('CONTROLE DE OPERAÇÕES');

-- ---------- RLS: setores visíveis por usuário ----------

drop policy if exists "leitura autenticada" on ordens;
create policy "leitura autenticada" on ordens for select to authenticated
    using (exists (
        select 1 from perfis p
        where p.id = auth.uid()
          and (
              p.papel = 'admin'
              or p.setores_visiveis is null
              or exists (select 1 from unnest(p.setores_visiveis) v where upper(v) = upper(ordens.setor))
          )
    ));

drop policy if exists "leitura autenticada" on movimentacoes;
create policy "leitura autenticada" on movimentacoes for select to authenticated
    using (exists (
        select 1 from perfis p
        join ordens o on o.id = movimentacoes.ordem_id
        where p.id = auth.uid()
          and (
              p.papel = 'admin'
              or p.setores_visiveis is null
              or exists (select 1 from unnest(p.setores_visiveis) v where upper(v) = upper(o.setor))
          )
    ));

-- patch-27 (se tiver rodado) ficou sem uso
drop table if exists setores_visao_total;

-- ---------- funções da tela (mesmo modelo do patch-16) ----------

create or replace function admin_listar_acessos()
returns table (
    id uuid,
    email text,
    nome text,
    papel text,
    setor text,
    setores_visiveis text[],
    abas_visiveis text[]
)
language plpgsql
security definer
set search_path = public, auth
as $$
#variable_conflict use_column
begin
    if not exists (select 1 from public.perfis p where p.id = auth.uid() and p.papel = 'admin') then
        raise exception 'Só administradores podem ver os acessos.';
    end if;

    return query
        select u.id, u.email::text, p.nome, p.papel, p.setor, p.setores_visiveis, p.abas_visiveis
        from public.perfis p
        join auth.users u on u.id = p.id
        order by (p.papel = 'admin') desc, lower(coalesce(p.nome, u.email::text));
end
$$;

-- p_setores / p_abas: null = todos/todas; lista = só esses.
create or replace function admin_salvar_acesso(p_id uuid, p_setores text[], p_abas text[])
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
    if not exists (select 1 from public.perfis p where p.id = auth.uid() and p.papel = 'admin') then
        raise exception 'Só administradores podem alterar acessos.';
    end if;

    if not exists (select 1 from public.perfis p where p.id = p_id) then
        raise exception 'Usuário sem papel — dê um papel na tela de Usuários antes.';
    end if;

    if p_setores is not null and cardinality(p_setores) = 0 then
        raise exception 'Marque pelo menos um setor (ou "Todos os setores").';
    end if;

    update public.perfis
    set setores_visiveis = p_setores,
        abas_visiveis = p_abas,
        acesso_configurado = true
    where id = p_id;
end
$$;

revoke all on function admin_listar_acessos() from public, anon;
revoke all on function admin_salvar_acesso(uuid, text[], text[]) from public, anon;
grant execute on function admin_listar_acessos() to authenticated;
grant execute on function admin_salvar_acesso(uuid, text[], text[]) to authenticated;
