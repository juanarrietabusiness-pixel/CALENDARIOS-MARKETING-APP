-- ============================================================
-- Juancito Ads — Edición del cliente (sugerencias)
--
-- Permite que la agencia active "permitir edición" por calendario.
-- El cliente puede sugerir cambios a la descripción y al guion,
-- que la agencia luego aprueba o rechaza.
--
-- Las sugerencias viajan en las columnas nuevas de `approvals`:
--   suggested_descripcion  y  suggested_guion
-- ============================================================

-- 1. Bandera en calendars
alter table public.calendars
  add column if not exists allow_editing boolean not null default false;

-- 2. Columnas de sugerencia en approvals
alter table public.approvals
  add column if not exists suggested_descripcion text,
  add column if not exists suggested_guion       text;

-- 3. Actualizar get_shared_calendar para devolver allow_editing
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
        'days',         cal.days,
        'allowEditing', cal.allow_editing
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
            'estado',                a.estado,
            'comentario',            a.comentario,
            'revisor',               a.reviewer_name,
            'timestamp',             a.updated_at,
            'suggestedDescripcion',  a.suggested_descripcion,
            'suggestedGuion',        a.suggested_guion
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

-- 4. Actualizar submit_approval para aceptar sugerencias
drop function if exists public.submit_approval(text, text, text, text, text);

create function public.submit_approval(
  p_token                  text,
  p_post_id                text,
  p_estado                 text,
  p_comentario             text default '',
  p_reviewer               text default '',
  p_suggested_descripcion  text default null,
  p_suggested_guion        text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_calendar_id    uuid;
  v_days           jsonb;
  v_allow_editing  boolean;
  v_exists         boolean;
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

  select cal.id, cal.days, cal.allow_editing
    into v_calendar_id, v_days, v_allow_editing
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

  if (p_suggested_descripcion is not null or p_suggested_guion is not null)
     and not v_allow_editing then
    raise exception 'La edición no está habilitada para este calendario';
  end if;

  insert into public.approvals (
    calendar_id, post_id, estado, comentario, reviewer_name,
    suggested_descripcion, suggested_guion
  )
  values (
    v_calendar_id,
    p_post_id,
    p_estado,
    left(coalesce(p_comentario, ''), 2000),
    left(coalesce(p_reviewer, ''), 120),
    left(p_suggested_descripcion, 5000),
    left(p_suggested_guion, 5000)
  )
  on conflict (calendar_id, post_id) do update
    set estado                = excluded.estado,
        comentario            = excluded.comentario,
        reviewer_name         = excluded.reviewer_name,
        suggested_descripcion = excluded.suggested_descripcion,
        suggested_guion       = excluded.suggested_guion,
        updated_at            = now();

  return jsonb_build_object('ok', true, 'estado', p_estado);
end;
$$;

-- 5. Permisos
revoke all on function public.get_shared_calendar(text) from public;
revoke all on function public.submit_approval(text, text, text, text, text, text, text) from public;

grant execute on function public.get_shared_calendar(text) to anon, authenticated;
grant execute on function public.submit_approval(text, text, text, text, text, text, text) to anon, authenticated;
