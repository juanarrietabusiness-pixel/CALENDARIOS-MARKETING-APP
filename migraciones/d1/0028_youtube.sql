-- ============================================================
-- YouTube como red: cuentas, cola y métricas
--
-- `cuentas_sociales.red` y `publicaciones_programadas.red` nacieron con
-- `check (red in ('instagram','facebook','tiktok'))`, y SQLite no deja
-- cambiar un CHECK: hay que reconstruir la tabla, como en 0022.
--
-- LA TRAMPA: `cuentas_sociales` TIENE HIJAS, y dos con cascada.
--
--   metricas_cuenta.cuenta_id       on delete cascade
--   metricas_publicacion.cuenta_id  on delete cascade
--   publicaciones_programadas.cuenta_id  on delete set null
--
-- Con las claves ajenas encendidas (D1 no deja apagarlas), `drop table`
-- hace antes un `delete from` implícito, y ESO dispara las acciones de
-- las hijas: soltar `cuentas_sociales` tal cual borraría toda la
-- historia de métricas y dejaría la cola sin cuenta. `defer_foreign_keys`
-- no lo evita: aplaza la COMPROBACIÓN, no las acciones.
--
-- Por eso se reconstruyen las cuatro, en este orden:
--
--   1. cuentas_sociales_v2 (con 'youtube'), y se copia.
--   2. Las tres hijas en su _v2, apuntando YA a cuentas_sociales_v2, y
--      se copian (sus claves ajenas se cumplen: la madre nueva ya está).
--   3. Se sueltan las hijas viejas: nadie las referencia.
--   4. Se suelta cuentas_sociales vieja: a esas alturas nadie la
--      referencia, así que el `delete` implícito no arrastra nada.
--   5. Se renombra: al renombrar la madre, SQLite reescribe las claves
--      ajenas de las hijas («cuentas_sociales_v2» → «cuentas_sociales»),
--      y después cada hija toma su nombre.
--
-- Se reconstruyen con TODAS sus columnas de hoy (0013, 0014 y la
-- `variante` de 0016) y los mismos checks. Lo único que cambia es que
-- las dos columnas `red` admiten «youtube». `tests/migracion/youtube.test.js`
-- siembra filas en las cuatro, aplica esta migración otra vez y comprueba
-- que no se pierde ninguna.
-- ============================================================

pragma foreign_keys = on;

-- 1. La madre.
create table if not exists cuentas_sociales_v2 (
  id              text primary key,
  owner_id        text not null references users(id) on delete cascade,
  red             text not null check (red in ('instagram','facebook','tiktok','youtube')),
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
create index if not exists cuentas_sociales_v2_dueno on cuentas_sociales_v2(owner_id);
create index if not exists cuentas_sociales_v2_cliente on cuentas_sociales_v2(client_id);

insert or ignore into cuentas_sociales_v2
  (id, owner_id, red, externo_id, nombre, usuario, avatar, pagina_id, token_cifrado, refresh_cifrado, expira, client_id, datos, created_at, updated_at)
select id, owner_id, red, externo_id, nombre, usuario, avatar, pagina_id, token_cifrado, refresh_cifrado, expira, client_id, datos, created_at, updated_at
from cuentas_sociales;

-- 2. Las hijas, apuntando a la madre nueva.
create table if not exists publicaciones_programadas_v2 (
  id                text primary key,
  owner_id          text not null references users(id) on delete cascade,
  client_id         text not null references clients(id) on delete cascade,
  calendar_id       text references calendars(id) on delete set null,
  post_id           text not null,
  red               text not null check (red in ('instagram','facebook','tiktok','youtube')),
  cuenta_id         text references cuentas_sociales_v2(id) on delete set null,
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
  updated_at        text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  variante          text not null default 'post' check (variante in ('post','historia'))
);
create index if not exists publicaciones_programadas_v2_cola on publicaciones_programadas_v2(estado, programada_para);
create index if not exists publicaciones_programadas_v2_dueno on publicaciones_programadas_v2(owner_id);
create index if not exists publicaciones_programadas_v2_cliente on publicaciones_programadas_v2(client_id);
create index if not exists publicaciones_programadas_v2_cal on publicaciones_programadas_v2(calendar_id);
create index if not exists publicaciones_programadas_v2_cuenta on publicaciones_programadas_v2(cuenta_id);
create index if not exists publicaciones_programadas_v2_post on publicaciones_programadas_v2(calendar_id, post_id, red, variante);

insert or ignore into publicaciones_programadas_v2
  (id, owner_id, client_id, calendar_id, post_id, red, cuenta_id, programada_para, estado, intentos, siguiente_intento,
   contenedor_id, externo_id, enlace, error, carga, creado_por, publicada_at, created_at, updated_at, variante)
select id, owner_id, client_id, calendar_id, post_id, red, cuenta_id, programada_para, estado, intentos, siguiente_intento,
   contenedor_id, externo_id, enlace, error, carga, creado_por, publicada_at, created_at, updated_at, variante
from publicaciones_programadas;

create table if not exists metricas_cuenta_v2 (
  id             text primary key,
  owner_id       text not null references users(id) on delete cascade,
  client_id      text references clients(id) on delete cascade,
  cuenta_id      text not null references cuentas_sociales_v2(id) on delete cascade,
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
create index if not exists metricas_cuenta_v2_dueno on metricas_cuenta_v2(owner_id);
create index if not exists metricas_cuenta_v2_cliente on metricas_cuenta_v2(client_id, fecha);
create index if not exists metricas_cuenta_v2_cuenta on metricas_cuenta_v2(cuenta_id);

insert or ignore into metricas_cuenta_v2
  (id, owner_id, client_id, cuenta_id, red, fecha, seguidores, publicaciones, alcance, vistas, interacciones, visitas_perfil, datos, created_at)
select id, owner_id, client_id, cuenta_id, red, fecha, seguidores, publicaciones, alcance, vistas, interacciones, visitas_perfil, datos, created_at
from metricas_cuenta;

create table if not exists metricas_publicacion_v2 (
  id             text primary key,
  owner_id       text not null references users(id) on delete cascade,
  client_id      text references clients(id) on delete cascade,
  cuenta_id      text not null references cuentas_sociales_v2(id) on delete cascade,
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
create index if not exists metricas_publicacion_v2_dueno on metricas_publicacion_v2(owner_id);
create index if not exists metricas_publicacion_v2_cliente on metricas_publicacion_v2(client_id, publicada_at);
create index if not exists metricas_publicacion_v2_cuenta on metricas_publicacion_v2(cuenta_id);

insert or ignore into metricas_publicacion_v2
  (id, owner_id, client_id, cuenta_id, red, externo_id, tipo, enlace, texto, miniatura, publicada_at,
   me_gusta, comentarios, guardados, compartidos, alcance, vistas, interacciones, updated_at)
select id, owner_id, client_id, cuenta_id, red, externo_id, tipo, enlace, texto, miniatura, publicada_at,
   me_gusta, comentarios, guardados, compartidos, alcance, vistas, interacciones, updated_at
from metricas_publicacion;

-- 3. Se sueltan las hijas viejas: todas sus filas acaban de copiarse
-- arriba, columna a columna, y ninguna otra tabla las referencia.
drop table publicaciones_programadas;
-- (la de métricas de cuenta, igual: copiada entera en metricas_cuenta_v2)
drop table metricas_cuenta;
-- (y la de métricas por publicación, copiada entera en metricas_publicacion_v2)
drop table metricas_publicacion;

-- 4. La madre vieja: copiada entera en cuentas_sociales_v2 y, sin las
-- hijas viejas, nadie la referencia: su `delete` implícito no arrastra nada.
drop table cuentas_sociales;

-- 5. Cada una a su nombre. La madre primero: al renombrarla, SQLite
-- reescribe las claves ajenas de las hijas nuevas.
alter table cuentas_sociales_v2 rename to cuentas_sociales;
alter table publicaciones_programadas_v2 rename to publicaciones_programadas;
alter table metricas_cuenta_v2 rename to metricas_cuenta;
alter table metricas_publicacion_v2 rename to metricas_publicacion;
