create policy "exclusao admin" on logs_importacao for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
