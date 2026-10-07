-- ============================================================
-- El historial de anuncios apunta más cosas
--
-- `accion` sólo admitía crear, activar y pausar. El diagnóstico cambia el
-- presupuesto de un conjunto y el asistente crea públicos similares: las
-- dos se apuntan. Un CHECK no se cambia en SQLite: se reconstruye la tabla
-- (como 0022 con ajustes_espacio). No tiene hijas, así que soltarla no
-- dispara ninguna cascada.
-- ============================================================

pragma foreign_keys = on;

create table if not exists historial_anuncios_v2 (
  id             text primary key,
  owner_id       text not null references users(id) on delete cascade,
  client_id      text not null references clients(id) on delete cascade,
  campana_id     text not null,
  accion         text not null check (accion in ('crear','activar','pausar','presupuesto','publico')),
  usuario_id     text,
  nombre         text not null default '',
  detalle        text not null default '{}' check (json_valid(detalle)),
  created_at     text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists historial_anuncios_v2_dueno on historial_anuncios_v2(owner_id);
create index if not exists historial_anuncios_v2_cliente on historial_anuncios_v2(client_id, created_at);

insert or ignore into historial_anuncios_v2 (id, owner_id, client_id, campana_id, accion, usuario_id, nombre, detalle, created_at)
  select id, owner_id, client_id, campana_id, accion, usuario_id, nombre, detalle, created_at from historial_anuncios;

-- Se suelta la tabla vieja: todas sus filas acaban de copiarse arriba,
-- columna a columna, y la nueva ocupa su nombre en la línea siguiente.
drop table historial_anuncios;
alter table historial_anuncios_v2 rename to historial_anuncios;
