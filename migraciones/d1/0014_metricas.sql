-- ============================================================
-- Resultados: lo que pasa DESPUÉS de publicar
--
--   1. metricas_cuenta: una foto por cuenta y día —seguidores, alcance,
--      vistas, interacciones, visitas al perfil— y en `datos` la
--      audiencia (edad, género, ciudades). Meta sólo da unos días hacia
--      atrás: la evolución de seguidores sólo existe si se guarda cada
--      día. Por eso la toma el cron, no quien abre la pantalla.
--   2. metricas_publicacion: cada publicación de la cuenta con sus
--      números. Se REESCRIBE cada día: los me gusta de un reel siguen
--      subiendo una semana.
--   3. metricas_competencia: los competidores que se siguen por cliente
--      (`clients.competidores`), por business discovery de Instagram.
-- ============================================================

pragma foreign_keys = on;

alter table clients add column competidores text not null default '[]' check (json_valid(competidores));

create table if not exists metricas_cuenta (
  id             text primary key,
  owner_id       text not null references users(id) on delete cascade,
  client_id      text references clients(id) on delete cascade,
  cuenta_id      text not null references cuentas_sociales(id) on delete cascade,
  red            text not null,
  fecha          text not null,
  seguidores     integer,
  publicaciones  integer,
  alcance        integer,
  vistas         integer,
  interacciones  integer,
  visitas_perfil integer,
  datos          text not null default '{}' check (json_valid(datos)),
  created_at     text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (cuenta_id, fecha)
);
create index if not exists metricas_cuenta_dueno on metricas_cuenta(owner_id);
create index if not exists metricas_cuenta_cliente on metricas_cuenta(client_id, fecha);
create index if not exists metricas_cuenta_cuenta on metricas_cuenta(cuenta_id);

create table if not exists metricas_publicacion (
  id             text primary key,
  owner_id       text not null references users(id) on delete cascade,
  client_id      text references clients(id) on delete cascade,
  cuenta_id      text not null references cuentas_sociales(id) on delete cascade,
  red            text not null,
  externo_id     text not null,
  tipo           text not null default '',
  enlace         text not null default '',
  texto          text not null default '',
  miniatura      text not null default '',
  publicada_at   text,
  me_gusta       integer not null default 0,
  comentarios    integer not null default 0,
  guardados      integer not null default 0,
  compartidos    integer not null default 0,
  alcance        integer not null default 0,
  vistas         integer not null default 0,
  interacciones  integer not null default 0,
  updated_at     text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists metricas_publicacion_dueno on metricas_publicacion(owner_id);
create index if not exists metricas_publicacion_cliente on metricas_publicacion(client_id, publicada_at);
create index if not exists metricas_publicacion_cuenta on metricas_publicacion(cuenta_id);

create table if not exists metricas_competencia (
  id             text primary key,
  owner_id       text not null references users(id) on delete cascade,
  client_id      text not null references clients(id) on delete cascade,
  usuario        text not null,
  fecha          text not null,
  seguidores     integer,
  publicaciones  integer,
  interacciones_promedio real,
  datos          text not null default '{}' check (json_valid(datos)),
  created_at     text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (client_id, usuario, fecha)
);
create index if not exists metricas_competencia_dueno on metricas_competencia(owner_id);
create index if not exists metricas_competencia_cliente on metricas_competencia(client_id, fecha);
