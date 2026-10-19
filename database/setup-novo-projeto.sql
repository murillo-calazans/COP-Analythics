-- ==========================================================
-- SETUP DO PROJETO NOVO — rode INTEIRO no SQL Editor do Supabase
-- (schema base + patches em ordem; patch-22/cron foi omitido de propósito)
-- Gerado em 2026-10-19. Se alguma linha der erro, rode aquele patch isolado.
-- ==========================================================

-- ==========================================================
-- COP Analytics — Schema Supabase (Fase 1: dados compartilhados + papéis)
-- ==========================================================
-- Rode este script inteiro no SQL Editor do painel do Supabase
-- (Editor SQL no menu lateral) uma única vez, no projeto criado
-- na região São Paulo (sa-east-1).
--
-- Tabelas de referência (ref_operadores/ref_eventos/ref_diagnosticos)
-- guardam a linha bruta da planilha inteira em JSONB — de propósito:
-- o app já sabe achar qualquer coluna dentro dessa linha por nome
-- (ver js/utils/planilha.js -> encontrarColuna), então não precisamos
-- prever antecipadamente quais colunas existem no Base.xlsx de cada
-- empresa. "ordens"/"movimentacoes" já são tipadas porque os modelos
-- JS (OrdemServico/Movimentacao) já são fixos.

-- ---------- Referências (Base.xlsx) ----------

create table if not exists ref_operadores (
    chave text primary key,
    dados jsonb not null,
    atualizado_em timestamptz not null default now()
);

create table if not exists ref_eventos (
    chave text primary key,
    dados jsonb not null,
    atualizado_em timestamptz not null default now()
);

create table if not exists ref_diagnosticos (
    chave text primary key,
    dados jsonb not null,
    atualizado_em timestamptz not null default now()
);

-- Cadastro SEPARADO do de ref_operadores (aba própria "Coloborador
-- Responsável" na Base.xlsx, sem coluna de SETOR) — o mesmo número de
-- ID pode ser pessoas diferentes nas duas tabelas, ver
-- database/patch-08-colaborador-responsavel.sql.
create table if not exists ref_colaboradores_responsaveis (
    chave text primary key,
    dados jsonb not null,
    atualizado_em timestamptz not null default now()
);

-- ---------- Ordens de Serviço ----------

create table if not exists ordens (
    id text primary key,
    cliente text,
    login text,
    cidade text,
    bairro text,
    assunto text,
    data_abertura timestamptz,
    data_fechamento timestamptz,
    status_atual text,
    tecnico_responsavel text,
    -- Setor do técnico responsável ATUAL (não do fechamento) — usado
    -- só pra restringir leitura de usuário "terceiro" por RLS (ver
    -- perfis.setor abaixo e database/patch-06-terceiros-por-setor.sql).
    setor text,
    atualizado_em timestamptz not null default now(),
    auditoria_ia jsonb
);

create index if not exists ordens_setor_idx on ordens (setor);

create table if not exists movimentacoes (
    id bigint generated always as identity primary key,
    ordem_id text not null references ordens(id) on delete cascade,
    operador text,
    -- Quem de fato fechou a OS (ver patch-08-colaborador-responsavel.sql)
    -- — diferente do operador quando quem finaliza no sistema não é
    -- quem foi a campo. Só costuma vir preenchido no Fechamento.
    colaborador_responsavel text,
    equipe text,
    evento text,
    diagnostico text,
    -- Processo a seguir após a OS finalizar (ver
    -- patch-09-proxima-tarefa.sql) — só relevante na movimentação de
    -- Fechamento, usado pela Auditoria Operacional pra checar se o
    -- diagnóstico é coerente com o próximo passo.
    proxima_tarefa text,
    status text,
    resposta_padrao text,
    mensagem text,
    historico jsonb,
    data timestamptz
);

create index if not exists movimentacoes_ordem_id_idx on movimentacoes (ordem_id);

-- ---------- Perfis / papéis ----------
-- papel 'admin'  = importa, apaga, faz tudo
-- papel 'leitor' = só pesquisa/analisa (RLS abaixo bloqueia escrita)

create table if not exists perfis (
    id uuid primary key references auth.users(id) on delete cascade,
    papel text not null check (papel in ('admin', 'leitor')),
    -- Setor: null (padrão) = vê tudo. Preenchido = restringe leitura
    -- de ordens/movimentacoes só ao que tiver esse setor (usuário
    -- "terceiro" — LGPD, ver database/patch-06-terceiros-por-setor.sql).
    setor text,
    criado_em timestamptz not null default now()
);

-- ---------- Log de importações ----------
-- Um registro por arquivo importado (Base.xlsx ou Ordens.xlsx) — nome,
-- quem, quando, resumo. Mostrado no popup de Importar Dados.

create table if not exists logs_importacao (
    id bigint generated always as identity primary key,
    nome_arquivo text not null,
    tipo text not null check (tipo in ('base', 'ordens')),
    importado_por text,
    importado_em timestamptz not null default now(),
    estatisticas jsonb
);

create table if not exists logs_login (
    id bigint generated always as identity primary key,
    usuario_email text not null,
    logado_em timestamptz not null default now()
);

-- ==========================================================
-- Row Level Security
-- ==========================================================

alter table ref_operadores enable row level security;
alter table ref_eventos enable row level security;
alter table ref_diagnosticos enable row level security;
alter table ref_colaboradores_responsaveis enable row level security;
alter table ordens enable row level security;
alter table movimentacoes enable row level security;
alter table perfis enable row level security;
alter table logs_importacao enable row level security;
alter table logs_login enable row level security;

-- Leitura: qualquer usuário logado com papel configurado em "perfis" (admin
-- OU leitor) vê tudo. NÃO basta estar autenticado — o Supabase permite
-- autocadastro por padrão, então "to authenticated using (true)" deixaria
-- qualquer um que se cadastre direto pela API (sem passar pela nossa tela
-- de login) ler os dados, mesmo sem um admin ter liberado essa pessoa.
create policy "leitura autenticada" on ref_operadores for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
create policy "leitura autenticada" on ref_eventos for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
create policy "leitura autenticada" on ref_diagnosticos for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
create policy "leitura autenticada" on ref_colaboradores_responsaveis for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
-- ordens/movimentacoes: além de estar em "perfis", o setor do usuário
-- (se tiver algum) precisa bater com o setor da OS — null em
-- perfis.setor = sem restrição, vê tudo (comportamento de sempre).
-- Ver database/patch-06-terceiros-por-setor.sql pro motivo/detalhe.
-- ATENÇÃO: o patch-27 (setores_visao_total) substitui estas duas
-- policies — setor listado lá (ex.: CONTROLE DE OPERAÇÕES) vê todas as
-- OS. Numa instalação nova, rode o patch-27 depois deste arquivo.
create policy "leitura autenticada" on ordens for select to authenticated
    using (exists (
        select 1 from perfis p
        where p.id = auth.uid()
          and (p.setor is null or upper(p.setor) = upper(ordens.setor))
    ));
create policy "leitura autenticada" on movimentacoes for select to authenticated
    using (exists (
        select 1 from perfis p
        join ordens o on o.id = movimentacoes.ordem_id
        where p.id = auth.uid()
          and (p.setor is null or upper(p.setor) = upper(o.setor))
    ));

-- Perfis: cada usuário só enxerga o próprio papel.
create policy "leitura do proprio perfil" on perfis for select to authenticated using (id = auth.uid());

create policy "leitura autenticada" on logs_importacao for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
create policy "escrita admin" on logs_importacao for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
create policy "exclusao admin" on logs_importacao for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));

-- Logs de login: qualquer usuário autenticado insere o próprio registro
-- (admin e leitor os dois fazem login), leitura igual ao resto.
create policy "leitura autenticada" on logs_login for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
create policy "escrita autenticada" on logs_login for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid()));

-- Escrita (insert/update/delete): só quem tem papel 'admin' na tabela perfis.
create policy "escrita admin" on ref_operadores for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
create policy "atualizacao admin" on ref_operadores for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
create policy "exclusao admin" on ref_operadores for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));

create policy "escrita admin" on ref_eventos for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
create policy "atualizacao admin" on ref_eventos for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
create policy "exclusao admin" on ref_eventos for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));

create policy "escrita admin" on ref_diagnosticos for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
create policy "atualizacao admin" on ref_diagnosticos for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
create policy "exclusao admin" on ref_diagnosticos for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));

create policy "escrita admin" on ref_colaboradores_responsaveis for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
create policy "atualizacao admin" on ref_colaboradores_responsaveis for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
create policy "exclusao admin" on ref_colaboradores_responsaveis for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));

create policy "escrita admin" on ordens for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
create policy "atualizacao admin" on ordens for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
create policy "exclusao admin" on ordens for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));

create policy "escrita admin" on movimentacoes for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
create policy "atualizacao admin" on movimentacoes for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
create policy "exclusao admin" on movimentacoes for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));

-- ==========================================================
-- Depois de rodar este script:
-- 1. Vá em Authentication -> Users -> Add user (ou Invite) e crie sua
--    própria conta (e-mail + senha).
-- 2. Copie o UUID desse usuário (aparece na lista de Users).
-- 3. Rode o comando abaixo, TROCANDO o UUID, pra virar admin:
--
--    insert into perfis (id, papel) values ('53877fb0-39fa-47ca-be6e-f7794ddccc13', 'admin');
--
-- 4. Pra criar um usuário "leitor" depois, repita os passos 1-3 com
--    papel = 'leitor' em vez de 'admin'.
-- 5. Pra criar um usuário "terceiro" (leitor restrito a 1 setor —
--    LGPD, só enxerga as OS desse setor), repita os passos 1-2 e rode:
--
--    insert into perfis (id, papel, setor)
--    values ('COLE-O-UUID-AQUI', 'leitor', 'NOME EXATO DO SETOR');
--
--    O nome do setor tem que bater com o que aparece no Filtro Global
--    > Setor do app (copie de lá pra evitar erro de acentuação).
-- ==========================================================

-- ======================================================
-- >>> database/patch-01-rls-leitura.sql
-- ======================================================
-- ==========================================================
-- Patch de segurança #1 — leitura exige papel em "perfis"
-- ==========================================================
-- Rode isso no SQL Editor do Supabase se você já rodou o
-- schema-supabase.sql original antes desse ajuste.
--
-- Problema: as políticas de leitura ("leitura autenticada") liberavam
-- SELECT pra qualquer usuário autenticado, sem checar se ele tem uma
-- linha em "perfis". Como o Supabase permite autocadastro por padrão,
-- alguém poderia criar uma conta direto pela API do Supabase (sem
-- passar pela tela de login do app) e ler todos os dados — mesmo sem
-- nenhum admin ter liberado essa pessoa.
--
-- Fix: troca "using (true)" por uma checagem de que o usuário
-- realmente tem papel configurado (admin OU leitor).

drop policy if exists "leitura autenticada" on ref_operadores;
create policy "leitura autenticada" on ref_operadores for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));

drop policy if exists "leitura autenticada" on ref_eventos;
create policy "leitura autenticada" on ref_eventos for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));

drop policy if exists "leitura autenticada" on ref_diagnosticos;
create policy "leitura autenticada" on ref_diagnosticos for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));

drop policy if exists "leitura autenticada" on ordens;
create policy "leitura autenticada" on ordens for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));

drop policy if exists "leitura autenticada" on movimentacoes;
create policy "leitura autenticada" on movimentacoes for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));

-- ==========================================================
-- Depois de rodar isso, vá também em Authentication -> Sign In / Providers
-- (ou "Auth Settings") e DESATIVE "Allow new users to sign up" —
-- reforço extra pra ninguém conseguir criar conta sozinho, nem que essa
-- política falhasse por algum motivo no futuro.
-- ==========================================================

-- ======================================================
-- >>> database/patch-02-auditoria-ia.sql
-- ======================================================
-- ==========================================================
-- Patch #2 — coluna pro resultado do Auditor IA
-- ==========================================================
-- Rode no SQL Editor do Supabase. Guarda o veredito estruturado
-- (veredito/justificativa/avaliadoEm) que a Edge Function
-- "auditor-ia" grava depois de avaliar uma OS. Null = OS ainda
-- não avaliada.
--
-- Não precisa de política de RLS nova: a Edge Function usa a
-- service_role key (que ignora RLS) pra gravar, depois de ela
-- mesma checar que quem chamou é admin. A LEITURA desse campo já
-- está coberta pela política "leitura autenticada" que já existe
-- na tabela ordens (qualquer usuário com papel em "perfis").

alter table ordens add column if not exists auditoria_ia jsonb;

-- ======================================================
-- >>> database/patch-03-logs-importacao.sql
-- ======================================================
-- ==========================================================
-- Patch #3 — log de arquivos importados
-- ==========================================================
-- Rode no SQL Editor do Supabase. Guarda um registro por
-- importação (Base.xlsx ou Ordens.xlsx) — nome do arquivo, quem
-- importou, quando, e um resumo (linhas/ordens/movimentações).
-- Mostrado no popup de Importar Dados, em "Arquivos no banco".

create table if not exists logs_importacao (
    id bigint generated always as identity primary key,
    nome_arquivo text not null,
    tipo text not null check (tipo in ('base', 'ordens')),
    importado_por text,
    importado_em timestamptz not null default now(),
    estatisticas jsonb
);

alter table logs_importacao enable row level security;

create policy "leitura autenticada" on logs_importacao for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));

create policy "escrita admin" on logs_importacao for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));

-- ======================================================
-- >>> database/patch-04-logs-login.sql
-- ======================================================
-- ==========================================================
-- Patch #4 — log de logins
-- ==========================================================
-- Rode no SQL Editor do Supabase. Guarda um registro por login
-- bem-sucedido (quem, quando) — mostrado no popup de Logs, aba
-- "Logins". Diferente de logs_importacao: qualquer usuário
-- autenticado (admin ou leitor) pode inserir aqui, porque
-- qualquer um dos dois faz login — não é uma ação restrita.

create table if not exists logs_login (
    id bigint generated always as identity primary key,
    usuario_email text not null,
    logado_em timestamptz not null default now()
);

alter table logs_login enable row level security;

create policy "leitura autenticada" on logs_login for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));

create policy "escrita autenticada" on logs_login for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid()));

-- ======================================================
-- >>> database/patch-05-limpeza-duplicatas-movimentacoes.sql
-- ======================================================
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

-- ======================================================
-- >>> database/patch-06-terceiros-por-setor.sql
-- ======================================================
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

-- ======================================================
-- >>> database/patch-07-limpeza-duplicatas-movimentacoes-v2.sql
-- ======================================================
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

-- ======================================================
-- >>> database/patch-08-colaborador-responsavel.sql
-- ======================================================
-- ==========================================================
-- Patch #8 — Colaborador Responsável (quem de fato fechou a OS)
-- ==========================================================
-- Rode no SQL Editor do Supabase.
--
-- Nova coluna "COLABORADOR RESPONSAVEL" na planilha de Ordens: o
-- OPERADOR de uma movimentação é quem executou aquela ação no sistema
-- (deslocamento, execução, agendamento, reagendamento...), mas no
-- Fechamento isso podia ser outro colaborador — o operador fecha a OS
-- em nome de quem realmente foi a campo. Colaborador Responsável é
-- esse ID e passa a ser o crédito de "quem finalizou a OS" em todo o
-- sistema (ranking, TMS/TMA/TMR/TME por técnico, recorrência por
-- técnico, Filtro Global — ver IndicatorEngine.nomeResponsavelFechamento),
-- com fallback pro operador só em fechamentos antigos, de antes dessa
-- coluna existir na planilha.
--
-- IMPORTANTE: esse ID é resolvido por uma aba PRÓPRIA da Base.xlsx
-- ("Coloborador Responsável" — esse erro de digitação mesmo, ver
-- ReferenceEngine.carregar), NÃO pela aba Operadores — são cadastros
-- SEPARADOS: o mesmo número de ID é pessoas diferentes nas duas abas
-- (conferido em dados reais: das ~640 pessoas de Colaborador
-- Responsável, ~340 coincidem numericamente com algum ID de Operador,
-- mas só 1 delas é de fato a mesma pessoa/nome). Por isso a tabela
-- nova abaixo, em vez de reaproveitar ref_operadores.
-- Essa aba também não tem coluna de SETOR — setor de acesso por RLS
-- (ordens.setor) e o agrupamento "por setor" dos indicadores
-- continuam vindo do Operador, não do Colaborador Responsável.

alter table movimentacoes add column if not exists colaborador_responsavel text;

create table if not exists ref_colaboradores_responsaveis (
    chave text primary key,
    dados jsonb not null,
    atualizado_em timestamptz not null default now()
);

alter table ref_colaboradores_responsaveis enable row level security;

create policy "leitura autenticada" on ref_colaboradores_responsaveis for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
create policy "escrita admin" on ref_colaboradores_responsaveis for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
create policy "atualizacao admin" on ref_colaboradores_responsaveis for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
create policy "exclusao admin" on ref_colaboradores_responsaveis for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));

-- ======================================================
-- >>> database/patch-09-proxima-tarefa.sql
-- ======================================================
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

-- ======================================================
-- >>> database/patch-10-exclusao-logs-importacao.sql
-- ======================================================
-- ==========================================================
-- Patch #10 — falta política de exclusão em logs_importacao
-- ==========================================================
-- Rode no SQL Editor do Supabase.
--
-- limparDadosImportados() (botão "Limpar dados") sempre tentou apagar
-- logs_importacao junto com as outras tabelas, mas essa tabela nunca
-- teve uma política de RLS pra DELETE — só leitura e inserção. Com
-- RLS ativado e sem política de exclusão, o Postgres bloqueia o
-- delete silenciosamente (0 linhas afetadas, sem erro nenhum) — por
-- isso "Limpar dados" parecia funcionar mas os logs antigos (Arquivo/
-- Tipo/Resumo/Quem/Quando) continuavam aparecendo no popup de
-- Importar Dados depois de limpar. Todas as outras tabelas (ref_*,
-- ordens, movimentacoes) já tinham essa política — só faltava aqui.

create policy "exclusao admin" on logs_importacao for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));

-- ======================================================
-- >>> database/patch-11-papel-editor.sql
-- ======================================================
-- ==========================================================
-- Patch #11 — papel intermediário "editor"
-- ==========================================================
-- Rode no SQL Editor do Supabase.
--
-- Até aqui só existiam dois papéis: "admin" (importa, apaga dados
-- compartilhados, vê Logs de Importação, roda o Auditor IA) e "leitor"
-- (só enxerga, nenhuma escrita). Este patch adiciona "editor": pode
-- IMPORTAR dados (Base/Ordens) e ver o card de Diagnósticos Não
-- Resolvidos, igual admin — mas NÃO pode apagar os dados compartilhados
-- ("Limpar Dados") nem ver os Logs de Importação, que continuam só
-- admin (ver js/ui/login.js -> aplicarGateDePapel e
-- js/services/auth.js -> podeImportar/ehAdmin).
--
-- 1) Permite "editor" na coluna perfis.papel.

alter table perfis drop constraint if exists perfis_papel_check;
alter table perfis add constraint perfis_papel_check check (papel in ('admin', 'editor', 'leitor'));

-- 2) Escrita (insert/update) nas tabelas de importação passa a aceitar
-- admin OU editor — exclusão ("exclusao admin", patches anteriores e
-- schema-supabase.sql) continua SEM alteração, só admin.

drop policy if exists "escrita admin" on ref_operadores;
create policy "escrita admin ou editor" on ref_operadores for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));
drop policy if exists "atualizacao admin" on ref_operadores;
create policy "atualizacao admin ou editor" on ref_operadores for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

drop policy if exists "escrita admin" on ref_eventos;
create policy "escrita admin ou editor" on ref_eventos for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));
drop policy if exists "atualizacao admin" on ref_eventos;
create policy "atualizacao admin ou editor" on ref_eventos for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

drop policy if exists "escrita admin" on ref_diagnosticos;
create policy "escrita admin ou editor" on ref_diagnosticos for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));
drop policy if exists "atualizacao admin" on ref_diagnosticos;
create policy "atualizacao admin ou editor" on ref_diagnosticos for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

drop policy if exists "escrita admin" on ref_colaboradores_responsaveis;
create policy "escrita admin ou editor" on ref_colaboradores_responsaveis for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));
drop policy if exists "atualizacao admin" on ref_colaboradores_responsaveis;
create policy "atualizacao admin ou editor" on ref_colaboradores_responsaveis for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

drop policy if exists "escrita admin" on ordens;
create policy "escrita admin ou editor" on ordens for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));
drop policy if exists "atualizacao admin" on ordens;
create policy "atualizacao admin ou editor" on ordens for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

drop policy if exists "escrita admin" on movimentacoes;
create policy "escrita admin ou editor" on movimentacoes for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));
drop policy if exists "atualizacao admin" on movimentacoes;
create policy "atualizacao admin ou editor" on movimentacoes for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

-- logs_importacao: cada importação (de admin OU editor) grava 1 linha
-- aqui (ver armazenamento.js -> registrarLogImportacao) — sem isso, a
-- RLS bloquearia silenciosamente o log de toda importação feita por um
-- editor. A LEITURA dessa tabela já não muda (qualquer autenticado com
-- perfil já lê, ver schema-supabase.sql) — o card em si só some da UI
-- pra quem não é admin (aplicarGateDePapel).
drop policy if exists "escrita admin" on logs_importacao;
create policy "escrita admin ou editor" on logs_importacao for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

-- ==========================================================
-- Pra criar um usuário "editor":
-- 1. Authentication -> Users -> Add user (e-mail + senha), como já
--    fazia pra admin/leitor.
-- 2. Copie o UUID do usuário.
-- 3. Rode, trocando o UUID:
--
--    insert into perfis (id, papel) values ('COLE-O-UUID-AQUI', 'editor');
-- ==========================================================

-- ======================================================
-- >>> database/patch-12-auditoria-correcoes.sql
-- ======================================================
-- ==========================================================
-- Patch #12 — correções manuais de achados da Auditoria Operacional
-- ==========================================================
-- Rode no SQL Editor do Supabase.
--
-- Um achado da Auditoria (Diagnóstico x Próxima Tarefa incompatível,
-- Próxima Tarefa ausente, Diagnóstico ausente, Duplicidade) às vezes já
-- foi corrigido NO SISTEMA DE ORIGEM (reabertura pra acertar o processo)
-- antes de alguém rodar a Auditoria de novo aqui — nesse caso o achado
-- continua aparecendo (o 1º Fechamento, que é o que a Auditoria audita,
-- não muda), mesmo já estando resolvido de verdade. Esta tabela guarda
-- uma marca manual e COMPARTILHADA de "já corrigido" por achado, pra
-- não confundir isso com pendência real.
--
-- Chave é (ordem_id, tipo_achado) — uma OS pode ter mais de um tipo de
-- achado ao mesmo tempo (ex.: "inconsistencia" e "duplicidade"), cada
-- um se marca separado.

create table if not exists auditoria_correcoes (
    id bigint generated always as identity primary key,
    ordem_id text not null references ordens(id) on delete cascade,
    tipo_achado text not null,
    corrigido_por text,
    corrigido_em timestamptz not null default now(),
    unique (ordem_id, tipo_achado)
);

create index if not exists auditoria_correcoes_ordem_id_idx on auditoria_correcoes (ordem_id);

alter table auditoria_correcoes enable row level security;

-- Leitura/escrita liberada pra QUALQUER usuário autenticado com papel em
-- "perfis" (admin, editor OU leitor) — diferente do resto do sistema,
-- onde leitor nunca escreve nada. É uma marcação leve e reversível (não
-- apaga nem altera nenhum dado importado), então não faz sentido travar
-- atrás de admin/editor só isso.
create policy "leitura autenticada" on auditoria_correcoes for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
create policy "escrita qualquer perfil" on auditoria_correcoes for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid()));
create policy "atualizacao qualquer perfil" on auditoria_correcoes for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
create policy "exclusao qualquer perfil" on auditoria_correcoes for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));

-- ======================================================
-- >>> database/patch-13-bot-pendencias.sql
-- ======================================================
-- ==========================================================
-- Patch 13: Bot de Pendências (cobrança de menções no WhatsApp)
-- ==========================================================
-- O chip do bot fica nos grupos (via Evolution API). Toda mensagem
-- chega na Edge Function "bot-pendencias", que registra quando os
-- números de Auxiliares/Assistentes são marcados e quando respondem.
-- O pg_cron chama a mesma function a cada minuto pra cobrar no grupo
-- "Pendencias" o que passou de 5 min sem resposta (só no expediente).
--
-- Só a Edge Function (service_role) mexe nessas tabelas — RLS ligada
-- e sem policies = ninguém do app lê/escreve por engano.
--
-- Rode no SQL Editor do Supabase. O PASSO 2 (agendamento) fica no
-- fim do arquivo e só deve ser rodado depois do deploy da function.

-- ---------- PASSO 1: tabelas ----------

create table if not exists bot_config (
    id                  int primary key default 1 check (id = 1),
    grupo_cobranca_jid  text,                       -- preenchido pelo comando "!pendencias" no grupo
    hora_inicio         int  not null default 7,    -- expediente (horário de Brasília)
    hora_fim            int  not null default 18,
    dias_semana         int[] not null default '{1,2,3,4,5,6}', -- 0=dom ... 6=sáb
    intervalo_min       int  not null default 5
);
insert into bot_config (id) values (1) on conflict (id) do nothing;

create table if not exists bot_monitorados (
    numero  text primary key,   -- só dígitos, com 55 + DDD
    rotulo  text not null,      -- como aparece no alerta
    lid     text                -- id interno do WhatsApp (@lid), aprendido sozinho
);
insert into bot_monitorados (numero, rotulo) values
    ('5522981392343', 'AUXILIARES'),
    ('5522981376625', 'ASSISTENTES')
on conflict (numero) do nothing;

create table if not exists bot_grupos (
    jid           text primary key,
    nome          text,
    atualizado_em timestamptz not null default now()
);

create table if not exists bot_pendencias (
    id               bigint generated always as identity primary key,
    grupo_jid        text not null,
    mensagem_id      text not null,
    numero           text not null references bot_monitorados(numero),
    autor_nome       text,
    texto            text,
    mencionado_em    timestamptz not null,
    respondido_em    timestamptz,
    alertas_enviados int not null default 0,
    ultimo_alerta_em timestamptz,
    unique (grupo_jid, mensagem_id, numero)
);
create index if not exists bot_pendencias_abertas
    on bot_pendencias (grupo_jid, numero) where respondido_em is null;

alter table bot_config      enable row level security;
alter table bot_monitorados enable row level security;
alter table bot_grupos      enable row level security;
alter table bot_pendencias  enable row level security;


-- ---------- PASSO 2: agendamento (rodar DEPOIS do deploy) ----------
-- Troque TROQUE_PELO_TOKEN pelo mesmo valor do secret BOT_TOKEN.
--
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
--
-- select cron.schedule(
--     'bot-pendencias-verificar',
--     '* * * * *',
--     $$
--     select net.http_post(
--         url     := 'https://ldpiitymhvdhemdrntlx.supabase.co/functions/v1/bot-pendencias?acao=verificar&token=TROQUE_PELO_TOKEN',
--         headers := '{"Content-Type": "application/json"}'::jsonb,
--         body    := '{}'::jsonb
--     );
--     $$
-- );
--
-- Pra desligar: select cron.unschedule('bot-pendencias-verificar');

-- ======================================================
-- >>> database/patch-14-escala-tecnicos.sql
-- ======================================================
-- ==========================================================
-- Patch 14: Escala de Técnicos (escala.html)
-- ==========================================================
-- Guarda o array inteiro de técnicos/horários/exceções como um único JSONB
-- (igual ao padrão de ref_operadores etc.) — o app já sabe ler essa
-- estrutura, não precisamos relacionalizar nada aqui.
--
-- Leitura: qualquer usuário autenticado com papel em "perfis" (admin,
-- editor ou leitor) — igual ao resto do COP Analytics.
-- Escrita: só papel 'admin' (ver escala.html).

create table if not exists escala_tecnicos_dados (
    id text primary key default 'default',
    dados jsonb not null,
    atualizado_em timestamptz not null default now()
);

alter table escala_tecnicos_dados enable row level security;

-- Supersede versões anteriores desta tabela (rascunhos de quando a escala
-- ainda era um site à parte, com leitura aberta a qualquer um com o link):
drop policy if exists "leitura publica" on escala_tecnicos_dados;
drop policy if exists "escrita publica" on escala_tecnicos_dados;
drop policy if exists "atualizacao publica" on escala_tecnicos_dados;
drop policy if exists "escrita autenticada" on escala_tecnicos_dados;
drop policy if exists "atualizacao autenticada" on escala_tecnicos_dados;

create policy "leitura autenticada" on escala_tecnicos_dados for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));

create policy "escrita admin" on escala_tecnicos_dados for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
create policy "atualizacao admin" on escala_tecnicos_dados for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
create policy "exclusao admin" on escala_tecnicos_dados for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));

-- ======================================================
-- >>> database/patch-15-inicio-e-agenda.sql
-- ======================================================
-- ==========================================================
-- Patch 15: Tela inicial (nome do usuário) e Agenda do dia
-- ==========================================================
-- 1) perfis.nome: nome de exibição ("Bom dia, Murillo") e também o nome
--    usado pra achar o operador do usuário nas OS (produção do mês). Use
--    o nome como está no sistema de OS (aba Operadores da Base.xlsx).
--    Vazio = o app usa o começo do e-mail.
--
-- 2) agenda_publicada: o pré-agendamento (agendador.html) publica o plano
--    de um dia aqui; a tela "Agenda do dia" do COP Analytics lê. Um JSONB
--    por data, igual ao padrão de escala_tecnicos_dados.
--    Leitura: qualquer usuário com papel em "perfis". Escrita: só admin.

alter table perfis add column if not exists nome text;

create table if not exists agenda_publicada (
    data date primary key,
    itens jsonb not null,          -- uma linha por parada (técnico, horário, OS, cliente...)
    resumo jsonb,                  -- totais pro cabeçalho (OS agendadas, sem técnico, técnicos)
    publicado_por text,
    atualizado_em timestamptz not null default now()
);

alter table agenda_publicada enable row level security;

drop policy if exists "leitura autenticada" on agenda_publicada;
drop policy if exists "escrita admin" on agenda_publicada;
drop policy if exists "atualizacao admin" on agenda_publicada;
drop policy if exists "exclusao admin" on agenda_publicada;

create policy "leitura autenticada" on agenda_publicada for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));

create policy "escrita admin" on agenda_publicada for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
create policy "atualizacao admin" on agenda_publicada for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
create policy "exclusao admin" on agenda_publicada for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));

-- ======================================================
-- >>> database/patch-16-admin-usuarios.sql
-- ======================================================
-- ==========================================================
-- Patch 16: Painel de Administrador — gestão de usuários
-- ==========================================================
-- A tela Usuários (js/ui/adminusuarios.js) lista quem tem conta e muda
-- papel, nome e setor sem precisar do SQL Editor.
--
-- Por que funções e não policies: "perfis" só deixa cada um ler a
-- própria linha, e o e-mail mora em auth.users, que o navegador não
-- lê. As funções rodam como dono (security definer) e cada uma confere
-- antes de tudo se QUEM CHAMA é admin.
--
-- Criar a conta (e-mail + senha) continua no Supabase:
-- Authentication > Users > Add user. A conta nova aparece na tela como
-- "sem acesso" até um admin dar um papel.
--
-- Travas: ninguém tira o próprio admin nem remove o próprio acesso —
-- assim sempre sobra pelo menos um admin (quem está mexendo).

create or replace function admin_listar_usuarios()
returns table (
    id uuid,
    email text,
    nome text,
    papel text,
    setor text,
    criado_em timestamptz,
    ultimo_acesso timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
#variable_conflict use_column
begin
    if not exists (select 1 from public.perfis p where p.id = auth.uid() and p.papel = 'admin') then
        raise exception 'Só administradores podem ver os usuários.';
    end if;

    return query
        select u.id, u.email::text, p.nome, p.papel, p.setor, u.created_at, u.last_sign_in_at
        from auth.users u
        left join public.perfis p on p.id = u.id
        order by (p.papel is null), lower(coalesce(p.nome, u.email::text));
end
$$;

create or replace function admin_salvar_usuario(p_id uuid, p_papel text, p_nome text, p_setor text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
    if not exists (select 1 from public.perfis p where p.id = auth.uid() and p.papel = 'admin') then
        raise exception 'Só administradores podem alterar usuários.';
    end if;

    if p_papel not in ('admin', 'editor', 'leitor') then
        raise exception 'Papel inválido: %', p_papel;
    end if;

    if p_id = auth.uid() and p_papel <> 'admin' then
        raise exception 'Você não pode tirar o seu próprio acesso de administrador.';
    end if;

    if not exists (select 1 from auth.users u where u.id = p_id) then
        raise exception 'Usuário não encontrado.';
    end if;

    insert into public.perfis (id, papel, nome, setor)
    values (p_id, p_papel, nullif(trim(p_nome), ''), nullif(trim(p_setor), ''))
    on conflict (id) do update
        set papel = excluded.papel,
            nome = excluded.nome,
            setor = excluded.setor;
end
$$;

create or replace function admin_remover_acesso(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
    if not exists (select 1 from public.perfis p where p.id = auth.uid() and p.papel = 'admin') then
        raise exception 'Só administradores podem remover acesso.';
    end if;

    if p_id = auth.uid() then
        raise exception 'Você não pode remover o seu próprio acesso.';
    end if;

    -- Só tira a linha de "perfis": a conta continua existindo, mas sem
    -- papel não entra no COP (ver js/services/auth.js).
    delete from public.perfis where id = p_id;
end
$$;

revoke all on function admin_listar_usuarios() from public, anon;
revoke all on function admin_salvar_usuario(uuid, text, text, text) from public, anon;
revoke all on function admin_remover_acesso(uuid) from public, anon;

grant execute on function admin_listar_usuarios() to authenticated;
grant execute on function admin_salvar_usuario(uuid, text, text, text) to authenticated;
grant execute on function admin_remover_acesso(uuid) to authenticated;

-- ======================================================
-- >>> database/patch-17-editor-escala-agenda-limpeza.sql
-- ======================================================
-- ==========================================================
-- Patch 17: editor também edita escala, publica agenda e apaga dados
-- ==========================================================
-- Até aqui essas três coisas eram só admin. Passam a aceitar admin OU
-- editor:
--   1) editar a escala (escala_tecnicos_dados — patch-14);
--   2) publicar a agenda do dia pelo pré-agendamento (agenda_publicada
--      — patch-15);
--   3) apagar os dados compartilhados ("Limpar dados") e os logs de
--      importação — as policies de exclusão das tabelas importadas.
--      (Ler os logs já era liberado pra qualquer perfil; o botão é que
--      ficava escondido.)
--
-- Continua SÓ admin: Painel de Administrador / usuários (patch-16) e
-- rodar o Auditor IA.

-- 1) Escala
drop policy if exists "escrita admin" on escala_tecnicos_dados;
drop policy if exists "atualizacao admin" on escala_tecnicos_dados;
drop policy if exists "exclusao admin" on escala_tecnicos_dados;
drop policy if exists "escrita admin ou editor" on escala_tecnicos_dados;
drop policy if exists "atualizacao admin ou editor" on escala_tecnicos_dados;
drop policy if exists "exclusao admin ou editor" on escala_tecnicos_dados;

create policy "escrita admin ou editor" on escala_tecnicos_dados for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));
create policy "atualizacao admin ou editor" on escala_tecnicos_dados for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));
create policy "exclusao admin ou editor" on escala_tecnicos_dados for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

-- 2) Agenda publicada
drop policy if exists "escrita admin" on agenda_publicada;
drop policy if exists "atualizacao admin" on agenda_publicada;
drop policy if exists "exclusao admin" on agenda_publicada;
drop policy if exists "escrita admin ou editor" on agenda_publicada;
drop policy if exists "atualizacao admin ou editor" on agenda_publicada;
drop policy if exists "exclusao admin ou editor" on agenda_publicada;

create policy "escrita admin ou editor" on agenda_publicada for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));
create policy "atualizacao admin ou editor" on agenda_publicada for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));
create policy "exclusao admin ou editor" on agenda_publicada for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

-- 3) Exclusão dos dados importados e dos logs de importação
drop policy if exists "exclusao admin" on ordens;
drop policy if exists "exclusao admin ou editor" on ordens;
create policy "exclusao admin ou editor" on ordens for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

drop policy if exists "exclusao admin" on movimentacoes;
drop policy if exists "exclusao admin ou editor" on movimentacoes;
create policy "exclusao admin ou editor" on movimentacoes for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

drop policy if exists "exclusao admin" on ref_operadores;
drop policy if exists "exclusao admin ou editor" on ref_operadores;
create policy "exclusao admin ou editor" on ref_operadores for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

drop policy if exists "exclusao admin" on ref_eventos;
drop policy if exists "exclusao admin ou editor" on ref_eventos;
create policy "exclusao admin ou editor" on ref_eventos for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

drop policy if exists "exclusao admin" on ref_diagnosticos;
drop policy if exists "exclusao admin ou editor" on ref_diagnosticos;
create policy "exclusao admin ou editor" on ref_diagnosticos for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

drop policy if exists "exclusao admin" on ref_colaboradores_responsaveis;
drop policy if exists "exclusao admin ou editor" on ref_colaboradores_responsaveis;
create policy "exclusao admin ou editor" on ref_colaboradores_responsaveis for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

drop policy if exists "exclusao admin" on logs_importacao;
drop policy if exists "exclusao admin ou editor" on logs_importacao;
create policy "exclusao admin ou editor" on logs_importacao for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

-- ======================================================
-- >>> database/patch-18-garante-papel-editor.sql
-- ======================================================
-- ==========================================================
-- Patch 18: garante o papel "editor" (refaz o patch-11 com segurança)
-- ==========================================================
-- Sintoma: salvar um usuário como Editor dava
--   new row for relation "perfis" violates check constraint "perfis_papel_check"
-- ou seja, o patch-11 não tinha sido aplicado neste banco: a coluna
-- papel só aceitava admin/leitor, e a importação feita por editor
-- seria recusada.
--
-- Pode rodar quantas vezes quiser: cada policy é apagada (pelos dois
-- nomes possíveis) antes de ser criada de novo.

-- 1) Coluna papel aceita editor.
alter table perfis drop constraint if exists perfis_papel_check;
alter table perfis add constraint perfis_papel_check check (papel in ('admin', 'editor', 'leitor'));

-- 2) Importação (insert/update) por admin ou editor.
do $$
declare
    tabela text;
begin
    foreach tabela in array array[
        'ref_operadores', 'ref_eventos', 'ref_diagnosticos', 'ref_colaboradores_responsaveis',
        'ordens', 'movimentacoes'
    ] loop
        execute format('drop policy if exists "escrita admin" on %I', tabela);
        execute format('drop policy if exists "escrita admin ou editor" on %I', tabela);
        execute format('drop policy if exists "atualizacao admin" on %I', tabela);
        execute format('drop policy if exists "atualizacao admin ou editor" on %I', tabela);

        execute format($p$create policy "escrita admin ou editor" on %I for insert to authenticated
            with check (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')))$p$, tabela);
        execute format($p$create policy "atualizacao admin ou editor" on %I for update to authenticated
            using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')))$p$, tabela);
    end loop;
end
$$;

-- 3) Log de cada importação (insert) por admin ou editor.
drop policy if exists "escrita admin" on logs_importacao;
drop policy if exists "escrita admin ou editor" on logs_importacao;
create policy "escrita admin ou editor" on logs_importacao for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

-- ======================================================
-- >>> database/patch-19-gestao-terceiras.sql
-- ======================================================
-- ==========================================================
-- Patch 19: Gestão de Terceiras (LPU + fechamento mensal)
-- ==========================================================
-- 1) terceiras_config: uma linha só (id 'default'), igual ao padrão da
--    escala. Guarda
--      lpu          -> { "ASSUNTO": { "AZUL": 85, "VELOZ": 80, ... } }
--                      (sem valor = sem preço/pendência; 0 = não paga)
--      diagnosticos -> { "DIAGNÓSTICO": true|false }  (produtivo?)
--    Editada na aba LPU (js/ui/terceiras.js).
--
-- 2) terceiras_fechamentos: o mês "congelado" de cada terceirizada.
--    Ao fechar, grava o total e a lista de OS pagas daquele momento;
--    reimportar dados depois não muda o que foi aprovado. Reabrir
--    (apagar o fechamento) é só admin.
--
-- Leitura: qualquer perfil. Escrita: admin ou editor.

create table if not exists terceiras_config (
    id text primary key default 'default',
    lpu jsonb not null default '{}'::jsonb,
    diagnosticos jsonb not null default '{}'::jsonb,
    atualizado_por text,
    atualizado_em timestamptz not null default now()
);

create table if not exists terceiras_fechamentos (
    mes text not null,              -- 'AAAA-MM'
    terceira text not null,         -- 'AZUL' | 'VELOZ' | 'TECHNOMAIS'
    total numeric(12, 2) not null,
    resumo jsonb,                   -- contagens e subtotais por assunto
    itens jsonb not null,           -- uma linha por OS do mês (paga ou não, com o motivo)
    aprovado_por text,
    aprovado_em timestamptz not null default now(),
    primary key (mes, terceira)
);

alter table terceiras_config enable row level security;
alter table terceiras_fechamentos enable row level security;

drop policy if exists "leitura autenticada" on terceiras_config;
drop policy if exists "escrita admin ou editor" on terceiras_config;
drop policy if exists "atualizacao admin ou editor" on terceiras_config;

create policy "leitura autenticada" on terceiras_config for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
create policy "escrita admin ou editor" on terceiras_config for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));
create policy "atualizacao admin ou editor" on terceiras_config for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

drop policy if exists "leitura autenticada" on terceiras_fechamentos;
drop policy if exists "escrita admin ou editor" on terceiras_fechamentos;
drop policy if exists "atualizacao admin ou editor" on terceiras_fechamentos;
drop policy if exists "exclusao admin" on terceiras_fechamentos;

create policy "leitura autenticada" on terceiras_fechamentos for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
create policy "escrita admin ou editor" on terceiras_fechamentos for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));
create policy "atualizacao admin ou editor" on terceiras_fechamentos for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));
create policy "exclusao admin" on terceiras_fechamentos for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));

-- ======================================================
-- >>> database/patch-20-os-pendentes.sql
-- ======================================================
-- ==========================================================
-- Patch #20 — OS pendentes (pré-agendamento)
-- ==========================================================
-- Rode no SQL Editor do Supabase. Guarda um RETRATO atual das OS
-- em aberto (visão "PRÉ AGENDAMENTO" do Query Builder do IXC: OS
-- abertas no ano, dos setores de campo, com status <> Finalizada).
--
-- Quem grava é o robô (C:\cop-robo\robo.js), de hora em hora, usando
-- a chave service_role — ele APAGA tudo e reinsere o retrato novo a
-- cada rodada (as OS que já foram agendadas/fechadas somem sozinhas).
-- Cada linha é um evento/movimentação, no MESMO formato do .xlsx que o
-- Agendador já lê (colunas "ID OS", "CLIENTE", "BAIRRO", "LATITUDE"...),
-- guardado em JSONB — por isso o Agendador consegue usar sem conversão.

create table if not exists os_pendentes (
    id bigint generated always as identity primary key,
    dados jsonb not null,
    capturado_em timestamptz not null default now()
);

alter table os_pendentes enable row level security;

-- Leitura: qualquer usuário autenticado (o Agendador roda logado).
create policy "leitura autenticada" on os_pendentes for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));

-- Escrita fica só com a service_role (o robô), que ignora a RLS — por
-- isso NÃO criamos policy de insert/delete pra usuário comum.

-- ======================================================
-- >>> database/patch-21-robo-comandos.sql
-- ======================================================
-- ==========================================================
-- Patch #21 — comandos pro robô (atualizar sob demanda)
-- ==========================================================
-- Rode no SQL Editor do Supabase. Fila de comandos que o site manda
-- pro robô (C:\cop-robo\robo.js). O botão "Atualizar banco" (só admin/
-- editor) insere um comando 'pendente'; o robô, que fica checando esta
-- tabela a cada ~30s, abre o IXC, atualiza ordens + os_pendentes e marca
-- 'concluido' (ou 'erro'). O site acompanha o status pra dar o retorno.

create table if not exists robo_comandos (
    id bigint generated always as identity primary key,
    tipo text not null default 'atualizar',
    solicitado_por text,
    solicitado_em timestamptz not null default now(),
    status text not null default 'pendente' check (status in ('pendente', 'processando', 'concluido', 'erro')),
    processado_em timestamptz,
    resultado jsonb
);

create index if not exists robo_comandos_status_idx on robo_comandos (status, solicitado_em);

alter table robo_comandos enable row level security;

-- Leitura: qualquer autenticado (o site precisa acompanhar o status).
create policy "leitura autenticada" on robo_comandos for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));

-- Só admin/editor pode PEDIR uma atualização.
create policy "pedido admin/editor" on robo_comandos for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

-- Quem atualiza o status é o robô (service_role), que ignora a RLS — por
-- isso não há policy de update/delete pra usuário comum.

-- ======================================================
-- >>> database/patch-23-os-pendentes-id-by-default.sql
-- ======================================================
-- ==========================================================
-- Patch #23 — os_pendentes.id: GENERATED ALWAYS -> BY DEFAULT
-- ==========================================================
-- Rode no SQL Editor do Supabase.
--
-- Bug: a gravação INCREMENTAL do robô (de hora em hora) faz um upsert
-- das linhas já existentes (POST os_pendentes?on_conflict=id,
-- resolution=merge-duplicates) mandando o "id" da linha. Como a coluna
-- "id" era GENERATED ALWAYS, o Postgres recusa o id explícito:
--   428C9: cannot insert a non-DEFAULT value into column "id"
--          Column "id" is an identity column defined as GENERATED ALWAYS.
-- O lote inteiro falha com 400 e aborta ANTES de inserir as linhas novas,
-- então a os_pendentes parava de atualizar depois do retrato do dia (o
-- retrato completo funciona porque insere SEM id).
--
-- Correção: deixar a identidade como GENERATED BY DEFAULT — aceita id
-- explícito no upsert (update das existentes) e continua gerando sozinho
-- quando o id é omitido (inserts das novas e do retrato completo).

alter table os_pendentes alter column id set generated by default;

-- ======================================================
-- >>> database/patch-24-ctos-lacres.sql
-- ======================================================
-- ==========================================================
-- Patch 24: Gestão de Clientes > CTOs e Lacres
-- ==========================================================
-- A lista em si sai das OS já importadas (mensagem do fechamento:
-- "NUMERO DO LACRE: ... PORTA DA CTO: ... LOCALIZAÇÃO DA CTO: ...",
-- ver js/ui/ctoslacres.js). Aqui só fica o que o COP faz em cima
-- dela, uma linha por OS:
--   cadastrado        -> já lançou CTO/porta/lacre no sistema?
--   login/cto/porta/lacre -> correção manual; null = usa o que veio
--                        do texto do técnico
--
-- Leitura: qualquer perfil. Escrita: admin ou editor.

create table if not exists ctos_lacres_cadastro (
    os_id text primary key,
    cadastrado boolean not null default false,
    login text,
    cto text,
    porta text,
    lacre text,
    atualizado_por text,
    atualizado_em timestamptz not null default now()
);

alter table ctos_lacres_cadastro enable row level security;

drop policy if exists "leitura autenticada" on ctos_lacres_cadastro;
drop policy if exists "escrita admin ou editor" on ctos_lacres_cadastro;
drop policy if exists "atualizacao admin ou editor" on ctos_lacres_cadastro;

create policy "leitura autenticada" on ctos_lacres_cadastro for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
create policy "escrita admin ou editor" on ctos_lacres_cadastro for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));
create policy "atualizacao admin ou editor" on ctos_lacres_cadastro for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

-- ======================================================
-- >>> database/patch-25-clientes-cto.sql
-- ======================================================
-- ==========================================================
-- Patch 25: Gestão de Clientes > Cadastro na CTO
-- ==========================================================
-- Retrato da base de clientes do IXC (visão do Query Builder puxada pelo
-- robô, 1x por dia — ver VISAO_CLIENTES_CTO em robo-ordens/robo.js):
-- uma linha por login, com a CTO, a porta e o lacre cadastrados.
-- Vazio = não cadastrado no IXC (o robô grava null, nunca "").
--
-- completo = CTO e porta preenchidas (o card "com cadastro" do site).
-- sincronizado_em = rodada do robô que viu a linha por último; linha que
-- sumiu da visão (cliente cancelado/apagado) é apagada pelo robô no fim
-- da rodada.
--
-- Leitura: qualquer perfil. Escrita: só o robô (chave service, sem RLS).

create table if not exists clientes_cto (
    chave text primary key,          -- login (ou o nome do cliente, se vier sem login)
    cliente text,
    login text,
    cto text,
    porta text,
    lacre text,
    completo boolean generated always as (cto is not null and porta is not null) stored,
    sincronizado_em timestamptz not null default now()
);

create index if not exists clientes_cto_completo on clientes_cto (completo);

alter table clientes_cto enable row level security;

drop policy if exists "leitura autenticada" on clientes_cto;
create policy "leitura autenticada" on clientes_cto for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));

-- ======================================================
-- >>> database/patch-26-clientes-cto-ativo.sql
-- ======================================================
-- ==========================================================
-- Patch 26: Cadastro na CTO — logins inativos
-- ==========================================================
-- A visão "CTOs de Clientes" traz a coluna Ativo (S/N). Até aqui o robô
-- descartava os inativos; agora grava todos e marca ativo = false, pra o
-- site alertar login INATIVO que ainda ocupa CTO/porta (porta que devia
-- ter sido liberada). Os cards e a lista normais contam só ativo = true.

alter table clientes_cto add column if not exists ativo boolean not null default true;

create index if not exists clientes_cto_ativo_completo on clientes_cto (ativo, completo);

-- ======================================================
-- >>> database/patch-27-setores-visao-total.sql
-- ======================================================
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

-- ======================================================
-- >>> database/patch-28-acesso-usuarios.sql
-- ======================================================
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

-- ======================================================
-- >>> database/patch-29-ctos.sql
-- ======================================================
-- ==========================================================
-- Patch 29: cadastro de CTOs (posição de cada caixa)
-- ==========================================================
-- O robô monta a partir da mesma visão "CTOs de Clientes" (539): uma
-- linha por CTO (descrição da caixa de atendimento) com latitude,
-- longitude, endereço, projeto e splitter, + quantos logins ativos ela
-- atende. A aba CTOs e Lacres cruza a coordenada que o técnico escreve no
-- fechamento com essas posições (CTO mais próxima + confere com o IXC?).
--
-- Só aparecem CTOs com pelo menos um login na visão (CTO vazia não vem).
-- Leitura: qualquer perfil. Escrita: só o robô (chave service).

create table if not exists ctos (
    descricao text primary key,
    lat double precision,
    lng double precision,
    endereco text,
    projeto text,
    splitter text,
    logins_ativos integer not null default 0,
    sincronizado_em timestamptz not null default now()
);

alter table ctos enable row level security;

drop policy if exists "leitura autenticada" on ctos;
create policy "leitura autenticada" on ctos for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));

-- ======================================================
-- >>> database/patch-30-ordens-coordenadas.sql
-- ======================================================
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
