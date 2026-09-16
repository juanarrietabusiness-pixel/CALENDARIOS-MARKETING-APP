-- ============================================================
-- Esquema de D1 — calendarios
--
-- Derivado de la INTROSPECCIÓN de la base viva, no de reproducir
-- supabase/migrations/. Los dos no coinciden: el registro remoto
-- tiene 8 versiones contra 13 ficheros, una registrada sin fichero
-- («restrict_agency_rpc_to_authenticated») y seis ficheros sin
-- registrar. Reproducir el repositorio daría un esquema distinto
-- del que está en producción.
--
-- Reglas de conversión aplicadas:
--   uuid          → text, generado en el Worker (SQLite no trae UUID)
--   jsonb         → text + check (json_valid(x))
--   timestamptz   → text ISO-8601 UTC, que es lo que el front ya recibe
--   boolean       → integer 0/1
--   smallint      → integer
--   trigger set_updated_at → lo pone la capa de acceso; un trigger
--                   «after update» sobre su propia tabla se rellama
--
-- Lo que NO viaja: las 16 políticas RLS. D1 no las tiene. Su
-- intención se traduce a la capa de acceso, que exige el owner_id
-- en cada consulta, y a los tests que vigilan que nadie la esquive.
--
-- CONSECUENCIA: `owner_id` pasa a ser la columna más consultada del
-- esquema —va en el WHERE de TODAS las consultas, no sólo de algunas—,
-- así que toda tabla que lo tenga lleva su índice. Con cuatro clientes
-- no se nota; con el hub y varias manos, sí.
-- ============================================================

pragma foreign_keys = on;

-- ------------------------------------------------------------
-- Identidad
--
-- Vive aquí sólo hasta que exista el hub (docs/hub-cloudflare.md,
-- fase H3): entonces owner_id pasa a apuntar a hub-core-db.users y
-- estas dos tablas se retiran.
-- ------------------------------------------------------------

create table users (
  id            text primary key,
  email         text not null unique,
  password_hash text not null,          -- PBKDF2-SHA256, 210.000 iteraciones
  salt          text not null,
  created_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Se guarda el SHA-256 del testigo, nunca el testigo: un volcado de
-- D1 no puede devolver sesiones utilizables.
create table sessions (
  token_hash text primary key,
  user_id    text not null references users(id) on delete cascade,
  created_at text not null,
  expires_at text not null,
  user_agent text not null default ''
);
create index sessions_expira  on sessions(expires_at);
create index sessions_usuario on sessions(user_id);

-- ------------------------------------------------------------
-- Clientes
-- ------------------------------------------------------------

create table clients (
  id               text primary key,
  owner_id         text not null references users(id) on delete cascade,
  name             text not null,
  industry         text not null default '',
  instagram        text not null default '',
  phone            text not null default '',
  whatsapp         text not null default '',
  sucursales       text not null default '',
  direcciones      text not null default '',
  primary_color    text not null default '#1E90FF',
  secondary_color  text not null default '#FFFFFF',
  accent_color     text not null default '#F5A623',
  logo             text,                -- clave de R2; nunca un data: URI
  descripcion      text not null default '',
  valores          text not null default '',
  audiencia        text not null default '',
  competencia      text not null default '',
  estilo_guion     text not null default '',
  estilo_locucion  text not null default '',
  hashtags         text not null default '',
  notas_inspeccion text not null default '',
  github_repo      text not null default '',
  github_folder    text not null default '',
  github_context   text not null default '',
  ai_instructions  text not null default '',
  ideas_bank       text not null default '[]' check (json_valid(ideas_bank)),
  saved_categories text not null default '[]' check (json_valid(saved_categories)),
  weekly_structure text not null default '[]' check (json_valid(weekly_structure)),
  meta_recipe      text check (meta_recipe is null or json_valid(meta_recipe)),
  meta_recipe_sha  text,
  meta_recipe_at   text,
  created_at       text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index clients_owner on clients(owner_id, created_at);

-- ------------------------------------------------------------
-- Calendarios
--
-- `days` y `visual_references` son el sitio donde hoy viven las
-- imágenes en base64. Tras la fase 6 guardan claves de R2: un
-- calendario con 12 de 25 publicaciones ilustradas ya pesa 501.884
-- caracteres, y D1 corta la fila a 2 MB y la sentencia a 100 kB.
-- ------------------------------------------------------------

create table calendars (
  id                text primary key,
  client_id         text not null references clients(id) on delete cascade,
  owner_id          text not null references users(id)   on delete cascade,
  name              text not null default '',
  month             integer not null check (month between 0 and 11),
  year              integer not null,
  campaign          text not null default '',
  week_concepts     text not null default '[]' check (json_valid(week_concepts)),
  days              text not null default '[]' check (json_valid(days)),
  visual_references text not null default '[]' check (json_valid(visual_references)),
  day_labels        text not null default '{}' check (json_valid(day_labels)),
  offers            text not null default '',
  promo_code        text not null default '',
  approval_id       text,
  generated_at      text,
  share_token       text,
  share_enabled     integer not null default 1 check (share_enabled in (0,1)),
  share_expires_at  text,
  allow_editing     integer not null default 0 check (allow_editing in (0,1)),
  created_at        text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index        calendars_owner  on calendars(owner_id, created_at);
create index        calendars_client on calendars(client_id);
create unique index calendars_share  on calendars(share_token) where share_token is not null;

-- ------------------------------------------------------------
-- Aprobaciones
--
-- El UNIQUE no es decorativo: es lo que sostiene el upsert por
-- (calendar_id, post_id) que hacía submit_approval.
-- ------------------------------------------------------------

create table approvals (
  id                    text primary key,
  calendar_id           text not null references calendars(id) on delete cascade,
  post_id               text not null,
  estado                text not null check (estado in ('aprobado','cambios')),
  comentario            text not null default '',
  reviewer_name         text not null default '',
  suggested_descripcion text,
  suggested_guion       text,
  created_at            text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at            text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (calendar_id, post_id)
);
create index approvals_cal on approvals(calendar_id);

-- ------------------------------------------------------------
-- Asistente, memoria, tareas y banco
-- ------------------------------------------------------------

create table chat_messages (
  id         text primary key,
  client_id  text not null references clients(id) on delete cascade,
  owner_id   text not null references users(id)   on delete cascade,
  role       text not null check (role in ('user','assistant')),
  content    text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index chat_cliente on chat_messages(client_id, created_at);
create index chat_dueno   on chat_messages(owner_id);

create table client_memories (
  id         text primary key,
  client_id  text not null references clients(id) on delete cascade,
  owner_id   text not null references users(id)   on delete cascade,
  content    text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index memorias_cliente on client_memories(client_id, created_at);
create index memorias_dueno   on client_memories(owner_id);

create table client_tasks (
  id             text primary key,
  client_id      text not null references clients(id) on delete cascade,
  owner_id       text not null references users(id)   on delete cascade,
  title          text not null,
  description    text not null default '',
  status         text not null default 'pending',
  due_date       text,
  recurrence     text not null default 'none',
  recurrence_day integer,
  completed_at   text,
  created_at     text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index tareas_cliente on client_tasks(client_id, status);
create index tareas_dueno   on client_tasks(owner_id);

create table task_templates (
  id             text primary key,
  owner_id       text not null references users(id) on delete cascade,
  title          text not null,
  description    text not null default '',
  recurrence     text not null default 'none',
  recurrence_day integer,
  is_mandatory   integer not null default 1 check (is_mandatory in (0,1)),
  created_at     text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index plantillas_dueno on task_templates(owner_id);

create table content_bank (
  id          text primary key,
  client_id   text not null references clients(id) on delete cascade,
  owner_id    text not null references users(id)   on delete cascade,
  file_path   text not null,            -- clave de R2
  file_name   text not null,
  file_type   text not null default 'image' check (file_type in ('image','video')),
  description text not null default '',
  size_bytes  integer not null default 0,
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index banco_cliente on content_bank(client_id, created_at);
create index banco_dueno   on content_bank(owner_id);
