-- ============================================================
-- El informe de anuncios (aparte del de redes)
--
--   1. informes_anuncios: uno por cliente y mes, como `informes`. Las
--      cifras van CONGELADAS en `contenido` con lo que escribió la IA;
--      `testigo` es el enlace que se le manda al cliente (sin sesión) y
--      `mostrar_costo` dice si el cliente ve el costo por resultado (si no,
--      el servidor lo QUITA de lo que le manda).
--   2. anuncios_clientes: lo que la agencia decide por cliente: si el
--      informe sale solo el día 1 y si, por defecto, enseña el costo.
--
-- Con dueño y cliente, declaradas en worker/lib/acceso.js.
-- ============================================================

pragma foreign_keys = on;

create table if not exists informes_anuncios (
  id             text primary key,
  owner_id       text not null references users(id) on delete cascade,
  client_id      text not null references clients(id) on delete cascade,
  mes            text not null,
  estado         text not null default 'listo' check (estado in ('generando','listo','error')),
  contenido      text not null default '{}' check (json_valid(contenido)),
  error          text,
  testigo        text unique,
  compartido     integer not null default 0 check (compartido in (0,1)),
  automatico     integer not null default 0 check (automatico in (0,1)),
  mostrar_costo  integer not null default 1 check (mostrar_costo in (0,1)),
  generado_por   text,
  created_at     text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (client_id, mes)
);
create index if not exists informes_anuncios_dueno on informes_anuncios(owner_id);
create index if not exists informes_anuncios_cliente on informes_anuncios(client_id, mes);

create table if not exists anuncios_clientes (
  id                  text primary key,
  owner_id            text not null references users(id) on delete cascade,
  client_id           text not null unique references clients(id) on delete cascade,
  informe_automatico  integer not null default 0 check (informe_automatico in (0,1)),
  mostrar_costo       integer not null default 1 check (mostrar_costo in (0,1)),
  created_at          text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at          text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists anuncios_clientes_dueno on anuncios_clientes(owner_id);
create index if not exists anuncios_clientes_client_id on anuncios_clientes(client_id);
