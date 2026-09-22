-- ============================================================
-- Descripción y orden en tareas
--
--   1. `description` en quick_tasks (client_tasks y task_templates
--      ya la tienen desde 0001_esquema.sql).
--   2. `position` en client_tasks y quick_tasks: orden visual
--      decidido por el usuario, no el de creación.
-- ============================================================

pragma foreign_keys = on;

alter table client_tasks  add column position    integer not null default 0;

alter table quick_tasks   add column description text not null default '';
alter table quick_tasks   add column position    integer not null default 0;
