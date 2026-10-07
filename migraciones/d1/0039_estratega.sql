-- ============================================================
-- El estratega de campañas
--
--   1. ajustes_espacio.manual_campanas: el «Manual de campañas de la
--      agencia» (sus reglas, cómo se nombra cada cosa en Meta y cuántas
--      conversaciones suelen acabar en venta). El estratega lo lee siempre.
--   2. planes_campana: los planes que escribió el estratega, para volver a
--      ellos. `client_id` puede ir vacío: el plan de alguien que no es
--      cliente (como en auditorias). Con dueño y cliente, declarada en
--      worker/lib/acceso.js.
-- ============================================================

pragma foreign_keys = on;

alter table ajustes_espacio add column manual_campanas text not null default '{}' check (json_valid(manual_campanas));

create table if not exists planes_campana (
  id          text primary key,
  owner_id    text not null references users(id) on delete cascade,
  client_id   text references clients(id) on delete set null,
  nombre      text not null default '',
  datos       text not null default '{}' check (json_valid(datos)),
  creado_por  text,
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists planes_campana_dueno on planes_campana(owner_id, created_at);
create index if not exists planes_campana_cliente on planes_campana(client_id);
