-- ============================================================
-- Trabajar en equipo: quién lleva qué, avisos, hilo interno,
-- historial y papeles (docs/propuesta-equipo.md)
--
-- 1. Responsable = PERSONA. `assigned_to` era texto libre: un nombre mal
--    escrito creaba otro «responsable» y cambiarse el nombre dejaba las
--    tareas sin dueño. Ahora va además `asignado_id` (el user_id); el
--    nombre se sigue guardando para lo que se asigna a alguien sin cuenta.
--    Las de antes se casan con un miembro por nombre UNA vez, aquí.
-- 2. `avisos`: la bandeja de cada persona. Se guarda en D1, así que llega
--    aunque no estuviera conectada cuando pasó.
-- 3. `notas_equipo`: el hilo interno de cada publicación, con autor y
--    hora. La «nota interna» era un campo: el último que escribía pisaba.
-- 4. `historial`: quién cambió qué en cada publicación.
-- 5. Tareas ligadas a una publicación (`calendar_id`, `post_id`).
-- 6. Revisión interna por cliente (`clients.revision_interna`).
-- 7. Papeles más finos SIN tocar el `check` de `rol` (cambiarlo obligaría
--    a reconstruir la tabla): `solo_lectura` y `clientes` (null = todos;
--    una lista JSON = colaborador que sólo ve esos clientes).
-- ============================================================

pragma foreign_keys = on;

alter table client_tasks add column asignado_id text;
alter table quick_tasks  add column asignado_id text;
alter table client_tasks add column calendar_id text;
alter table client_tasks add column post_id text;

update client_tasks set asignado_id = (
  select m.user_id from memberships m
   where m.owner_id = client_tasks.owner_id and trim(m.nombre) <> ''
     and lower(trim(m.nombre)) = lower(trim(client_tasks.assigned_to))
   limit 1
) where asignado_id is null and trim(assigned_to) <> '';

update quick_tasks set asignado_id = (
  select m.user_id from memberships m
   where m.owner_id = quick_tasks.owner_id and trim(m.nombre) <> ''
     and lower(trim(m.nombre)) = lower(trim(quick_tasks.assigned_to))
   limit 1
) where asignado_id is null and trim(assigned_to) <> '';

create index if not exists tareas_asignado on client_tasks(asignado_id);
create index if not exists tareas_publicacion on client_tasks(calendar_id, post_id);
create index if not exists quick_tasks_asignado on quick_tasks(asignado_id);

create table if not exists avisos (
  id          text primary key,
  owner_id    text not null references users(id) on delete cascade,
  user_id     text not null references users(id) on delete cascade,
  tipo        text not null,
  texto       text not null,
  enlace      text not null default '',
  por_nombre  text not null default '',
  leido_at    text,
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists avisos_persona on avisos(user_id, leido_at, created_at);
create index if not exists avisos_dueno on avisos(owner_id);

create table if not exists notas_equipo (
  id           text primary key,
  owner_id     text not null references users(id) on delete cascade,
  calendar_id  text not null references calendars(id) on delete cascade,
  post_id      text not null,
  autor_id     text not null,
  autor_nombre text not null default '',
  texto        text not null,
  menciones    text not null default '[]' check (json_valid(menciones)),
  created_at   text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists notas_equipo_post on notas_equipo(calendar_id, post_id, created_at);
create index if not exists notas_equipo_dueno on notas_equipo(owner_id);

create table if not exists historial (
  id           text primary key,
  owner_id     text not null references users(id) on delete cascade,
  calendar_id  text not null references calendars(id) on delete cascade,
  post_id      text not null,
  user_id      text not null default '',
  nombre       text not null default '',
  accion       text not null,
  created_at   text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists historial_post on historial(calendar_id, post_id, created_at);
create index if not exists historial_dueno on historial(owner_id);

alter table clients add column revision_interna integer not null default 0 check (revision_interna in (0,1));

alter table memberships  add column solo_lectura integer not null default 0 check (solo_lectura in (0,1));
alter table memberships  add column clientes text check (clientes is null or json_valid(clientes));
alter table invitaciones add column solo_lectura integer not null default 0 check (solo_lectura in (0,1));
alter table invitaciones add column clientes text check (clientes is null or json_valid(clientes));
