-- Galería de referencias visuales y etiquetas de día por calendario

alter table public.calendars
  add column if not exists visual_references jsonb default '[]'::jsonb,
  add column if not exists day_labels jsonb default '{}'::jsonb;

-- Actualizar get_shared_calendar para devolver los nuevos campos
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
        'id',               cal.id,
        'name',             cal.name,
        'month',            cal.month,
        'year',             cal.year,
        'campaign',         cal.campaign,
        'weekConcepts',     cal.week_concepts,
        'days',             cal.days,
        'allowEditing',     cal.allow_editing,
        'visualReferences', coalesce(cal.visual_references, '[]'::jsonb),
        'dayLabels',        coalesce(cal.day_labels, '{}'::jsonb)
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

revoke all on function public.get_shared_calendar(text) from public;
revoke all on function public.get_shared_calendar(text) from anon;
grant execute on function public.get_shared_calendar(text) to anon, authenticated;
