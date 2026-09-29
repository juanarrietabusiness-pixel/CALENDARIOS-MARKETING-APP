-- ============================================================
-- Haiku como modelo del espacio
--
-- `ia_modelo` nació con `check (ia_modelo in ('sonnet','opus'))`, y
-- SQLite no deja cambiar un CHECK: hay que reconstruir la tabla. Es la
-- de ajustes, una fila por espacio, así que la copia es instantánea.
--
-- Se reconstruye con TODAS sus columnas de hoy (0006, 0009 y 0010) y los
-- mismos checks; sólo cambia el de `ia_modelo`, que admite «haiku».
-- Nada la referencia: soltarla no arrastra a ninguna otra tabla.
-- ============================================================

pragma foreign_keys = on;

create table if not exists ajustes_espacio_v2 (
  id                   text primary key,
  owner_id             text not null references users(id) on delete cascade,
  purga_tareas         text not null default 'nunca' check (purga_tareas in ('nunca','semanal','mensual')),
  created_at           text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at           text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ia_modelo            text not null default 'sonnet' check (ia_modelo in ('sonnet','opus','haiku')),
  ia_razonamiento      text not null default 'alto' check (ia_razonamiento in ('bajo','medio','alto','maximo')),
  presupuesto_usd      real not null default 30 check (presupuesto_usd >= 0),
  al_limite            text not null default 'avisar' check (al_limite in ('avisar','bajar','detener')),
  ia_razonamiento_chat text check (ia_razonamiento_chat is null or ia_razonamiento_chat in ('bajo','medio','alto','maximo'))
);
create index if not exists ajustes_espacio_v2_dueno on ajustes_espacio_v2(owner_id);

insert or ignore into ajustes_espacio_v2
  (id, owner_id, purga_tareas, created_at, updated_at, ia_modelo, ia_razonamiento, presupuesto_usd, al_limite, ia_razonamiento_chat)
select id, owner_id, purga_tareas, created_at, updated_at, ia_modelo, ia_razonamiento, presupuesto_usd, al_limite, ia_razonamiento_chat
from ajustes_espacio;

-- Se suelta la tabla vieja: todas sus filas acaban de copiarse arriba,
-- columna a columna, y la nueva ocupa su nombre en la línea siguiente.
drop table ajustes_espacio;
alter table ajustes_espacio_v2 rename to ajustes_espacio;
