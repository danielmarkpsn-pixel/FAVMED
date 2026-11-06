-- A tela de espera usa a sessão da recepção, sem exigir uma conta separada "Sala".
-- O RPC continua autenticado e retorna somente os campos necessários à exibição.
create or replace function public.favmed_get_public_queue(p_day text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_role text;
  v_today date := app_private.favmed_local_day();
  v_queue jsonb;
  v_public_queue jsonb;
  v_version bigint;
begin
  select p.role into v_role
  from public.profiles p
  where p.id = auth.uid() and p.active = true;

  if v_role is null or v_role not in ('master', 'recepcao') then
    raise exception 'A tela de chamadas deve ser aberta pela recepção'
      using errcode = '42501';
  end if;

  if p_day is null or p_day !~ '^\d{4}-\d{2}-\d{2}$' or p_day <> v_today::text then
    raise exception 'A tela de chamadas só pode consultar o dia atual'
      using errcode = '22023';
  end if;

  select q.queue into v_queue
  from app_private.favmed_queue_days q
  where q.service_day = v_today;
  v_queue := coalesce(v_queue, '[]'::jsonb);

  select s.version into v_version
  from app_private.favmed_queue_state s
  where s.singleton = true;
  v_version := coalesce(v_version, 0);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.value->'id',
    'name', p.value->'name',
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
      from jsonb_each(coalesce(p.value->'serviceStates', '{}'::jsonb)) st
    ),
    'status', p.value->'status',
    'priority', p.value->'priority',
    'created', p.value->'created',
    'time', p.value->'time',
    'day', p.value->'day',
    'receptionCall', case
      when jsonb_typeof(p.value->'receptionCall') = 'object' then jsonb_build_object(
        'status', p.value->'receptionCall'->'status',
        'service', p.value->'receptionCall'->'service',
        'callLabel', p.value->'receptionCall'->'callLabel',
        'updatedAt', p.value->'receptionCall'->'updatedAt'
      )
      else null
    end
  )), '[]'::jsonb)
  into v_public_queue
  from jsonb_array_elements(v_queue) p(value)
  where p.value->>'day' = v_today::text;

  return jsonb_build_object(
    'queue', v_public_queue,
    'version', v_version
  );
end;
$$;

revoke all on function public.favmed_get_public_queue(text) from public, anon;
grant execute on function public.favmed_get_public_queue(text) to authenticated;
