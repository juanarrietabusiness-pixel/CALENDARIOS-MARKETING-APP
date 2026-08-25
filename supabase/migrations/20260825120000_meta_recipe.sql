-- ============================================================
-- La receta visual del cliente, compilada desde su repositorio
--
-- Es lo que no cambia de un mes a otro: retícula, escala, plantillas,
-- bloque de estilo, negativos y las reglas del logo. Sale de
-- `01_ADN_y_Memoria/05_prompt_maestro_meta_ai.md` en GitHub, y se guarda
-- aquí para no recompilarla en cada calendario.
--
-- `meta_recipe_sha` es el SHA del archivo de origen: mientras coincida,
-- la receta guardada sigue valiendo. Cuando el humano cambie ese archivo
-- en el repositorio, el SHA cambia y la aplicación lo ve sin que nadie
-- tenga que acordarse de pulsar «recompilar».
-- ============================================================

alter table public.clients
  add column if not exists meta_recipe     jsonb,
  add column if not exists meta_recipe_sha text,
  add column if not exists meta_recipe_at  timestamptz;

comment on column public.clients.meta_recipe is
  'Receta visual compilada desde 05_prompt_maestro_meta_ai.md del cliente. La fuente de verdad es el repositorio; esto es caché.';
comment on column public.clients.meta_recipe_sha is
  'SHA en git del archivo de origen. Si no coincide con el del repositorio, la receta está desfasada.';
