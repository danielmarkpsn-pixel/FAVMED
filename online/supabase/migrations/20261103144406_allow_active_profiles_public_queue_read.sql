create or replace function app_private.favmed_get_queue(p_public boolean, p_day text)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog
as $$
declare v_role text; v_queue jsonb; v_version bigint; v_public_queue jsonb;
begin
  select p.role into v_role from public.profiles p where p.id=auth.uid() and p.active=true;
  if v_role is null then raise exception 'Perfil inativo ou não autorizado' using errcode='42501'; end if;
  select s.queue,s.version into v_queue,v_version from app_private.favmed_queue_state s where s.singleton=true;
  v_queue:=coalesce(v_queue,'[]'::jsonb); v_version:=coalesce(v_version,0);
  if p_public then
    if v_role not in ('sala','master','recepcao','profissional') then raise exception 'Perfil sem acesso à tela de chamadas' using errcode='42501'; end if;
    if p_day is null or p_day !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Data inválida' using errcode='22023'; end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',p.value->'id','name',p.value->'name','room',p.value->'room',
      'rooms',p.value->'rooms','services',p.value->'services','service',p.value->'service',
      'serviceStates',(select coalesce(jsonb_object_agg(st.key,jsonb_build_object('status',st.value->'status','updatedAt',st.value->'updatedAt','callLabel',st.value->'callLabel')),'{}'::jsonb) from jsonb_each(coalesce(p.value->'serviceStates','{}'::jsonb)) st),
      'status',p.value->'status','priority',p.value->'priority','created',p.value->'created',
      'time',p.value->'time','day',p.value->'day',
      'receptionCall',case when jsonb_typeof(p.value->'receptionCall')='object' then jsonb_build_object('status',p.value->'receptionCall'->'status','service',p.value->'receptionCall'->'service','callLabel',p.value->'receptionCall'->'callLabel','updatedAt',p.value->'receptionCall'->'updatedAt') else null end
    )),'[]'::jsonb) into v_public_queue from jsonb_array_elements(v_queue) p(value) where p.value->>'day'=p_day;
    return jsonb_build_object('queue',v_public_queue,'version',v_version);
  end if;
  if v_role not in ('master','recepcao','profissional') then raise exception 'Perfil sem acesso à fila administrativa' using errcode='42501'; end if;
  return jsonb_build_object('queue',v_queue,'version',v_version);
end;
$$;