-- ============================================================
-- Publicar y programar en las redes
--
--   1. integracion_meta: la conexión de la agencia con Facebook. Una
--      fila por espacio. El token de larga duración va CIFRADO (clave
--      derivada de META_APP_SECRET, que vive en Cloudflare). `origen` es
--      la dirección pública de la app: la cola publica sin petición
--      delante y necesita saber dónde están los medios.
--   2. cuentas_sociales: cada página de Facebook, cuenta de Instagram o
--      de TikTok a la que se puede publicar, y a qué cliente pertenece.
--      El token de cada cuenta, cifrado.
--   3. publicaciones_programadas: la cola. Una fila por publicación y
--      red. La programación la lleva el servidor —Instagram no admite
--      programar por API—, así que no hace falta tener la app abierta.
-- ============================================================

pragma foreign_keys = on;

create table if not exists integracion_meta (
  id             text primary key,
  owner_id       text not null references users(id) on delete cascade,
  usuario_meta   text not null default '',
  nombre         text not null default '',
  token_cifrado  text not null,
  expira         text,
  origen         text not null default '',
  conectado_por  text,
  created_at     text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists integracion_meta_dueno on integracion_meta(owner_id);

create table if not exists cuentas_sociales (
  id              text primary key,
  owner_id        text not null references users(id) on delete cascade,
  red             text not null check (red in ('instagram','facebook','tiktok')),
  externo_id      text not null,
  nombre          text not null default '',
  usuario         text not null default '',
  avatar          text not null default '',
  pagina_id       text,
  token_cifrado   text,
  refresh_cifrado text,
  expira          text,
  client_id       text references clients(id) on delete set null,
  datos           text not null default '{}' check (json_valid(datos)),
  created_at      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (owner_id, red, externo_id)
);
create index if not exists cuentas_sociales_dueno on cuentas_sociales(owner_id);
create index if not exists cuentas_sociales_cliente on cuentas_sociales(client_id);

create table if not exists publicaciones_programadas (
  id                text primary key,
  owner_id          text not null references users(id) on delete cascade,
  client_id         text not null references clients(id) on delete cascade,
  calendar_id       text references calendars(id) on delete set null,
  post_id           text not null,
  red               text not null check (red in ('instagram','facebook','tiktok')),
  cuenta_id         text references cuentas_sociales(id) on delete set null,
  programada_para   text not null,
  estado            text not null default 'programada'
                    check (estado in ('programada','procesando','publicada','error','cancelada')),
  intentos          integer not null default 0,
  siguiente_intento text,
  contenedor_id     text,
  externo_id        text,
  enlace            text,
  error             text,
  carga             text not null default '{}' check (json_valid(carga)),
  creado_por        text,
  publicada_at      text,
  created_at        text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists publicaciones_programadas_cola on publicaciones_programadas(estado, programada_para);
create index if not exists publicaciones_programadas_dueno on publicaciones_programadas(owner_id);
create index if not exists publicaciones_programadas_cliente on publicaciones_programadas(client_id);
create index if not exists publicaciones_programadas_cal on publicaciones_programadas(calendar_id);
create index if not exists publicaciones_programadas_cuenta on publicaciones_programadas(cuenta_id);
