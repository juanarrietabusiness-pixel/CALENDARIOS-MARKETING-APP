-- ============================================================
-- Inspiración: lo que publican las cuentas que sigue cada cliente
--
-- Cada cliente tiene hasta 10 cuentas fijas —competencia o inspiración—
-- en `clients.competidores` (lo que antes eran @ sueltos; src/lib/inspiracion.js
-- lee las dos formas). Lo que publican se GUARDA aquí para que abrir el
-- feed no gaste llamadas a Meta ni a Google y se pueda medir «rinde X× su
-- promedio» contra la propia cuenta.
--
--   1. inspiracion_cuentas: cada cuenta de cada cliente cuando se leyó por
--      última vez (seguidores, su mediana de interacciones, el error si lo
--      hubo). Una cuenta leída con error también lleva fecha: el cron no la
--      repite cada minuto.
--   2. inspiracion_publicaciones: sus últimas publicaciones con sus cifras.
--      Se REESCRIBEN en cada lectura (las cifras siguen subiendo) y lo que
--      ya no está entre las últimas se borra. `avisado` dice si ya se avisó
--      al equipo de que esa publicación rinde mucho más que su promedio;
--      `sin_archivo`, que es un reel con música de Instagram (Meta no da su
--      video, sólo la miniatura).
--   3. instagram_enlaces: la memoria de «este código de enlace es de esta
--      cuenta». Un enlace compartido no dice de quién es; una vez resuelto,
--      no se vuelve a preguntar ni a buscar.
-- ============================================================

pragma foreign_keys = on;

create table if not exists inspiracion_cuentas (
  id             text primary key,
  owner_id       text not null references users(id) on delete cascade,
  client_id      text not null references clients(id) on delete cascade,
  red            text not null,
  usuario        text not null,
  nombre         text not null default '',
  foto           text not null default '',
  seguidores     integer,
  publicaciones  integer,
  mediana        real,
  error          text not null default '',
  actualizada_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists inspiracion_cuentas_dueno on inspiracion_cuentas(owner_id);
create index if not exists inspiracion_cuentas_cliente on inspiracion_cuentas(client_id, actualizada_at);

create table if not exists inspiracion_publicaciones (
  id             text primary key,
  owner_id       text not null references users(id) on delete cascade,
  client_id      text not null references clients(id) on delete cascade,
  cuenta_id      text not null references inspiracion_cuentas(id) on delete cascade,
  red            text not null,
  usuario        text not null,
  externo_id     text not null,
  codigo         text not null default '',
  formato        text not null default '',
  enlace         text not null default '',
  texto          text not null default '',
  miniatura      text not null default '',
  publicada_at   text,
  me_gusta       integer not null default 0,
  comentarios    integer not null default 0,
  vistas         integer not null default 0,
  interacciones  integer not null default 0,
  rinde          real,
  sin_archivo    integer not null default 0 check (sin_archivo in (0,1)),
  avisado        integer not null default 0 check (avisado in (0,1)),
  updated_at     text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists inspiracion_publicaciones_dueno on inspiracion_publicaciones(owner_id);
create index if not exists inspiracion_publicaciones_cliente on inspiracion_publicaciones(client_id, publicada_at);
create index if not exists inspiracion_publicaciones_cuenta on inspiracion_publicaciones(cuenta_id);
create index if not exists inspiracion_publicaciones_codigo on inspiracion_publicaciones(owner_id, codigo);

create table if not exists instagram_enlaces (
  id          text primary key,
  owner_id    text not null references users(id) on delete cascade,
  codigo      text not null,
  usuario     text not null,
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists instagram_enlaces_dueno on instagram_enlaces(owner_id, codigo);
