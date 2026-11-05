-- The public queue RPC is a second caller-display path. Preserve its
-- existing authorization, day restriction, and field filtering, but return
-- the patient's registered full name instead of first name + last initial.
create or replace function app_private.favmed_get_queue(p_public boolean, p_day text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_role text;
  v_queue jsonb;
  v_version bigint;
  v_today date := app_private.favmed_local_day();
  v_public_queue jsonb;
begin
  select p.role into v_role
  from public.profiles p
  where p.id = auth.uid() and p.active = true;

  if p_public then
    if auth.uid() is not null and v_role is null then
      raise exception 'Perfil inativo ou não autorizado' using errcode = '42501';
    end if;
    if p_day is null or p_day !~ '^\d{4}-\d{2}-\d{2}$' or p_day <> v_today::text then
      raise exception 'A tela de chamadas só pode consultar o dia atual' using errcode = '22023';
    end if;

    select q.queue into v_queue
    from app_private.favmed_queue_days q
    where q.service_day = v_today;
    select s.version into v_version
    from app_private.favmed_queue_state s
    where s.singleton = true;

    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', p.value->'id',
        'name', coalesce(nullif(trim(p.value->>'name'), ''), 'Paciente'),
        'room', p.value->'room',
        'rooms', p.value->'rooms',
        'services', p.value->'services',
        'service', p.value->'service',
        'serviceStates', (
          select coalesce(jsonb_object_agg(st.key, jsonb_build_object(
            'status', st.value->'status',
            'updatedAt', st.value->'updatedAt',
            'callLabel', st.value->'callLabel'
          )), '{}'::jsonb)
          from jsonb_each(coalesce(p.value->'serviceStates','{}'::jsonb)) st
        ),
        'status', p.value->'status',
        'priority', p.value->'priority',
        'created', p.value->'created',
        'time', p.value->'time',
        'day', p.value->'day',
        'receptionCall', case
          when jsonb_typeof(p.value->'receptionCall') = 'object'
          then jsonb_build_object(
            'status', p.value->'receptionCall'->'status',
            'service', p.value->'receptionCall'->'service',
            'callLabel', p.value->'receptionCall'->'callLabel',
            'updatedAt', p.value->'receptionCall'->'updatedAt'
          )
          else null
        end
      )
    ), '[]'::jsonb)
    into v_public_queue
    from jsonb_array_elements(coalesce(v_queue,'[]'::jsonb)) p(value)
    where p.value->>'day' = v_today::text;

    return jsonb_build_object('queue', v_public_queue, 'version', coalesce(v_version,0));
  end if;

  if v_role is null then
    raise exception 'Perfil inativo ou não autorizado' using errcode = '42501';
  end if;
  if v_role not in ('master','recepcao','profissional') then
    raise exception 'Perfil sem acesso à fila administrativa' using errcode = '42501';
  end if;

  select q.queue into v_queue
  from app_private.favmed_queue_days q
  where q.service_day = v_today;
  select s.version into v_version
  from app_private.favmed_queue_state s
  where s.singleton = true;

  return jsonb_build_object('queue', coalesce(v_queue,'[]'::jsonb), 'version', coalesce(v_version,0));
end;
$$;

-- Preserve the existing authenticated-only execution boundary.
revoke all on function app_private.favmed_get_queue(boolean,text) from public,anon;
grant execute on function app_private.favmed_get_queue(boolean,text) to authenticated;
