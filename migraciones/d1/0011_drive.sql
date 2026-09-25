-- ============================================================
-- Google Drive como banco de contenido
--
--   1. clients.drive_folder: el id de la carpeta de Drive del cliente.
--      Se guarda el id y no el enlace: el enlace cambia de forma
--      (/drive/folders/…, /drive/u/0/folders/…, ?usp=sharing) y el id no.
--   2. integracion_drive: la conexión de la agencia con Google. Una fila
--      por espacio. El permiso de larga duración (refresh token) va
--      CIFRADO con AES-GCM y una clave derivada del secreto del cliente
--      OAuth, que vive en Cloudflare y no en D1: quien lea la base no
--      lee el Drive de nadie.
-- ============================================================

pragma foreign_keys = on;

alter table clients add column drive_folder text not null default '';

create table if not exists integracion_drive (
  id              text primary key,
  owner_id        text not null references users(id) on delete cascade,
  email           text not null default '',
  refresh_cifrado text not null,
  conectado_por   text,
  created_at      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists integracion_drive_dueno on integracion_drive(owner_id);
