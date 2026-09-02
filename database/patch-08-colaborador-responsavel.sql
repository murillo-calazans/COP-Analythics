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
