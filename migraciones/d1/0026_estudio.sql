-- ============================================================
-- El Estudio: imágenes (y, después, video) por trabajos, por cliente
--
-- Hasta ahora una imagen era UNA llamada síncrona a Gemini que devolvía
-- una clave de R2 y no dejaba rastro: no había galería, ni costo por
-- pieza, ni forma de volver a una imagen de hace una semana. Aquí una
-- petición es un TRABAJO que se avanza por pasos acotados —el Worker no
-- puede esperar— y lo que sale es un ARCHIVO del cliente, con su prompt,
-- su modelo y su costo, que se ve en la galería y se puede poner en una
-- publicación.
--
--   estudio_trabajos   Lo que se ha pedido y por dónde va. `estado`:
--                      en_cola · en_marcha · hecho · fallido · cancelado.
--                      `remoto` guarda los ids del motor (para que un
--                      video que tarda minutos se reanude), `archivos` los
--                      ya guardados (para que repetir un paso nunca guarde
--                      ni cobre dos veces lo mismo). `bloqueado_hasta` es el
--                      permiso de UN paso a la vez: quien avanza el trabajo lo
--                      reserva con esa fecha como condición y lo suelta al
--                      terminar; si el Worker muere a medias, caduca solo.
--   estudio_archivos   Lo que hay en la galería: lo generado y lo subido.
--                      `clave` es la de R2 —los bytes NUNCA van en la
--                      base—. `borrado_at` es la papelera (30 días).
--                      `usado_en` dice qué publicaciones lo usan: lo que
--                      se usa no se purga.
--   estudio_carpetas   Etiquetas, no directorios: un archivo nunca se mueve
--                      en R2, así los enlaces que ya tiene una publicación
--                      siguen valiendo.
--
-- Todas con dueño (el espacio) y cliente, y declaradas en
-- worker/lib/acceso.js: la capa las acota, no cada ruta. Sin `check` en
-- `estado`, `tipo` ni `motor`: cambiar un check en SQLite es reconstruir
-- la tabla (0022) y estos van a crecer; se validan en código
-- (worker/lib/estudio/). `carpeta_id` y `trabajo_id` no son claves ajenas
-- a propósito: quitar una carpeta no puede llevarse los archivos.
-- ============================================================

pragma foreign_keys = on;

create table if not exists estudio_trabajos (
  id              text primary key,
  owner_id        text not null references users(id) on delete cascade,
  client_id       text not null references clients(id) on delete cascade,
  estado          text not null default 'en_cola',
  tipo            text not null default 'imagen',
  motor           text not null,
  modelo          text not null,
  prompt          text not null default '',
  n               integer not null default 1 check (n >= 1 and n <= 8),
  ajustes         text not null default '{}' check (json_valid(ajustes)),
  medios          text not null default '{}' check (json_valid(medios)),
  remoto          text not null default '[]' check (json_valid(remoto)),
  archivos        text not null default '[]' check (json_valid(archivos)),
  nota            text not null default '',
  intentos        integer not null default 0,
  bloqueado_hasta text not null default '',
  costo_estimado  real not null default 0,
  costo           real not null default 0,
  error           text not null default '',
  origen          text not null default 'persona',
  creado_por      text,
  calendar_id     text,
  post_id         text,
  carpeta_id      text,
  created_at      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  terminado_at    text
);

create index if not exists estudio_trabajos_dueno on estudio_trabajos(owner_id);
create index if not exists estudio_trabajos_cliente on estudio_trabajos(client_id, created_at);
-- Lo que hay que seguir avanzando (el navegador y el cron lo buscan).
create index if not exists estudio_trabajos_estado on estudio_trabajos(estado, updated_at);

create table if not exists estudio_archivos (
  id          text primary key,
  owner_id    text not null references users(id) on delete cascade,
  client_id   text not null references clients(id) on delete cascade,
  clave       text not null,
  tipo        text not null default 'imagen',
  mime        text not null default 'image/png',
  ancho       integer not null default 0,
  alto        integer not null default 0,
  bytes       integer not null default 0,
  prompt      text not null default '',
  modelo      text not null default '',
  ajustes     text not null default '{}' check (json_valid(ajustes)),
  trabajo_id  text,
  carpeta_id  text,
  origen      text not null default 'estudio',
  costo       real not null default 0,
  favorito    integer not null default 0 check (favorito in (0,1)),
  subido      integer not null default 0 check (subido in (0,1)),
  usado_en    text not null default '[]' check (json_valid(usado_en)),
  borrado_at  text,
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create index if not exists estudio_archivos_dueno on estudio_archivos(owner_id);
create index if not exists estudio_archivos_cliente on estudio_archivos(client_id, created_at);
create unique index if not exists estudio_archivos_clave on estudio_archivos(client_id, clave);

create table if not exists estudio_carpetas (
  id          text primary key,
  owner_id    text not null references users(id) on delete cascade,
  client_id   text not null references clients(id) on delete cascade,
  nombre      text not null,
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create index if not exists estudio_carpetas_dueno on estudio_carpetas(owner_id);
create index if not exists estudio_carpetas_cliente on estudio_carpetas(client_id);
