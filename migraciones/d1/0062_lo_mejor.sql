-- ============================================================
-- «Lo mejor del momento»: lo que mejor funciona, de todas partes, en una galería
--
-- Las piezas salen de lo que ya se guarda (la inspiración de cada cliente, las
-- referencias del equipo, las métricas propias) y de los ANUNCIOS de las
-- búsquedas guardadas de Scrape Creators, releídas una vez por semana. Aquí se
-- guarda lo que se SABE de cada pieza y lo que costó saberlo:
--
--   1. lo_mejor_piezas: por espacio y por pieza (`clave`: «ig:<código>»,
--      «yt:<video>», «fb-ad:<anuncio>»…), su TIPO (anuncio que vende, UGC,
--      motion…) clasificado UNA vez por la IA, cómo se recrea (`camino`), la
--      idea en una frase y lo ya pagado que vale reutilizar (`datos`: la
--      transcripción de un video de YouTube, que no tiene ficha en la galería).
--   2. lo_mejor_anuncios: los anuncios que devolvió cada búsqueda guardada
--      (`biblioteca_filtros` con `fuente: "sc"`), con lo que dice que funciona:
--      cuántos días lleva, si sigue activo, cuántas versiones tiene.
--   3. creditos_sc: cada crédito de Scrape Creators que se gastó (una búsqueda
--      que no salió de la caché), a mano o en la relectura semanal: el tope
--      semanal se cuenta con esto.
--   4. lo_mejor_ajustes: el tope de créditos por semana del espacio (10 por
--      defecto) y cuándo se releyeron por última vez los anuncios.
--
-- Y la dirección del VIDEO de cada publicación de la inspiración (la da Meta con
-- `media_url` y caduca): la tarjeta lo reproduce por el proxy de la API.
-- ============================================================

pragma foreign_keys = on;

create table if not exists lo_mejor_piezas (
  id              text primary key,
  owner_id        text not null references users(id) on delete cascade,
  clave           text not null,
  tipo            text not null default '',
  camino          text not null default '',
  persona         integer not null default 0 check (persona in (0,1)),
  idea            text not null default '',
  datos           text not null default '{}' check (json_valid(datos)),
  clasificada_at  text,
  created_at      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists lo_mejor_piezas_dueno on lo_mejor_piezas(owner_id, clave);

create table if not exists lo_mejor_anuncios (
  id            text primary key,
  owner_id      text not null references users(id) on delete cascade,
  client_id     text references clients(id) on delete cascade,
  filtro_id     text,
  anuncio_id    text not null,
  pagina        text not null default '',
  texto         text not null default '',
  titulo        text not null default '',
  formato       text not null default '',
  miniatura     text not null default '',
  video         text not null default '',
  enlace        text not null default '',
  destino       text not null default '',
  activo        integer not null default 0 check (activo in (0,1)),
  inicio        text,
  fin           text,
  versiones     integer not null default 0,
  plataformas   text not null default '[]' check (json_valid(plataformas)),
  visto_at      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists lo_mejor_anuncios_dueno on lo_mejor_anuncios(owner_id, visto_at);
create index if not exists lo_mejor_anuncios_cliente on lo_mejor_anuncios(client_id);

create table if not exists creditos_sc (
  id          text primary key,
  owner_id    text not null references users(id) on delete cascade,
  semana      text not null,
  fuente      text not null default 'manual' check (fuente in ('manual','auto')),
  creditos    integer not null default 1,
  ruta        text not null default '',
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists creditos_sc_semana on creditos_sc(owner_id, semana);

create table if not exists lo_mejor_ajustes (
  id              text primary key,
  owner_id        text not null references users(id) on delete cascade,
  sc_tope_semana  integer not null default 10 check (sc_tope_semana >= 0 and sc_tope_semana <= 500),
  sc_releido_at   text,
  updated_at      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists lo_mejor_ajustes_dueno on lo_mejor_ajustes(owner_id);

alter table inspiracion_publicaciones add column video text not null default '';
