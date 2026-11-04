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
