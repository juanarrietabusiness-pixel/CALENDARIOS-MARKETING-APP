-- ============================================================
-- Los proyectos de VIDEO ANIMADO (escenas dibujadas con código)
--
-- Un proyecto es un video de un cliente: su guion por escenas (el formato
-- de src/lib/videoEscenas.js, en `guion`), la locución que se generó para
-- él y, en la fase 2, lo que salió del render. Puede ir atado a una
-- publicación (`calendar_id` + `post_id`, como la cola de publicación: la
-- publicación vive dentro del JSON del calendario y no tiene fila propia).
--
-- El ciclo (`estado`): borrador → aprobado → con_voz → renderizando →
-- renderizado (o fallido). El CHECK es el mismo que ESTADOS_VIDEO: en
-- SQLite un CHECK no se cambia sin reconstruir la tabla, así que ya van los
-- estados de la fase 2.
--
-- `version` sube con cada cambio del guion y `aprobada_version` es la que
-- se aprobó: la locución sólo se genera si las dos coinciden, así un guion
-- editado después de aprobar no se paga sin aprobarlo otra vez. La
-- locución guarda la versión para la que se hizo (`locucion.version`).
--
-- Nada de lo que hay se toca: es una tabla nueva.
-- ============================================================

create table if not exists videos_proyectos (
  id               text primary key,
  owner_id         text not null references users(id) on delete cascade,
  client_id        text not null references clients(id) on delete cascade,
  calendar_id      text references calendars(id) on delete set null,
  post_id          text,
  titulo           text not null default '',
  estado           text not null default 'borrador'
                     check (estado in ('borrador','aprobado','con_voz','renderizando','renderizado','fallido')),
  version          integer not null default 1 check (version >= 1),
  aprobada_version integer,
  guion            text not null default '{}' check (json_valid(guion)),
  locucion         text not null default '{}' check (json_valid(locucion)),
  render           text not null default '{}' check (json_valid(render)),
  nota             text not null default '',
  creado_por       text,
  aprobado_por     text,
  aprobado_at      text,
  created_at       text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists videos_proyectos_dueno on videos_proyectos(owner_id);
create index if not exists videos_proyectos_cliente on videos_proyectos(client_id, updated_at);
create index if not exists videos_proyectos_calendario on videos_proyectos(calendar_id, post_id);
