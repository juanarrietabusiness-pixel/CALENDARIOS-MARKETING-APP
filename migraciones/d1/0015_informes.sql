-- ============================================================
-- Informes mensuales
--
-- Uno por cliente y mes. `contenido` guarda las cifras CONGELADAS del mes
-- —si mañana Meta corrige un número, el informe que se mandó no cambia— y
-- el análisis de la IA. `testigo` es el enlace público que se le manda al
-- cliente, igual que el de aprobación: sin sesión, sólo lectura.
-- ============================================================

pragma foreign_keys = on;

create table if not exists informes (
  id            text primary key,
  owner_id      text not null references users(id) on delete cascade,
  client_id     text not null references clients(id) on delete cascade,
  mes           text not null,
  estado        text not null default 'listo' check (estado in ('generando','listo','error')),
  contenido     text not null default '{}' check (json_valid(contenido)),
  error         text,
  testigo       text unique,
  compartido    integer not null default 0 check (compartido in (0,1)),
  automatico    integer not null default 0 check (automatico in (0,1)),
  generado_por  text,
  created_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (client_id, mes)
);
create index if not exists informes_dueno on informes(owner_id);
create index if not exists informes_cliente on informes(client_id, mes);
