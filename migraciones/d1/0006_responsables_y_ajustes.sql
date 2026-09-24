-- ============================================================
-- Responsables de tareas y ajustes del espacio
--
--   1. `responsables`: los nombres a los que se asignan tareas, para
--      escogerlos en vez de escribirlos cada vez. Se llena solo: toda
--      tarea que se guarda con alguien asignado deja su nombre aquí.
--      Son nombres, no cuentas: se puede asignar a quien no entra en
--      la aplicación.
--   2. `ajustes_espacio`: una fila por espacio (id = owner_id). Por
--      ahora sólo guarda cada cuánto se borran solas las tareas
--      terminadas.
-- ============================================================

pragma foreign_keys = on;

create table if not exists responsables (
  id         text primary key,
  owner_id   text not null references users(id) on delete cascade,
  nombre     text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create unique index if not exists responsables_nombre on responsables(owner_id, nombre);

create table if not exists ajustes_espacio (
  id           text primary key,
  owner_id     text not null references users(id) on delete cascade,
  purga_tareas text not null default 'nunca' check (purga_tareas in ('nunca','semanal','mensual')),
  created_at   text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists ajustes_espacio_dueno on ajustes_espacio(owner_id);
