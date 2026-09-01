-- ============================================================
-- Juancito Ads — Aprobación de referencias y edición directa
--
-- 1. submit_approval ahora acepta IDs de referencias visuales
--    además de IDs de publicaciones.
-- 2. update_post_content permite al cliente editar directamente
--    la descripción y el guion de una publicación.
-- ============================================================

-- ── 1. submit_approval: aceptar IDs de referencias visuales ──

drop function if exists public.submit_approval(text, text, text, text, text, text, text);

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
  v_visual_refs    jsonb;
  v_allow_editing  boolean;
  v_exists         boolean;
begin
  if p_estado is null or p_estado not in ('aprobado', 'cambios') then
    raise exception 'Estado inválido';
  end if;

  if p_post_id is null or length(p_post_id) = 0 or length(p_post_id) > 200 then
    raise exception 'Identificador inválido';
  end if;

  if p_token is null or length(p_token) < 24 then
    raise exception 'Enlace inválido';
  end if;

  select cal.id, cal.days, cal.visual_references, cal.allow_editing
    into v_calendar_id, v_days, v_visual_refs, v_allow_editing
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
    select exists (
      select 1
        from jsonb_array_elements(coalesce(v_visual_refs, '[]'::jsonb)) as vr
       where vr ->> 'id' = p_post_id
    ) into v_exists;
  end if;

  if not v_exists then
    raise exception 'El elemento no pertenece a este calendario';
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

-- ── 2. update_post_content: edición directa de publicaciones ──

create or replace function public.update_post_content(
  p_token       text,
  p_post_id     text,
  p_descripcion text default null,
  p_guion       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_calendar_id   uuid;
  v_days          jsonb;
  v_allow_editing boolean;
  v_day_idx       int;
  v_post_idx      int;
  v_found         boolean := false;
begin
  if p_token is null or length(p_token) < 24 then
    raise exception 'Enlace inválido';
  end if;

  if p_post_id is null or length(p_post_id) = 0 then
    raise exception 'Identificador de publicación inválido';
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

  if not v_allow_editing then
    raise exception 'La edición no está habilitada para este calendario';
  end if;

  for v_day_idx in 0 .. jsonb_array_length(coalesce(v_days, '[]'::jsonb)) - 1 loop
    for v_post_idx in 0 .. jsonb_array_length(coalesce(v_days -> v_day_idx -> 'posts', '[]'::jsonb)) - 1 loop
      if v_days -> v_day_idx -> 'posts' -> v_post_idx ->> 'id' = p_post_id then
        if p_descripcion is not null then
          v_days := jsonb_set(
            v_days,
            array[v_day_idx::text, 'posts', v_post_idx::text, 'descripcion'],
            to_jsonb(left(p_descripcion, 10000))
          );
        end if;
        if p_guion is not null then
          v_days := jsonb_set(
            v_days,
            array[v_day_idx::text, 'posts', v_post_idx::text, 'guion'],
            to_jsonb(left(p_guion, 10000))
          );
        end if;
        v_found := true;
        exit;
      end if;
    end loop;
    if v_found then exit; end if;
  end loop;

  if not v_found then
    raise exception 'La publicación no pertenece a este calendario';
  end if;

  update public.calendars
     set days = v_days
   where id = v_calendar_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- ── 3. Permisos ──

revoke all on function public.submit_approval(text, text, text, text, text, text, text) from public;
revoke all on function public.update_post_content(text, text, text, text) from public;

grant execute on function public.submit_approval(text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.update_post_content(text, text, text, text) to anon, authenticated;
