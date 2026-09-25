-- ============================================================
-- Conectar Claude (MCP) con OAuth
--
-- Claude se registra solo (registro dinámico de clientes, RFC 7591),
-- pide permiso a la persona en la propia aplicación y recibe un token
-- atado a ESA persona y a SU espacio. Como en `sessions`, de códigos y
-- tokens sólo se guarda la huella: un volcado de D1 no da acceso a nada.
-- ============================================================

pragma foreign_keys = on;

create table if not exists mcp_clientes (
  id             text primary key,
  nombre         text not null default '',
  redirect_uris  text not null default '[]' check (json_valid(redirect_uris)),
  created_at     text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table if not exists mcp_codigos (
  codigo_hash    text primary key,
  owner_id       text not null references users(id) on delete cascade,
  user_id        text not null references users(id) on delete cascade,
  cliente_id     text not null references mcp_clientes(id) on delete cascade,
  redirect_uri   text not null,
  reto           text not null,
  expira         text not null,
  created_at     text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table if not exists mcp_tokens (
  id               text primary key,
  owner_id         text not null references users(id) on delete cascade,
  user_id          text not null references users(id) on delete cascade,
  cliente_id       text not null references mcp_clientes(id) on delete cascade,
  acceso_hash      text not null unique,
  renovacion_hash  text not null unique,
  expira           text not null,
  usado_at         text,
  created_at       text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists mcp_tokens_dueno on mcp_tokens(owner_id);
create index if not exists mcp_tokens_user_id on mcp_tokens(user_id);
create index if not exists mcp_tokens_cliente_id on mcp_tokens(cliente_id);
create index if not exists mcp_codigos_owner_id on mcp_codigos(owner_id);
create index if not exists mcp_codigos_user_id on mcp_codigos(user_id);
create index if not exists mcp_codigos_cliente_id on mcp_codigos(cliente_id);
