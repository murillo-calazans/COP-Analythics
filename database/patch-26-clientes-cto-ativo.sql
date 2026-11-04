alter table clientes_cto add column if not exists ativo boolean not null default true;

create index if not exists clientes_cto_ativo_completo on clientes_cto (ativo, completo);
