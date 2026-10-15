-- ==========================================================
-- Patch 27: setores com visão total das OS (COP vê tudo)
-- ==========================================================
-- O patch-06 restringe quem tem perfis.setor preenchido às OS daquele
-- setor (pensado pros terceiros). Só que a tela de Usuários grava o setor
-- de TODO mundo — e o COP ("CONTROLE DE OPERAÇÕES") acabou enxergando só
-- as OS cujo técnico responsável é do próprio COP, sem conseguir puxar
-- relatório dos outros setores.
--
-- Agora: setor listado em setores_visao_total vê TODAS as OS (o setor
-- continua no perfil, só não restringe mais). Quem tem setor fora da
-- lista segue restrito como antes; setor vazio continua vendo tudo.
--
-- Pra liberar outro setor depois (ex.: GERENCIA):
--   insert into setores_visao_total (setor) values ('GERENCIA');

create table if not exists setores_visao_total (
    setor text primary key
);

insert into setores_visao_total (setor) values ('CONTROLE DE OPERAÇÕES')
on conflict (setor) do nothing;

alter table setores_visao_total enable row level security;

drop policy if exists "leitura autenticada" on setores_visao_total;
create policy "leitura autenticada" on setores_visao_total for select to authenticated
    using (true);

drop policy if exists "leitura autenticada" on ordens;
create policy "leitura autenticada" on ordens for select to authenticated
    using (exists (
        select 1 from perfis p
        where p.id = auth.uid()
          and (
              p.setor is null
              or upper(p.setor) = upper(ordens.setor)
              or exists (select 1 from setores_visao_total s where upper(s.setor) = upper(p.setor))
          )
    ));

drop policy if exists "leitura autenticada" on movimentacoes;
create policy "leitura autenticada" on movimentacoes for select to authenticated
    using (exists (
        select 1 from perfis p
        join ordens o on o.id = movimentacoes.ordem_id
        where p.id = auth.uid()
          and (
              p.setor is null
              or upper(p.setor) = upper(o.setor)
              or exists (select 1 from setores_visao_total s where upper(s.setor) = upper(p.setor))
          )
    ));
