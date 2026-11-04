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

create table if not exists ref_colaboradores_responsaveis (
    chave text primary key,
    dados jsonb not null,
    atualizado_em timestamptz not null default now()
);

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

    setor text,
    atualizado_em timestamptz not null default now(),
    auditoria_ia jsonb
);

create index if not exists ordens_setor_idx on ordens (setor);

create table if not exists movimentacoes (
    id bigint generated always as identity primary key,
    ordem_id text not null references ordens(id) on delete cascade,
    operador text,

    colaborador_responsavel text,
    equipe text,
    evento text,
    diagnostico text,

    proxima_tarefa text,
    status text,
    resposta_padrao text,
    mensagem text,
    historico jsonb,
    data timestamptz
);

create index if not exists movimentacoes_ordem_id_idx on movimentacoes (ordem_id);

create table if not exists perfis (
    id uuid primary key references auth.users(id) on delete cascade,
    papel text not null check (papel in ('admin', 'leitor')),

    setor text,
    criado_em timestamptz not null default now()
);

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

alter table ref_operadores enable row level security;
alter table ref_eventos enable row level security;
alter table ref_diagnosticos enable row level security;
alter table ref_colaboradores_responsaveis enable row level security;
alter table ordens enable row level security;
alter table movimentacoes enable row level security;
alter table perfis enable row level security;
alter table logs_importacao enable row level security;
alter table logs_login enable row level security;

drop policy if exists "leitura autenticada" on ref_operadores;
create policy "leitura autenticada" on ref_operadores for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
drop policy if exists "leitura autenticada" on ref_eventos;
create policy "leitura autenticada" on ref_eventos for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
drop policy if exists "leitura autenticada" on ref_diagnosticos;
create policy "leitura autenticada" on ref_diagnosticos for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
drop policy if exists "leitura autenticada" on ref_colaboradores_responsaveis;
create policy "leitura autenticada" on ref_colaboradores_responsaveis for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));

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

drop policy if exists "leitura do proprio perfil" on perfis;
create policy "leitura do proprio perfil" on perfis for select to authenticated using (id = auth.uid());

drop policy if exists "leitura autenticada" on logs_importacao;
create policy "leitura autenticada" on logs_importacao for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
drop policy if exists "escrita admin" on logs_importacao;
create policy "escrita admin" on logs_importacao for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
drop policy if exists "exclusao admin" on logs_importacao;
create policy "exclusao admin" on logs_importacao for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));

drop policy if exists "leitura autenticada" on logs_login;
create policy "leitura autenticada" on logs_login for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
drop policy if exists "escrita autenticada" on logs_login;
create policy "escrita autenticada" on logs_login for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid()));

drop policy if exists "escrita admin" on ref_operadores;
create policy "escrita admin" on ref_operadores for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
drop policy if exists "atualizacao admin" on ref_operadores;
create policy "atualizacao admin" on ref_operadores for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
drop policy if exists "exclusao admin" on ref_operadores;
create policy "exclusao admin" on ref_operadores for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));

drop policy if exists "escrita admin" on ref_eventos;
create policy "escrita admin" on ref_eventos for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
drop policy if exists "atualizacao admin" on ref_eventos;
create policy "atualizacao admin" on ref_eventos for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
drop policy if exists "exclusao admin" on ref_eventos;
create policy "exclusao admin" on ref_eventos for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));

drop policy if exists "escrita admin" on ref_diagnosticos;
create policy "escrita admin" on ref_diagnosticos for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
drop policy if exists "atualizacao admin" on ref_diagnosticos;
create policy "atualizacao admin" on ref_diagnosticos for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
drop policy if exists "exclusao admin" on ref_diagnosticos;
create policy "exclusao admin" on ref_diagnosticos for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));

drop policy if exists "escrita admin" on ref_colaboradores_responsaveis;
create policy "escrita admin" on ref_colaboradores_responsaveis for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
drop policy if exists "atualizacao admin" on ref_colaboradores_responsaveis;
create policy "atualizacao admin" on ref_colaboradores_responsaveis for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
drop policy if exists "exclusao admin" on ref_colaboradores_responsaveis;
create policy "exclusao admin" on ref_colaboradores_responsaveis for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));

drop policy if exists "escrita admin" on ordens;
create policy "escrita admin" on ordens for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
drop policy if exists "atualizacao admin" on ordens;
create policy "atualizacao admin" on ordens for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
drop policy if exists "exclusao admin" on ordens;
create policy "exclusao admin" on ordens for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));

drop policy if exists "escrita admin" on movimentacoes;
create policy "escrita admin" on movimentacoes for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
drop policy if exists "atualizacao admin" on movimentacoes;
create policy "atualizacao admin" on movimentacoes for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
drop policy if exists "exclusao admin" on movimentacoes;
create policy "exclusao admin" on movimentacoes for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));

drop policy if exists "leitura autenticada" on ref_operadores;
drop policy if exists "leitura autenticada" on ref_operadores;
create policy "leitura autenticada" on ref_operadores for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));

drop policy if exists "leitura autenticada" on ref_eventos;
drop policy if exists "leitura autenticada" on ref_eventos;
create policy "leitura autenticada" on ref_eventos for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));

drop policy if exists "leitura autenticada" on ref_diagnosticos;
drop policy if exists "leitura autenticada" on ref_diagnosticos;
create policy "leitura autenticada" on ref_diagnosticos for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));

drop policy if exists "leitura autenticada" on ordens;
drop policy if exists "leitura autenticada" on ordens;
create policy "leitura autenticada" on ordens for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));

drop policy if exists "leitura autenticada" on movimentacoes;
drop policy if exists "leitura autenticada" on movimentacoes;
create policy "leitura autenticada" on movimentacoes for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));

alter table ordens add column if not exists auditoria_ia jsonb;

create table if not exists logs_importacao (
    id bigint generated always as identity primary key,
    nome_arquivo text not null,
    tipo text not null check (tipo in ('base', 'ordens')),
    importado_por text,
    importado_em timestamptz not null default now(),
    estatisticas jsonb
);

alter table logs_importacao enable row level security;

drop policy if exists "leitura autenticada" on logs_importacao;
create policy "leitura autenticada" on logs_importacao for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));

drop policy if exists "escrita admin" on logs_importacao;
create policy "escrita admin" on logs_importacao for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));

create table if not exists logs_login (
    id bigint generated always as identity primary key,
    usuario_email text not null,
    logado_em timestamptz not null default now()
);

alter table logs_login enable row level security;

drop policy if exists "leitura autenticada" on logs_login;
create policy "leitura autenticada" on logs_login for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));

drop policy if exists "escrita autenticada" on logs_login;
create policy "escrita autenticada" on logs_login for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid()));

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

alter table perfis add column if not exists setor text;
alter table ordens add column if not exists setor text;

create index if not exists ordens_setor_idx on ordens (setor);

drop policy if exists "leitura autenticada" on ordens;
drop policy if exists "leitura autenticada" on ordens;
create policy "leitura autenticada" on ordens for select to authenticated
    using (exists (
        select 1 from perfis p
        where p.id = auth.uid()
          and (p.setor is null or upper(p.setor) = upper(ordens.setor))
    ));

drop policy if exists "leitura autenticada" on movimentacoes;
drop policy if exists "leitura autenticada" on movimentacoes;
create policy "leitura autenticada" on movimentacoes for select to authenticated
    using (exists (
        select 1 from perfis p
        join ordens o on o.id = movimentacoes.ordem_id
        where p.id = auth.uid()
          and (p.setor is null or upper(p.setor) = upper(o.setor))
    ));

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

alter table movimentacoes add column if not exists colaborador_responsavel text;

create table if not exists ref_colaboradores_responsaveis (
    chave text primary key,
    dados jsonb not null,
    atualizado_em timestamptz not null default now()
);

alter table ref_colaboradores_responsaveis enable row level security;

drop policy if exists "leitura autenticada" on ref_colaboradores_responsaveis;
create policy "leitura autenticada" on ref_colaboradores_responsaveis for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
drop policy if exists "escrita admin" on ref_colaboradores_responsaveis;
create policy "escrita admin" on ref_colaboradores_responsaveis for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
drop policy if exists "atualizacao admin" on ref_colaboradores_responsaveis;
create policy "atualizacao admin" on ref_colaboradores_responsaveis for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
drop policy if exists "exclusao admin" on ref_colaboradores_responsaveis;
create policy "exclusao admin" on ref_colaboradores_responsaveis for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));

alter table movimentacoes add column if not exists proxima_tarefa text;

drop policy if exists "exclusao admin" on logs_importacao;
create policy "exclusao admin" on logs_importacao for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));

alter table perfis drop constraint if exists perfis_papel_check;
alter table perfis add constraint perfis_papel_check check (papel in ('admin', 'editor', 'leitor'));

drop policy if exists "escrita admin" on ref_operadores;
drop policy if exists "escrita admin ou editor" on ref_operadores;
create policy "escrita admin ou editor" on ref_operadores for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));
drop policy if exists "atualizacao admin" on ref_operadores;
drop policy if exists "atualizacao admin ou editor" on ref_operadores;
create policy "atualizacao admin ou editor" on ref_operadores for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

drop policy if exists "escrita admin" on ref_eventos;
drop policy if exists "escrita admin ou editor" on ref_eventos;
create policy "escrita admin ou editor" on ref_eventos for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));
drop policy if exists "atualizacao admin" on ref_eventos;
drop policy if exists "atualizacao admin ou editor" on ref_eventos;
create policy "atualizacao admin ou editor" on ref_eventos for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

drop policy if exists "escrita admin" on ref_diagnosticos;
drop policy if exists "escrita admin ou editor" on ref_diagnosticos;
create policy "escrita admin ou editor" on ref_diagnosticos for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));
drop policy if exists "atualizacao admin" on ref_diagnosticos;
drop policy if exists "atualizacao admin ou editor" on ref_diagnosticos;
create policy "atualizacao admin ou editor" on ref_diagnosticos for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

drop policy if exists "escrita admin" on ref_colaboradores_responsaveis;
drop policy if exists "escrita admin ou editor" on ref_colaboradores_responsaveis;
create policy "escrita admin ou editor" on ref_colaboradores_responsaveis for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));
drop policy if exists "atualizacao admin" on ref_colaboradores_responsaveis;
drop policy if exists "atualizacao admin ou editor" on ref_colaboradores_responsaveis;
create policy "atualizacao admin ou editor" on ref_colaboradores_responsaveis for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

drop policy if exists "escrita admin" on ordens;
drop policy if exists "escrita admin ou editor" on ordens;
create policy "escrita admin ou editor" on ordens for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));
drop policy if exists "atualizacao admin" on ordens;
drop policy if exists "atualizacao admin ou editor" on ordens;
create policy "atualizacao admin ou editor" on ordens for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

drop policy if exists "escrita admin" on movimentacoes;
drop policy if exists "escrita admin ou editor" on movimentacoes;
create policy "escrita admin ou editor" on movimentacoes for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));
drop policy if exists "atualizacao admin" on movimentacoes;
drop policy if exists "atualizacao admin ou editor" on movimentacoes;
create policy "atualizacao admin ou editor" on movimentacoes for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

drop policy if exists "escrita admin" on logs_importacao;
drop policy if exists "escrita admin ou editor" on logs_importacao;
create policy "escrita admin ou editor" on logs_importacao for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

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

drop policy if exists "leitura autenticada" on auditoria_correcoes;
create policy "leitura autenticada" on auditoria_correcoes for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
drop policy if exists "escrita qualquer perfil" on auditoria_correcoes;
create policy "escrita qualquer perfil" on auditoria_correcoes for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid()));
drop policy if exists "atualizacao qualquer perfil" on auditoria_correcoes;
create policy "atualizacao qualquer perfil" on auditoria_correcoes for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
drop policy if exists "exclusao qualquer perfil" on auditoria_correcoes;
create policy "exclusao qualquer perfil" on auditoria_correcoes for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));

create table if not exists bot_config (
    id                  int primary key default 1 check (id = 1),
    grupo_cobranca_jid  text,
    hora_inicio         int  not null default 7,
    hora_fim            int  not null default 18,
    dias_semana         int[] not null default '{1,2,3,4,5,6}',
    intervalo_min       int  not null default 5
);
insert into bot_config (id) values (1) on conflict (id) do nothing;

create table if not exists bot_monitorados (
    numero  text primary key,
    rotulo  text not null,
    lid     text
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

create table if not exists escala_tecnicos_dados (
    id text primary key default 'default',
    dados jsonb not null,
    atualizado_em timestamptz not null default now()
);

alter table escala_tecnicos_dados enable row level security;

drop policy if exists "leitura publica" on escala_tecnicos_dados;
drop policy if exists "escrita publica" on escala_tecnicos_dados;
drop policy if exists "atualizacao publica" on escala_tecnicos_dados;
drop policy if exists "escrita autenticada" on escala_tecnicos_dados;
drop policy if exists "atualizacao autenticada" on escala_tecnicos_dados;

drop policy if exists "leitura autenticada" on escala_tecnicos_dados;
create policy "leitura autenticada" on escala_tecnicos_dados for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));

drop policy if exists "escrita admin" on escala_tecnicos_dados;
create policy "escrita admin" on escala_tecnicos_dados for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
drop policy if exists "atualizacao admin" on escala_tecnicos_dados;
create policy "atualizacao admin" on escala_tecnicos_dados for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
drop policy if exists "exclusao admin" on escala_tecnicos_dados;
create policy "exclusao admin" on escala_tecnicos_dados for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));

alter table perfis add column if not exists nome text;

create table if not exists agenda_publicada (
    data date primary key,
    itens jsonb not null,
    resumo jsonb,
    publicado_por text,
    atualizado_em timestamptz not null default now()
);

alter table agenda_publicada enable row level security;

drop policy if exists "leitura autenticada" on agenda_publicada;
drop policy if exists "escrita admin" on agenda_publicada;
drop policy if exists "atualizacao admin" on agenda_publicada;
drop policy if exists "exclusao admin" on agenda_publicada;

drop policy if exists "leitura autenticada" on agenda_publicada;
create policy "leitura autenticada" on agenda_publicada for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));

drop policy if exists "escrita admin" on agenda_publicada;
create policy "escrita admin" on agenda_publicada for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
drop policy if exists "atualizacao admin" on agenda_publicada;
create policy "atualizacao admin" on agenda_publicada for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));
drop policy if exists "exclusao admin" on agenda_publicada;
create policy "exclusao admin" on agenda_publicada for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));

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

drop policy if exists "escrita admin" on escala_tecnicos_dados;
drop policy if exists "atualizacao admin" on escala_tecnicos_dados;
drop policy if exists "exclusao admin" on escala_tecnicos_dados;
drop policy if exists "escrita admin ou editor" on escala_tecnicos_dados;
drop policy if exists "atualizacao admin ou editor" on escala_tecnicos_dados;
drop policy if exists "exclusao admin ou editor" on escala_tecnicos_dados;

drop policy if exists "escrita admin ou editor" on escala_tecnicos_dados;
create policy "escrita admin ou editor" on escala_tecnicos_dados for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));
drop policy if exists "atualizacao admin ou editor" on escala_tecnicos_dados;
create policy "atualizacao admin ou editor" on escala_tecnicos_dados for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));
drop policy if exists "exclusao admin ou editor" on escala_tecnicos_dados;
create policy "exclusao admin ou editor" on escala_tecnicos_dados for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

drop policy if exists "escrita admin" on agenda_publicada;
drop policy if exists "atualizacao admin" on agenda_publicada;
drop policy if exists "exclusao admin" on agenda_publicada;
drop policy if exists "escrita admin ou editor" on agenda_publicada;
drop policy if exists "atualizacao admin ou editor" on agenda_publicada;
drop policy if exists "exclusao admin ou editor" on agenda_publicada;

drop policy if exists "escrita admin ou editor" on agenda_publicada;
create policy "escrita admin ou editor" on agenda_publicada for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));
drop policy if exists "atualizacao admin ou editor" on agenda_publicada;
create policy "atualizacao admin ou editor" on agenda_publicada for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));
drop policy if exists "exclusao admin ou editor" on agenda_publicada;
create policy "exclusao admin ou editor" on agenda_publicada for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

drop policy if exists "exclusao admin" on ordens;
drop policy if exists "exclusao admin ou editor" on ordens;
drop policy if exists "exclusao admin ou editor" on ordens;
create policy "exclusao admin ou editor" on ordens for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

drop policy if exists "exclusao admin" on movimentacoes;
drop policy if exists "exclusao admin ou editor" on movimentacoes;
drop policy if exists "exclusao admin ou editor" on movimentacoes;
create policy "exclusao admin ou editor" on movimentacoes for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

drop policy if exists "exclusao admin" on ref_operadores;
drop policy if exists "exclusao admin ou editor" on ref_operadores;
drop policy if exists "exclusao admin ou editor" on ref_operadores;
create policy "exclusao admin ou editor" on ref_operadores for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

drop policy if exists "exclusao admin" on ref_eventos;
drop policy if exists "exclusao admin ou editor" on ref_eventos;
drop policy if exists "exclusao admin ou editor" on ref_eventos;
create policy "exclusao admin ou editor" on ref_eventos for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

drop policy if exists "exclusao admin" on ref_diagnosticos;
drop policy if exists "exclusao admin ou editor" on ref_diagnosticos;
drop policy if exists "exclusao admin ou editor" on ref_diagnosticos;
create policy "exclusao admin ou editor" on ref_diagnosticos for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

drop policy if exists "exclusao admin" on ref_colaboradores_responsaveis;
drop policy if exists "exclusao admin ou editor" on ref_colaboradores_responsaveis;
drop policy if exists "exclusao admin ou editor" on ref_colaboradores_responsaveis;
create policy "exclusao admin ou editor" on ref_colaboradores_responsaveis for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

drop policy if exists "exclusao admin" on logs_importacao;
drop policy if exists "exclusao admin ou editor" on logs_importacao;
drop policy if exists "exclusao admin ou editor" on logs_importacao;
create policy "exclusao admin ou editor" on logs_importacao for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

alter table perfis drop constraint if exists perfis_papel_check;
alter table perfis add constraint perfis_papel_check check (papel in ('admin', 'editor', 'leitor'));

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

drop policy if exists "escrita admin" on logs_importacao;
drop policy if exists "escrita admin ou editor" on logs_importacao;
drop policy if exists "escrita admin ou editor" on logs_importacao;
create policy "escrita admin ou editor" on logs_importacao for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

create table if not exists terceiras_config (
    id text primary key default 'default',
    lpu jsonb not null default '{}'::jsonb,
    diagnosticos jsonb not null default '{}'::jsonb,
    atualizado_por text,
    atualizado_em timestamptz not null default now()
);

create table if not exists terceiras_fechamentos (
    mes text not null,
    terceira text not null,
    total numeric(12, 2) not null,
    resumo jsonb,
    itens jsonb not null,
    aprovado_por text,
    aprovado_em timestamptz not null default now(),
    primary key (mes, terceira)
);

alter table terceiras_config enable row level security;
alter table terceiras_fechamentos enable row level security;

drop policy if exists "leitura autenticada" on terceiras_config;
drop policy if exists "escrita admin ou editor" on terceiras_config;
drop policy if exists "atualizacao admin ou editor" on terceiras_config;

drop policy if exists "leitura autenticada" on terceiras_config;
create policy "leitura autenticada" on terceiras_config for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
drop policy if exists "escrita admin ou editor" on terceiras_config;
create policy "escrita admin ou editor" on terceiras_config for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));
drop policy if exists "atualizacao admin ou editor" on terceiras_config;
create policy "atualizacao admin ou editor" on terceiras_config for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

drop policy if exists "leitura autenticada" on terceiras_fechamentos;
drop policy if exists "escrita admin ou editor" on terceiras_fechamentos;
drop policy if exists "atualizacao admin ou editor" on terceiras_fechamentos;
drop policy if exists "exclusao admin" on terceiras_fechamentos;

drop policy if exists "leitura autenticada" on terceiras_fechamentos;
create policy "leitura autenticada" on terceiras_fechamentos for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
drop policy if exists "escrita admin ou editor" on terceiras_fechamentos;
create policy "escrita admin ou editor" on terceiras_fechamentos for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));
drop policy if exists "atualizacao admin ou editor" on terceiras_fechamentos;
create policy "atualizacao admin ou editor" on terceiras_fechamentos for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));
drop policy if exists "exclusao admin" on terceiras_fechamentos;
create policy "exclusao admin" on terceiras_fechamentos for delete to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel = 'admin'));

create table if not exists os_pendentes (
    id bigint generated always as identity primary key,
    dados jsonb not null,
    capturado_em timestamptz not null default now()
);

alter table os_pendentes enable row level security;

drop policy if exists "leitura autenticada" on os_pendentes;
create policy "leitura autenticada" on os_pendentes for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));

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

drop policy if exists "leitura autenticada" on robo_comandos;
create policy "leitura autenticada" on robo_comandos for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));

drop policy if exists "pedido admin/editor" on robo_comandos;
create policy "pedido admin/editor" on robo_comandos for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

alter table os_pendentes alter column id set generated by default;

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

drop policy if exists "leitura autenticada" on ctos_lacres_cadastro;
create policy "leitura autenticada" on ctos_lacres_cadastro for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
drop policy if exists "escrita admin ou editor" on ctos_lacres_cadastro;
create policy "escrita admin ou editor" on ctos_lacres_cadastro for insert to authenticated
    with check (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));
drop policy if exists "atualizacao admin ou editor" on ctos_lacres_cadastro;
create policy "atualizacao admin ou editor" on ctos_lacres_cadastro for update to authenticated
    using (exists (select 1 from perfis where id = auth.uid() and papel in ('admin', 'editor')));

create table if not exists clientes_cto (
    chave text primary key,
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
drop policy if exists "leitura autenticada" on clientes_cto;
create policy "leitura autenticada" on clientes_cto for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));

alter table clientes_cto add column if not exists ativo boolean not null default true;

create index if not exists clientes_cto_ativo_completo on clientes_cto (ativo, completo);

create table if not exists setores_visao_total (
    setor text primary key
);

insert into setores_visao_total (setor) values ('CONTROLE DE OPERAÇÕES')
on conflict (setor) do nothing;

alter table setores_visao_total enable row level security;

drop policy if exists "leitura autenticada" on setores_visao_total;
drop policy if exists "leitura autenticada" on setores_visao_total;
create policy "leitura autenticada" on setores_visao_total for select to authenticated
    using (true);

drop policy if exists "leitura autenticada" on ordens;
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

alter table perfis add column if not exists setores_visiveis text[];
alter table perfis add column if not exists abas_visiveis text[];

alter table perfis add column if not exists acesso_configurado boolean not null default false;

update perfis
set setores_visiveis = array[setor]
where setor is not null
  and setores_visiveis is null
  and not acesso_configurado
  and papel <> 'admin'
  and upper(setor) <> upper('CONTROLE DE OPERAÇÕES');

drop policy if exists "leitura autenticada" on ordens;
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

drop table if exists setores_visao_total;

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
drop policy if exists "leitura autenticada" on ctos;
create policy "leitura autenticada" on ctos for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));

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
