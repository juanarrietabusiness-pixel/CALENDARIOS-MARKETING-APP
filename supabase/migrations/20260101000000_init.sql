-- ============================================================
-- Juancito Ads — Calendarios de Marketing
-- Esquema inicial
--
-- Modelo:
--   clients   → un cliente de la agencia (perfil + ADN de marca)
--   calendars → un calendario mensual de un cliente
--   approvals → respuestas del cliente final sobre cada publicación
--
-- Seguridad: RLS activo en las tres tablas.
--   · clients / calendars: sólo el usuario propietario.
--   · approvals: ningún acceso directo desde el navegador. La página
--     pública de aprobación pasa por la función de Netlify, que usa la
--     clave de servicio. Así el enlace no da acceso a otros calendarios.
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- updated_at automático
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ------------------------------------------------------------
-- clients
-- ------------------------------------------------------------
create table if not exists public.clients (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references auth.users (id) on delete cascade,

  name              text not null check (length(trim(name)) > 0),
  industry          text default '',
  instagram         text default '',
  phone             text default '',
  whatsapp          text default '',
  sucursales        text default '',
  direcciones       text default '',

  -- Identidad visual
  primary_color     text default '#1E90FF',
  secondary_color   text default '#FFFFFF',
  accent_color      text default '#F5A623',
  logo              text,

  -- ADN de marca
  descripcion       text default '',
  valores           text default '',
  audiencia         text default '',
  competencia       text default '',
  estilo_guion      text default '',
  estilo_locucion   text default '',
  hashtags          text default '',
  notas_inspeccion  text default '',

  -- Origen del ADN en GitHub.
  -- El token NO se guarda aquí: es un secreto del usuario y vive en su
  -- navegador o, mejor, en una variable de entorno de la función.
  github_repo       text default '',
  github_folder     text default '',
  github_context    text default '',

  ideas_bank        jsonb not null default '[]'::jsonb,
  saved_categories  jsonb not null default '[]'::jsonb,
  weekly_structure  jsonb not null default '[]'::jsonb,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists clients_owner_id_idx on public.clients (owner_id);

drop trigger if exists clients_set_updated_at on public.clients;
create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- calendars
--
-- `days` conserva la estructura anidada que ya usa la aplicación
-- (días con sus publicaciones). Normalizar las publicaciones a su
-- propia tabla es posible más adelante; jsonb permite migrar sin
-- reescribir la interfaz.
-- ------------------------------------------------------------
create table if not exists public.calendars (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.clients (id) on delete cascade,
  owner_id       uuid not null references auth.users (id) on delete cascade,

  name           text not null default '',
  month          smallint not null check (month between 0 and 11),
  year           smallint not null check (year between 2000 and 2100),
  campaign       text default '',
  week_concepts  jsonb not null default '[]'::jsonb,
  days           jsonb not null default '[]'::jsonb,

  -- Identificador público del enlace de aprobación. Null = no compartido.
  approval_id    text unique,

  generated_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists calendars_client_id_idx  on public.calendars (client_id);
create index if not exists calendars_owner_id_idx   on public.calendars (owner_id);
create index if not exists calendars_approval_id_idx on public.calendars (approval_id) where approval_id is not null;

drop trigger if exists calendars_set_updated_at on public.calendars;
create trigger calendars_set_updated_at
  before update on public.calendars
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- approvals
-- Una fila por publicación revisada por el cliente final.
-- ------------------------------------------------------------
create table if not exists public.approvals (
  id           uuid primary key default gen_random_uuid(),
  calendar_id  uuid not null references public.calendars (id) on delete cascade,
  post_id      text not null,
  estado       text not null check (estado in ('aprobado', 'cambios')),
  comentario   text default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  unique (calendar_id, post_id)
);

create index if not exists approvals_calendar_id_idx on public.approvals (calendar_id);

drop trigger if exists approvals_set_updated_at on public.approvals;
create trigger approvals_set_updated_at
  before update on public.approvals
  for each row execute function public.set_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.clients   enable row level security;
alter table public.calendars enable row level security;
alter table public.approvals enable row level security;

-- ---- clients: sólo el propietario ----
drop policy if exists "clients: el propietario lee"     on public.clients;
drop policy if exists "clients: el propietario inserta" on public.clients;
drop policy if exists "clients: el propietario edita"   on public.clients;
drop policy if exists "clients: el propietario borra"   on public.clients;

create policy "clients: el propietario lee"
  on public.clients for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy "clients: el propietario inserta"
  on public.clients for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "clients: el propietario edita"
  on public.clients for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "clients: el propietario borra"
  on public.clients for delete
  to authenticated
  using ((select auth.uid()) = owner_id);

-- ---- calendars: sólo el propietario ----
drop policy if exists "calendars: el propietario lee"     on public.calendars;
drop policy if exists "calendars: el propietario inserta" on public.calendars;
drop policy if exists "calendars: el propietario edita"   on public.calendars;
drop policy if exists "calendars: el propietario borra"   on public.calendars;

create policy "calendars: el propietario lee"
  on public.calendars for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy "calendars: el propietario inserta"
  on public.calendars for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "calendars: el propietario edita"
  on public.calendars for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "calendars: el propietario borra"
  on public.calendars for delete
  to authenticated
  using ((select auth.uid()) = owner_id);

-- ---- approvals ----
-- La agencia lee las respuestas de sus propios calendarios.
drop policy if exists "approvals: el propietario del calendario lee" on public.approvals;
create policy "approvals: el propietario del calendario lee"
  on public.approvals for select
  to authenticated
  using (
    exists (
      select 1 from public.calendars c
      where c.id = approvals.calendar_id
        and c.owner_id = (select auth.uid())
    )
  );

-- No hay política de escritura para anon/authenticated: las respuestas
-- del cliente final entran por la función de Netlify con la clave de
-- servicio, que ignora RLS. Sin RLS abierto, conocer un enlace no
-- permite listar ni modificar nada más.

-- ============================================================
-- Lectura pública del calendario compartido
--
-- Función security definer: recibe el identificador del enlace y
-- devuelve únicamente ese calendario más sus aprobaciones. No expone
-- la tabla, así que un enlace no permite enumerar otros calendarios.
-- ============================================================
create or replace function public.get_shared_calendar(p_approval_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'calendar', jsonb_build_object(
      'calendar', jsonb_build_object(
        'id',           cal.id,
        'name',         cal.name,
        'month',        cal.month,
        'year',         cal.year,
        'campaign',     cal.campaign,
        'weekConcepts', cal.week_concepts,
        'days',         cal.days
      ),
      'client', jsonb_build_object(
        'name',         cli.name,
        'industry',     cli.industry,
        'primaryColor', cli.primary_color,
        'logo',         cli.logo
      )
    ),
    'approvals', coalesce(
      (
        select jsonb_object_agg(
          a.post_id,
          jsonb_build_object(
            'estado',     a.estado,
            'comentario', a.comentario,
            'timestamp',  a.updated_at
          )
        )
        from public.approvals a
        where a.calendar_id = cal.id
      ),
      '{}'::jsonb
    )
  )
  into result
  from public.calendars cal
  join public.clients cli on cli.id = cal.client_id
  where cal.approval_id = p_approval_id;

  return result;
end;
$$;

revoke all on function public.get_shared_calendar(text) from public;
grant execute on function public.get_shared_calendar(text) to anon, authenticated;
