-- ============================================================
-- Tareas avanzadas — asignación, tareas rápidas globales
--
-- `recurrence_day` ya existe en client_tasks y task_templates
-- desde 0001_esquema.sql. Lo que faltaba:
--
--   1. `assigned_to` en las tareas y plantillas, para saber quién
--      se encarga sin necesidad de delegar entre perfiles.
--   2. `quick_tasks`, tareas sueltas de la agencia que no van
--      ligadas a ningún cliente.
-- ============================================================

pragma foreign_keys = on;

-- 1. Asignación libre en tareas y plantillas
alter table client_tasks  add column assigned_to text not null default '';
alter table task_templates add column assigned_to text not null default '';

-- 2. Tareas rápidas (inbox global)
create table if not exists quick_tasks (
  id          text primary key,
  owner_id    text not null references users(id) on delete cascade,
  title       text not null,
  status      text not null default 'pending',
  assigned_to text not null default '',
  completed_at text,
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists quick_tasks_owner on quick_tasks(owner_id, status);
