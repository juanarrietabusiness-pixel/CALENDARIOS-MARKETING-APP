-- ============================================================
-- El SONIDO de un video animado y su HISTORIAL de versiones
--
-- `sonido` (JSON): lo que suena debajo de la voz y que NO es el guion —los
-- efectos (whoosh en las transiciones, pop en los sellos) y la música de
-- fondo, con su volumen—. Va aparte del guion a propósito: cambiarlo no sube
-- la versión ni devuelve el video a borrador, así que no obliga a pagar otra
-- locución. Sólo hay que volver a renderizar (no gasta IA).
--
-- `videos_versiones`: cada vez que el guion cambia, el de ANTES se guarda
-- aquí con su número de versión, para verlo y volver a él. Volver crea una
-- versión nueva con ese guion (nunca se reescribe la historia).
--
-- Nada de lo que hay se toca: una columna con valor por defecto y una tabla
-- nueva.
-- ============================================================

alter table videos_proyectos add column sonido text not null default '{}' check (json_valid(sonido));

create table if not exists videos_versiones (
  id          text primary key,
  owner_id    text not null references users(id) on delete cascade,
  client_id   text not null references clients(id) on delete cascade,
  video_id    text not null references videos_proyectos(id) on delete cascade,
  version     integer not null check (version >= 1),
  titulo      text not null default '',
  guion       text not null default '{}' check (json_valid(guion)),
  por         text,
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists videos_versiones_dueno on videos_versiones(owner_id);
create index if not exists videos_versiones_cliente on videos_versiones(client_id);
create index if not exists videos_versiones_video on videos_versiones(video_id, version);
