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
