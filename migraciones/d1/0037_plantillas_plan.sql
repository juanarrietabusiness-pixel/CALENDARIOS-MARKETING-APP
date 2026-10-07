-- ============================================================
-- Las plantillas de plan y el plan de cada cliente
--
-- Qué se publica cada día de la semana según el plan del cliente (Centrado
-- en ventas, Ventas y seguidores, Marketing 360; por productos, servicios
-- o marca personal). Las nueve de arranque viven en el código
-- (src/lib/plantillasPlan.js): aquí sólo lo que la agencia CAMBIA o crea.
-- Una fila con el `plantilla_id` de una de arranque la sustituye; borrarla
-- la restaura.
--
--   plantilla_id  El id de la plantilla («ventas-productos», «p-mi-plan»).
--                 Único por espacio: dos agencias pueden tener la suya.
--   datos         { nombre, objetivo, negocio, dias: { "1": [{format, pilar}] } }
--
-- Y en `clients`, `plan_contenido`: { plantilla, personalizada } — la que
-- usa el cliente y, si se personalizó para él, su copia entera.
-- ============================================================

pragma foreign_keys = on;

create table if not exists plantillas_plan (
  id            text primary key,
  owner_id      text not null references users(id) on delete cascade,
  plantilla_id  text not null check (length(plantilla_id) between 1 and 60),
  datos         text not null default '{}' check (json_valid(datos)),
  creado_por    text,
  created_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create unique index if not exists plantillas_plan_unica on plantillas_plan(owner_id, plantilla_id);

alter table clients add column plan_contenido text check (plan_contenido is null or json_valid(plan_contenido));
