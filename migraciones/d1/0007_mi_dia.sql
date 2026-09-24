-- ============================================================
-- «Mi día»: la marca de hoy y las fechas límite
--
--   1. `today_date` en client_tasks y quick_tasks: el día para el que
--      alguien marcó la tarea con «Hoy». Es una FECHA y no un sí/no a
--      propósito: si no se hace, al día siguiente la marca queda en el
--      pasado y la tarea pasa sola a «Atrasadas», sin que nadie tenga
--      que acordarse de desmarcarla.
--   2. `due_date` en quick_tasks. client_tasks ya la tenía desde la
--      primera migración, sin que nada la usara.
--
-- Las fechas van como texto AAAA-MM-DD, igual que `due_date`: son días
-- del calendario de la agencia, no instantes.
-- ============================================================

alter table client_tasks add column today_date text;
alter table quick_tasks  add column today_date text;
alter table quick_tasks  add column due_date   text;
