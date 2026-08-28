-- Columnas que faltan en calendars para que el editor de calendario
-- pueda persistir ofertas y código promocional, y columnas de clients
-- para la receta visual (meta_recipe) que no se habían aplicado.

-- ── calendars: ofertas y código promocional ──
alter table public.calendars
  add column if not exists offers     text not null default '',
  add column if not exists promo_code text not null default '';

-- ── clients: receta visual compilada (si la migración anterior no se aplicó) ──
alter table public.clients
  add column if not exists meta_recipe     jsonb,
  add column if not exists meta_recipe_sha text,
  add column if not exists meta_recipe_at  timestamptz;
