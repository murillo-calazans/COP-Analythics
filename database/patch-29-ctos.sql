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
