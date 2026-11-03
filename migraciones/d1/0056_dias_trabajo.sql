-- ============================================================
-- Los días fijos de cada empresa en «Mi día» por semanas
--
-- La agencia trabaja por días (los lunes D'CASA, los martes ROFER…). JSON con
-- los días de la semana, 1 = lunes … 6 = sábado (src/lib/semanaTareas.js). Es
-- del equipo entero y se repite cada semana hasta que alguien lo cambie.
-- Vacío = ningún día fijo: la empresa sale sólo el día que tenga tareas.
--
-- Va en su columna y no la escribe `clientToRow`: sólo la toca Mi día
-- (PUT /api/clientes/<id>/dias), así una ficha abierta desde antes no la pisa.
-- ============================================================

alter table clients add column dias_trabajo text check (dias_trabajo is null or json_valid(dias_trabajo));
