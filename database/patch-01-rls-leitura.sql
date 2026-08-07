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
