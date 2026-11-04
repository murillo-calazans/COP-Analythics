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
