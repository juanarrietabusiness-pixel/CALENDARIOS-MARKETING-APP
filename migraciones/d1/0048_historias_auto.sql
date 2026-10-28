-- ============================================================
-- Historias automáticas: lo ya publicado vuelve como historia, una al día
--
-- `historias_auto`: el interruptor de cada cliente, su hora y sus redes, y el
-- último día que se puso en la cola (el cron no lo pone dos veces).
-- `historias_auto_piezas`: la historia ya hecha de cada publicación (la imagen
-- encajada en 9:16 con su frase, en R2) y cuántas veces salió. `clave_post` es
-- «calendario|publicación»: una por publicación aunque saliera en dos redes.
-- Lo publica la cola de siempre (`publicaciones_programadas`, sin calendario).
-- ============================================================

create table if not exists historias_auto (
  id            text primary key,
  owner_id      text not null references users(id) on delete cascade,
  client_id     text not null references clients(id) on delete cascade,
  activa        integer not null default 0 check (activa in (0, 1)),
  hora          text not null default '18:00',
  redes         text not null default '["instagram"]' check (json_valid(redes)),
  ultima_fecha  text,
  nota          text not null default '',
  created_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (client_id)
);
create index if not exists historias_auto_dueno on historias_auto(owner_id);
create index if not exists historias_auto_cliente on historias_auto(client_id);
create index if not exists historias_auto_activa on historias_auto(activa, ultima_fecha);

create table if not exists historias_auto_piezas (
  id            text primary key,
  owner_id      text not null references users(id) on delete cascade,
  client_id     text not null references clients(id) on delete cascade,
  clave_post    text not null,
  fila_id       text,
  externo_id    text not null default '',
  clave         text not null,
  titulo        text not null default '',
  frase         text not null default '',
  publicada_at  text,
  usos          integer not null default 0,
  usada_at      text,
  created_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (client_id, clave_post)
);
create index if not exists historias_auto_piezas_dueno on historias_auto_piezas(owner_id);
create index if not exists historias_auto_piezas_cliente on historias_auto_piezas(client_id);
