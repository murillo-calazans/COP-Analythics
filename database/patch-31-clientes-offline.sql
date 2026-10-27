-- ==========================================================
-- Patch 31: Logins offline (detecção de rompimento / queda em massa)
-- ==========================================================
-- Retrato dos logins OFFLINE do IXC (visão 551 "Login - Off": online=N),
-- puxada pelo robô a CADA rodada (ver VISAO_OFFLINE em robo-ordens/robo.js) —
-- os offline mudam de hora em hora. Uma linha por login.
--
-- O site cruza esta tabela com as OS em aberto (os_pendentes) pra flagar
-- rompimento/queda de energia em massa: muitos logins da mesma OLT/PON/CTO
-- caindo no mesmo horário.
--
-- causa: motivo da última queda informado pela ONU —
--   dying-gasp / Lost-carrier  = cliente perdeu ENERGIA (falta de luz);
--   LOS / LOSi / LOBi / LOFi    = Loss of Signal (rompimento de fibra, conector);
--   reset                       = ONU reiniciou.
-- interface_pon = porta/PON da OLT (ex.: "0/7/0"); agrupa melhor que a CTO.
-- sincronizado_em = rodada que viu o login por último; login que voltou a
-- ficar online (saiu da visão) é apagado pelo robô no fim da rodada.
--
-- Leitura: qualquer perfil autenticado. Escrita: só o robô (chave service).

create table if not exists clientes_offline (
    login text primary key,
    cliente text,
    bairro text,
    olt text,              -- radpop_radio (ex.: CHM-OLT-AGROBRASIL-1)
    cto text,              -- caixa FTTH (ex.: BJR-EST4-A6-CEO15-C13)
    interface_pon text,    -- porta/PON da OLT (ex.: 0/7/0)
    sinal_rx numeric,      -- potência óptica recebida (dBm)
    causa text,            -- causa da última queda (dying-gasp, LOS, reset…)
    status_acesso text,    -- Ativo / Bloqueio Automático / Financeiro em atraso…
    ultima_conexao text,   -- horário da última conexão final (texto do IXC)
    latitude numeric,
    longitude numeric,
    sincronizado_em timestamptz not null default now()
);

create index if not exists clientes_offline_olt on clientes_offline (olt);
create index if not exists clientes_offline_cto on clientes_offline (cto);
create index if not exists clientes_offline_causa on clientes_offline (causa);

alter table clientes_offline enable row level security;

drop policy if exists "leitura autenticada" on clientes_offline;
create policy "leitura autenticada" on clientes_offline for select to authenticated
    using (exists (select 1 from perfis where id = auth.uid()));
