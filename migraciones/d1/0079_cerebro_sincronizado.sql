-- ============================================================
-- El cerebro de cada cliente, al día con GitHub y sin ensuciarse
--
-- Hasta ahora «Actualizar desde GitHub» sólo recorría lo que existía en el
-- repositorio: lo que se borraba, renombraba o movía allí se quedaba en el
-- cerebro para siempre (las notas «-2» de Baby Caleb, D'CASA y Feria del
-- Lente), una nota borrada aquí volvía sola en la siguiente actualización, y
-- los choques entre lo corregido aquí y lo nuevo de GitHub vivían sólo en la
-- pantalla de quien pulsó el botón (worker/lib/cerebro/importar.js).
--
--   · `cerebro_notas.seccion_hash`: la huella de la sección de GitHub de la que
--     salió la nota, TAL COMO ERA al importarla. Es la base para saber si esa
--     sección cambió en GitHub (y no sólo el archivo). Las de antes quedan
--     vacías: se completa la primera vez que alguien corrige la nota
--     (worker/lib/cerebro/guardar.js) o cuando su archivo vuelve a cambiar.
--   · `cerebro_sync`: una fila por cliente con la última revisión de GitHub,
--     lo que ya se trajo (`archivos`: ruta → sha), lo que no entró (`fuera`),
--     lo que quedó para la siguiente vuelta y el permiso de una sincronización
--     a la vez (`bloqueado_hasta`).
--   · `cerebro_conflictos`: lo que choca, GUARDADO: una nota corregida aquí
--     cuya sección cambió en GitHub (con la versión de GitHub), o cuya
--     sección o archivo ya no está. Una por nota; se va sola con la nota.
--   · `cerebro_no_traer`: lo que se borró aquí y no debe volver al
--     actualizar (archivo + título de la sección).
--
-- Nada de lo que hay se toca.
-- ============================================================

alter table cerebro_notas add column seccion_hash text not null default '';

create table if not exists cerebro_sync (
  id               text primary key,
  owner_id         text not null references users(id) on delete cascade,
  client_id        text not null references clients(id) on delete cascade,
  carpeta          text not null default '',
  huella           text not null default '',
  archivos         text not null default '{}' check (json_valid(archivos)),
  fuera            text not null default '{}' check (json_valid(fuera)),
  pendientes       integer not null default 0,
  ficha_pendiente  integer not null default 0 check (ficha_pendiente in (0,1)),
  error            text not null default '',
  revisado_at      text,
  sincronizado_at  text,
  bloqueado_hasta  text,
  created_at       text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create unique index if not exists cerebro_sync_cliente on cerebro_sync(client_id);
create index if not exists cerebro_sync_dueno on cerebro_sync(owner_id);
create index if not exists cerebro_sync_revisado on cerebro_sync(revisado_at);

create table if not exists cerebro_conflictos (
  id               text primary key,
  owner_id         text not null references users(id) on delete cascade,
  client_id        text not null references clients(id) on delete cascade,
  nota_id          text not null references cerebro_notas(id) on delete cascade,
  tipo             text not null default 'cambio' check (tipo in ('cambio','seccion','archivo')),
  fuente           text not null default '',
  texto            text not null default '',
  seccion_hash     text not null default '',
  fuente_sha       text not null default '',
  avisado_hash     text not null default '',
  created_at       text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create unique index if not exists cerebro_conflictos_nota on cerebro_conflictos(nota_id);
create index if not exists cerebro_conflictos_dueno on cerebro_conflictos(owner_id);
create index if not exists cerebro_conflictos_cliente on cerebro_conflictos(client_id);

create table if not exists cerebro_no_traer (
  id               text primary key,
  owner_id         text not null references users(id) on delete cascade,
  client_id        text not null references clients(id) on delete cascade,
  fuente           text not null,
  titulo           text not null,
  por              text not null default '',
  created_at       text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create unique index if not exists cerebro_no_traer_seccion on cerebro_no_traer(client_id, fuente, titulo);
create index if not exists cerebro_no_traer_dueno on cerebro_no_traer(owner_id);
