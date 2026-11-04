alter table perfis drop constraint if exists perfis_papel_check;
alter table perfis add constraint perfis_papel_check check (papel in ('admin', 'editor', 'leitor'));

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

drop policy if exists "escrita admin" on logs_importacao;
create policy "escrita admin ou editor" on logs_importacao for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));
