-- ==========================================================
-- Patch #6 — usuários "terceiro" restritos a 1 setor
-- ==========================================================
-- Rode no SQL Editor do Supabase. Permite criar contas de leitor que
-- só enxergam as OS do setor delas (LGPD — terceiro não pode ver
-- ordem de outro setor). É restrição de verdade, aplicada no banco
-- via RLS — não dá pra burlar abrindo o DevTools.
--
-- "Setor" aqui é o do TÉCNICO RESPONSÁVEL ATUAL da OS (coluna
-- tecnico_responsavel, sempre a movimentação mais recente) — diferente
-- do "Setor" do Filtro Global, que olha só o FECHAMENTO (ver
-- js/engine/filtroengine.js -> fechamentoEhDoSetor). Usar o
-- responsável atual, e não o fechamento, é o que importa aqui: uma OS
-- ainda aberta (sem Fechamento) já entra no setor de quem está com
-- ela agora, em vez de ficar invisível pra todo mundo até fechar.

alter table perfis add column if not exists setor text;
alter table ordens add column if not exists setor text;

create index if not exists ordens_setor_idx on ordens (setor);

-- perfis.setor = null (padrão, ninguém muda pra quem já existe) ->
-- continua vendo tudo, igual antes. Só quem tiver um setor definido
-- fica restrito. Comparação sem diferenciar maiúsculas/minúsculas
-- (upper dos dois lados) pra não quebrar por um "Instalação" x
-- "instalação" digitado diferente.

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

-- ==========================================================
-- Backfill único — preenche ordens.setor pra OS importadas ANTES
-- deste patch (dado novo só é gravado em ordens tocadas por um
-- import daqui pra frente). Sem isso, OS antigas ficam invisíveis
-- pra terceiro até alguém reimportar o arquivo delas. Rode 1x.
-- ==========================================================
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

-- ==========================================================
-- Pra criar um usuário "terceiro" restrito a um setor:
-- 1. Authentication -> Users -> Add user (e-mail + senha), como já
--    fazia pra admin/leitor normal.
-- 2. Copie o UUID do usuário.
-- 3. No Dashboard do app (Filtro Global -> Setor), veja o nome EXATO
--    do setor como está escrito na Base.xlsx — copie dali pra evitar
--    erro de digitação (acento errado NÃO bate, só maiúscula/
--    minúscula é tolerado).
-- 4. Rode, trocando o UUID e o setor:
--
--    insert into perfis (id, papel, setor)
--    values ('COLE-O-UUID-AQUI', 'leitor', 'NOME EXATO DO SETOR');
--
-- Um "leitor" comum (equipe interna, vê tudo) continua sendo criado
-- sem informar setor (fica null) — nada muda pra quem já existe.
-- ==========================================================
