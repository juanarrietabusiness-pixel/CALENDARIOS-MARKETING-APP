-- ============================================================
-- Juancito Ads — Enlaces de aprobación por token
--
-- Sustituye el identificador adivinable `clientId-calId-timestamp`
-- por un token aleatorio de 24 bytes (48 caracteres hexadecimales)
-- generado dentro de la base de datos, nunca en el navegador.
--
-- El flujo público deja de necesitar la clave de servicio: la página
-- de aprobación llama a dos funciones `security definer` que validan
-- el token en Postgres. Como el cliente escribe directo en la tabla,
-- Realtime avisa a la agencia en el mismo instante.
--
-- Todas las funciones llevan `set search_path = ''` y cualifican los
-- nombres: sin eso, un esquema en el search_path del invocante podría
-- suplantar una tabla dentro de una función con privilegios.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Compartición en calendars
-- ------------------------------------------------------------
alter table public.calendars
  add column if not exists share_token      text,
  add column if not exists share_enabled    boolean not null default true,
  add column if not exists share_expires_at timestamptz;

create unique index if not exists calendars_share_token_key
  on public.calendars (share_token)
  where share_token is not null;

-- Quién respondió, cuando el cliente se identifica.
alter table public.approvals
  add column if not exists reviewer_name text not null default '';

-- ------------------------------------------------------------
-- 2. Abrir el enlace (agencia)
--
-- `security definer` con comprobación explícita de propiedad: es más
-- claro que confiar en RLS dentro de la función, y deja la intención
-- escrita en el propio cuerpo.
-- ------------------------------------------------------------
create or replace function public.share_calendar(p_calendar_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_uid   uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select c.share_token into v_token
    from public.calendars c
   where c.id = p_calendar_id
     and c.owner_id = v_uid;

  if not found then
    raise exception 'Calendario no encontrado';
  end if;

  -- Reabrir un enlace revocado conserva el token, así que el enlace
  -- que ya tiene el cliente vuelve a funcionar sin reenviarlo.
  if v_token is null then
    v_token := encode(extensions.gen_random_bytes(24), 'hex');
  end if;

  update public.calendars
     set share_token      = v_token,
         share_enabled    = true,
         share_expires_at = null
   where id = p_calendar_id
     and owner_id = v_uid;

  return v_token;
end;
$$;

-- ------------------------------------------------------------
-- 3. Revocar o reactivar el enlace (agencia)
-- ------------------------------------------------------------
create or replace function public.set_share_enabled(
  p_calendar_id uuid,
  p_enabled     boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  update public.calendars
     set share_enabled = p_enabled
   where id = p_calendar_id
     and owner_id = v_uid;

  if not found then
    raise exception 'Calendario no encontrado';
  end if;

  return p_enabled;
end;
$$;

-- ------------------------------------------------------------
-- 4. Lectura pública por token
--
-- La firma anterior tomaba `p_approval_id`; PostgreSQL no permite
-- renombrar un argumento con CREATE OR REPLACE, así que se borra
-- primero. Los enlaces antiguos no viven aquí: están en Netlify Blobs
-- y los sirve la función de compatibilidad.
-- ------------------------------------------------------------
drop function if exists public.get_shared_calendar(text);

create function public.get_shared_calendar(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  -- Un token corto no puede ser válido: se corta antes de tocar la tabla.
  if p_token is null or length(p_token) < 24 then
    return null;
  end if;

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
            'revisor',    a.reviewer_name,
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
  join public.clients   cli on cli.id = cal.client_id
  where cal.share_token = p_token
    and cal.share_enabled
    and (cal.share_expires_at is null or cal.share_expires_at > now());

  return result;
end;
$$;

-- ------------------------------------------------------------
-- 5. Respuesta del cliente final
--
-- El token se valida aquí dentro, así que el endpoint público no
-- necesita la clave de servicio en ningún momento. Sólo acepta
-- publicaciones que existen de verdad en el calendario: sin esa
-- comprobación, cualquiera con el enlace podía sembrar filas basura.
-- ------------------------------------------------------------
create or replace function public.submit_approval(
  p_token      text,
  p_post_id    text,
  p_estado     text,
  p_comentario text default '',
  p_reviewer   text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_calendar_id uuid;
  v_days        jsonb;
  v_exists      boolean;
begin
  if p_estado is null or p_estado not in ('aprobado', 'cambios') then
    raise exception 'Estado inválido';
  end if;

  if p_post_id is null or length(p_post_id) = 0 or length(p_post_id) > 200 then
    raise exception 'Identificador de publicación inválido';
  end if;

  if p_token is null or length(p_token) < 24 then
    raise exception 'Enlace inválido';
  end if;

  select cal.id, cal.days
    into v_calendar_id, v_days
    from public.calendars cal
   where cal.share_token = p_token
     and cal.share_enabled
     and (cal.share_expires_at is null or cal.share_expires_at > now());

  if not found then
    raise exception 'Enlace inválido o caducado';
  end if;

  select exists (
    select 1
      from jsonb_array_elements(coalesce(v_days, '[]'::jsonb)) as d,
           jsonb_array_elements(coalesce(d -> 'posts', '[]'::jsonb)) as p
     where p ->> 'id' = p_post_id
  ) into v_exists;

  if not v_exists then
    raise exception 'La publicación no pertenece a este calendario';
  end if;

  insert into public.approvals (calendar_id, post_id, estado, comentario, reviewer_name)
  values (
    v_calendar_id,
    p_post_id,
    p_estado,
    left(coalesce(p_comentario, ''), 2000),
    left(coalesce(p_reviewer, ''), 120)
  )
  on conflict (calendar_id, post_id) do update
    set estado        = excluded.estado,
        comentario    = excluded.comentario,
        reviewer_name = excluded.reviewer_name,
        updated_at    = now();

  return jsonb_build_object('ok', true, 'estado', p_estado);
end;
$$;

-- ------------------------------------------------------------
-- 6. Permisos de ejecución
--
-- `anon` sólo puede leer y responder mediante token. Nunca puede
-- abrir ni revocar un enlace: eso es de la agencia.
--
-- OJO: este proyecto tiene `alter default privileges` concediendo
-- EXECUTE a anon/authenticated en toda función nueva de `public`.
-- `revoke ... from public` NO deshace una concesión por rol, así que
-- hay que revocar de `anon` explícitamente o los dos RPC de la agencia
-- quedan abiertos a cualquiera sin sesión.
-- ------------------------------------------------------------
revoke all on function public.get_shared_calendar(text)                     from public;
revoke all on function public.submit_approval(text, text, text, text, text) from public;
revoke all on function public.share_calendar(uuid)                          from public, anon;
revoke all on function public.set_share_enabled(uuid, boolean)              from public, anon;

-- Función de trigger: nunca debe ser invocable desde la API REST.
revoke all on function public.set_updated_at() from public, anon, authenticated;

grant execute on function public.get_shared_calendar(text)                     to anon, authenticated;
grant execute on function public.submit_approval(text, text, text, text, text) to anon, authenticated;
grant execute on function public.share_calendar(uuid)                          to authenticated;
grant execute on function public.set_share_enabled(uuid, boolean)              to authenticated;

-- ------------------------------------------------------------
-- 7. Tiempo real
--
-- La agencia se suscribe a `approvals`; la política de SELECT ya
-- limita cada fila a su propietario, y Realtime la respeta.
-- `replica identity full` hace que UPDATE y DELETE lleguen con la
-- fila completa, necesario para filtrar por calendar_id.
-- ------------------------------------------------------------
alter table public.approvals replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'approvals'
  ) then
    alter publication supabase_realtime add table public.approvals;
  end if;
end
$$;
