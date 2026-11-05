-- ============================================================
-- El plan semanal ÚNICO de cada empresa (fase 6: el mes en un solo flujo)
--
-- Formato, tipo, HORA y NOTA de cada día de la semana en un solo sitio
-- (src/lib/planSemanal.js): { v: 1, base, nombre, objetivo, negocio, dias,
-- notas, linea }. `dias` vacío es «el estándar de la agencia». Antes vivía en
-- cinco sitios —la copia de la plantilla (`plan_contenido`), el ritmo
-- (`ritmo_contenido`), las notas (`notas_semana`), la ficha y los
-- `day_labels` del mes— y lo guardado allí se SIGUE LEYENDO: nada se migra a
-- la fuerza. Al guardar el plan se escribe esta columna y, derivadas de ella,
-- las de antes (las lee la IA y una ficha abierta desde antes).
--
-- Va en su columna y no la escribe `clientToRow`: sólo la toca
-- PUT /api/clientes/<id>/plan-semanal, así una ficha abierta desde antes no
-- la pisa.
-- ============================================================

alter table clients add column plan_semanal text check (plan_semanal is null or json_valid(plan_semanal));
