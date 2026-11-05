-- ============================================================
-- TikTok por Scrape Creators: las cuentas de cada cliente y las tendencias por tema
--
-- TikTok no deja ver lo de otras cuentas por su API; Scrape Creators sí, a un
-- crédito por petición. La agencia decidió usarlo SÓLO para anuncios y para
-- TikTok, dentro del MISMO tope semanal de créditos del espacio
-- (`lo_mejor_ajustes.sc_tope_semana`). Aquí:
--
--   1. inspiracion_cuentas.leida_sc_at: cuándo se leyó por última vez una cuenta
--      de TikTok por Scrape Creators (bien o con error). Una cuenta se lee como
--      mucho una vez por semana; las de Instagram y YouTube siguen con su
--      `actualizada_at` (cada 20 h, gratis).
--   2. inspiracion_publicaciones.compartidos: lo que TikTok sí da y la tarjeta
--      enseña.
--   3. lo_mejor_ajustes.tiktok_tendencias: el interruptor de las tendencias del
--      espacio (encendido: lo que cuenta es que un cliente tenga palabras), y
--      sc_lleno: la semana (su lunes) en que el tope se llenó. Lo automático no
--      vuelve a mirar ese espacio hasta la semana siguiente.
--   4. tendencias_palabras: las palabras o #hashtags del rubro de cada cliente,
--      con cuándo se buscaron por última vez (una petición por palabra y semana).
--   5. tendencias_videos: los videos que más funcionan esa semana para cada
--      palabra (sus vistas, me gusta, comentarios, compartidos), otra fuente de
--      «Lo mejor».
-- ============================================================

pragma foreign_keys = on;

alter table inspiracion_cuentas add column leida_sc_at text;
alter table inspiracion_publicaciones add column compartidos integer not null default 0;

alter table lo_mejor_ajustes add column tiktok_tendencias integer not null default 1 check (tiktok_tendencias in (0,1));
alter table lo_mejor_ajustes add column sc_lleno text;

create table if not exists tendencias_palabras (
  id          text primary key,
  owner_id    text not null references users(id) on delete cascade,
  client_id   text not null references clients(id) on delete cascade,
  palabra     text not null,
  leida_at    text,
  error       text not null default '',
  videos      integer not null default 0,
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists tendencias_palabras_dueno on tendencias_palabras(owner_id, leida_at);
create index if not exists tendencias_palabras_cliente on tendencias_palabras(client_id);

create table if not exists tendencias_videos (
  id            text primary key,
  owner_id      text not null references users(id) on delete cascade,
  client_id     text not null references clients(id) on delete cascade,
  palabra_id    text not null references tendencias_palabras(id) on delete cascade,
  palabra       text not null default '',
  externo_id    text not null,
  usuario       text not null default '',
  nombre        text not null default '',
  formato       text not null default 'video',
  enlace        text not null default '',
  texto         text not null default '',
  miniatura     text not null default '',
  video         text not null default '',
  publicada_at  text,
  vistas        integer not null default 0,
  me_gusta      integer not null default 0,
  comentarios   integer not null default 0,
  compartidos   integer not null default 0,
  visto_at      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists tendencias_videos_dueno on tendencias_videos(owner_id, visto_at);
create index if not exists tendencias_videos_cliente on tendencias_videos(client_id);
create index if not exists tendencias_videos_palabra on tendencias_videos(palabra_id);
