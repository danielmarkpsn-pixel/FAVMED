
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;
grant usage on schema app_private to authenticated;

create table if not exists app_private.favmed_queue_state (
  singleton boolean primary key default true check (singleton = true),
  queue jsonb not null default '[]'::jsonb check (jsonb_typeof(queue) = 'array'),
  version bigint not null default 0,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table app_private.favmed_queue_state enable row level security;
revoke all on table app_private.favmed_queue_state from public, anon, authenticated;

create or replace function app_private.favmed_get_queue(p_public boolean, p_day text)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog
as $$
declare v_role text; v_queue jsonb; v_version bigint; v_public_queue jsonb;
begin
  select p.role into v_role from public.profiles p where p.id = auth.uid() and p.active = true;
  if v_role is null then raise exception 'Perfil inativo ou não autorizado' using errcode = '42501'; end if;
  select s.queue, s.version into v_queue, v_version from app_private.favmed_queue_state s where s.singleton = true;
  v_queue := coalesce(v_queue, '[]'::jsonb); v_version := coalesce(v_version, 0);
  if p_public then
    if v_role <> 'sala' then raise exception 'A consulta pública é exclusiva do perfil Sala' using errcode = '42501'; end if;
    if p_day is null or p_day !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Data inválida' using errcode = '22023'; end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.value->'id', 'name', p.value->'name', 'room', p.value->'room',
      'rooms', p.value->'rooms', 'services', p.value->'services', 'service', p.value->'service',
      'serviceStates', (select coalesce(jsonb_object_agg(st.key,jsonb_build_object(
        'status',st.value->'status','updatedAt',st.value->'updatedAt','callLabel',st.value->'callLabel'
      )),'{}'::jsonb) from jsonb_each(coalesce(p.value->'serviceStates','{}'::jsonb)) st),
      'status',p.value->'status','priority',p.value->'priority','created',p.value->'created',
      'time',p.value->'time','day',p.value->'day',
      'receptionCall',case when jsonb_typeof(p.value->'receptionCall')='object' then jsonb_build_object(
        'status',p.value->'receptionCall'->'status','service',p.value->'receptionCall'->'service',
        'callLabel',p.value->'receptionCall'->'callLabel','updatedAt',p.value->'receptionCall'->'updatedAt'
      ) else null end
    )),'[]'::jsonb) into v_public_queue
    from jsonb_array_elements(v_queue) p(value) where p.value->>'day'=p_day;
    return jsonb_build_object('queue',v_public_queue,'version',v_version);
  end if;
  if v_role not in ('master','recepcao','profissional') then raise exception 'Perfil sem acesso à fila administrativa' using errcode = '42501'; end if;
  return jsonb_build_object('queue',v_queue,'version',v_version);
end;
$$;

create or replace function app_private.favmed_set_queue(p_queue jsonb,p_expected_version bigint)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog
as $$
declare v_role text; v_old_queue jsonb; v_version bigint; v_new_version bigint; v_old jsonb; v_new jsonb;
begin
  select p.role into v_role from public.profiles p where p.id=auth.uid() and p.active=true;
  if v_role not in ('master','recepcao','profissional') then raise exception 'Perfil sem permissão para alterar a fila' using errcode='42501'; end if;
  if p_queue is null or jsonb_typeof(p_queue)<>'array' then raise exception 'A fila deve ser enviada como uma lista JSON' using errcode='22023'; end if;
  if pg_column_size(p_queue)>8388608 then raise exception 'A fila excede o limite de 8 MB' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(p_queue) x(value) where x.value->>'id' is null) then raise exception 'Todos os pacientes precisam ter identificador' using errcode='22023'; end if;
  if (select count(*) from jsonb_array_elements(p_queue))<>(select count(distinct x.value->>'id') from jsonb_array_elements(p_queue) x(value)) then raise exception 'A fila contém identificadores duplicados' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtext('favmed_queue_state'));
  select s.queue,s.version into v_old_queue,v_version from app_private.favmed_queue_state s where s.singleton=true for update;
  v_old_queue:=coalesce(v_old_queue,'[]'::jsonb); v_version:=coalesce(v_version,0);
  if p_expected_version is distinct from v_version then raise exception 'QUEUE_CONFLICT: a fila foi alterada em outro dispositivo. Atualize e tente novamente.' using errcode='40001'; end if;
  if v_role='profissional' then
    if jsonb_array_length(v_old_queue)<>jsonb_array_length(p_queue) then raise exception 'O profissional só pode atualizar o andamento dos atendimentos existentes' using errcode='42501'; end if;
    for v_old in select value from jsonb_array_elements(v_old_queue)
    loop
      select value into v_new from jsonb_array_elements(p_queue) where value->>'id'=v_old->>'id' limit 1;
      if v_new is null or
        (v_old-array['status','serviceStates','activeService','calledAt','calledService','calledLabel','callDisplayMode','attendingAt','attendedAt','exitTime','releasedAt']::text[])
        is distinct from
        (v_new-array['status','serviceStates','activeService','calledAt','calledService','calledLabel','callDisplayMode','attendingAt','attendedAt','exitTime','releasedAt']::text[]) then
        raise exception 'O profissional só pode alterar o status dos atendimentos' using errcode='42501';
      end if;
      v_new:=null;
    end loop;
  end if;
  v_new_version:=v_version+1;
  insert into app_private.favmed_queue_state(singleton,queue,version,updated_by,updated_at)
  values(true,p_queue,v_new_version,auth.uid(),now())
  on conflict(singleton) do update set queue=excluded.queue,version=excluded.version,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  return jsonb_build_object('version',v_new_version,'updated_at',now());
end;
$$;

revoke all on function app_private.favmed_get_queue(boolean,text) from public,anon;
revoke all on function app_private.favmed_set_queue(jsonb,bigint) from public,anon;
grant execute on function app_private.favmed_get_queue(boolean,text) to authenticated;
grant execute on function app_private.favmed_set_queue(jsonb,bigint) to authenticated;

create or replace function public.favmed_get_queue()
returns jsonb language sql stable security invoker set search_path=''
as $$ select app_private.favmed_get_queue(false,null); $$;
create or replace function public.favmed_get_public_queue(p_day text)
returns jsonb language sql stable security invoker set search_path=''
as $$ select app_private.favmed_get_queue(true,p_day); $$;
create or replace function public.favmed_set_queue(p_queue jsonb,p_expected_version bigint)
returns jsonb language sql volatile security invoker set search_path=''
as $$ select app_private.favmed_set_queue(p_queue,p_expected_version); $$;

revoke all on function public.favmed_get_queue() from public,anon;
revoke all on function public.favmed_get_public_queue(text) from public,anon;
revoke all on function public.favmed_set_queue(jsonb,bigint) from public,anon;
grant execute on function public.favmed_get_queue() to authenticated;
grant execute on function public.favmed_get_public_queue(text) to authenticated;
grant execute on function public.favmed_set_queue(jsonb,bigint) to authenticated;
