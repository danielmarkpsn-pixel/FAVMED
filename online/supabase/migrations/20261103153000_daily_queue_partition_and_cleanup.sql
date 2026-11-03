-- FAVMED: fila isolada por dia, reinício automático e capacidade maior por dia.
create table if not exists app_private.favmed_queue_days (
  service_day date primary key,
  queue jsonb not null default '[]'::jsonb check (jsonb_typeof(queue)='array'),
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table app_private.favmed_queue_days enable row level security;
revoke all on table app_private.favmed_queue_days from public, anon, authenticated;
drop policy if exists favmed_queue_days_deny_direct_access on app_private.favmed_queue_days;
create policy favmed_queue_days_deny_direct_access on app_private.favmed_queue_days
  for all to public using (false) with check (false);

create or replace function app_private.favmed_local_day()
returns date language sql stable set search_path=pg_catalog
as $$ select (now() at time zone 'America/Manaus')::date; $$;

create or replace function app_private.favmed_get_queue(p_public boolean,p_day text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare
  v_role text;
  v_queue jsonb;
  v_version bigint;
  v_today date := app_private.favmed_local_day();
  v_public_queue jsonb;
begin
  select p.role into v_role from public.profiles p
  where p.id=auth.uid() and p.active=true;
  if v_role is null then
    raise exception 'Perfil inativo ou não autorizado' using errcode='42501';
  end if;

  select q.queue into v_queue from app_private.favmed_queue_days q
  where q.service_day=v_today;
  select s.version into v_version from app_private.favmed_queue_state s where s.singleton=true;
  v_queue:=coalesce(v_queue,'[]'::jsonb);
  v_version:=coalesce(v_version,0);

  if p_public then
    if v_role<>'sala' then
      raise exception 'A consulta pública é exclusiva do perfil Sala' using errcode='42501';
    end if;
    if p_day is null or p_day !~ '^\\d{4}-\\d{2}-\\d{2}$' or p_day<>v_today::text then
      raise exception 'A tela de chamadas só pode consultar o dia atual' using errcode='22023';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',p.value->'id','name',p.value->'name','room',p.value->'room',
      'rooms',p.value->'rooms','services',p.value->'services','service',p.value->'service',
      'serviceStates',(select coalesce(jsonb_object_agg(st.key,jsonb_build_object(
        'status',st.value->'status','updatedAt',st.value->'updatedAt','callLabel',st.value->'callLabel'
      )),'{}'::jsonb) from jsonb_each(coalesce(p.value->'serviceStates','{}'::jsonb)) st),
      'status',p.value->'status','priority',p.value->'priority','created',p.value->'created',
      'time',p.value->'time','day',p.value->'day',
      'receptionCall',case when jsonb_typeof(p.value->'receptionCall')='object' then jsonb_build_object(
        'status',p.value->'receptionCall'->'status','service',p.value->'receptionCall'->'service',
        'callLabel',p.value->'receptionCall'->'callLabel','updatedAt',p.value->'receptionCall'->'updatedAt'
      ) else null end
    )),'[]'::jsonb) into v_public_queue
    from jsonb_array_elements(v_queue) p(value)
    where p.value->>'day'=v_today::text;
    return jsonb_build_object('queue',v_public_queue,'version',v_version);
  end if;

  if v_role not in ('master','recepcao','profissional') then
    raise exception 'Perfil sem acesso à fila administrativa' using errcode='42501';
  end if;
  return jsonb_build_object('queue',v_queue,'version',v_version);
end;
$$;

create or replace function app_private.favmed_set_queue(p_queue jsonb,p_expected_version bigint)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare
  v_role text;
  v_old_queue jsonb;
  v_version bigint;
  v_new_version bigint;
  v_old jsonb;
  v_new jsonb;
  v_today date := app_private.favmed_local_day();
begin
  select p.role into v_role from public.profiles p
  where p.id=auth.uid() and p.active=true;
  if v_role not in ('master','recepcao','profissional') then
    raise exception 'Perfil sem permissão para alterar a fila' using errcode='42501';
  end if;
  if p_queue is null or jsonb_typeof(p_queue)<>'array' then
    raise exception 'A fila deve ser enviada como uma lista JSON' using errcode='22023';
  end if;
  if pg_column_size(p_queue)>33554432 then
    raise exception 'A fila do dia excede o limite de 32 MB' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_queue) x(value)
    where x.value->>'id' is null or x.value->>'day' is distinct from v_today::text) then
    raise exception 'Todos os registros precisam ter identificador e pertencer ao dia atual' using errcode='22023';
  end if;
  if (select count(*) from jsonb_array_elements(p_queue)) <>
     (select count(distinct x.value->>'id') from jsonb_array_elements(p_queue) x(value)) then
    raise exception 'A fila contém identificadores duplicados' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('favmed_queue_state'));
  insert into app_private.favmed_queue_state(singleton,queue,version)
  values(true,'[]'::jsonb,0) on conflict(singleton) do nothing;
  select s.version into v_version from app_private.favmed_queue_state s
  where s.singleton=true for update;
  v_version:=coalesce(v_version,0);
  if p_expected_version is distinct from v_version then
    raise exception 'QUEUE_CONFLICT: a fila foi alterada em outro dispositivo. Atualize e tente novamente.' using errcode='40001';
  end if;

  select q.queue into v_old_queue from app_private.favmed_queue_days q where q.service_day=v_today for update;
  v_old_queue:=coalesce(v_old_queue,'[]'::jsonb);

  if v_role='profissional' then
    if jsonb_array_length(v_old_queue)<>jsonb_array_length(p_queue) then
      raise exception 'O profissional só pode atualizar o andamento dos atendimentos existentes' using errcode='42501';
    end if;
    for v_old in select value from jsonb_array_elements(v_old_queue)
    loop
      select value into v_new from jsonb_array_elements(p_queue)
      where value->>'id'=v_old->>'id' limit 1;
      if v_new is null or
        (v_old-array['status','serviceStates','activeService','calledAt','calledService','calledLabel',
          'callDisplayMode','attendingAt','attendedAt','exitTime','releasedAt']::text[])
        is distinct from
        (v_new-array['status','serviceStates','activeService','calledAt','calledService','calledLabel',
          'callDisplayMode','attendingAt','attendedAt','exitTime','releasedAt']::text[]) then
        raise exception 'O profissional só pode alterar o status dos atendimentos' using errcode='42501';
      end if;
      v_new:=null;
    end loop;
  end if;

  v_new_version:=v_version+1;
  if jsonb_array_length(p_queue)=0 then
    delete from app_private.favmed_queue_days where service_day=v_today;
  else
    insert into app_private.favmed_queue_days(service_day,queue,updated_by,updated_at)
    values(v_today,p_queue,auth.uid(),now())
    on conflict(service_day) do update set
      queue=excluded.queue,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  end if;
  update app_private.favmed_queue_state set version=v_new_version,updated_by=auth.uid(),updated_at=now()
  where singleton=true;
  return jsonb_build_object('version',v_new_version,'updated_at',now());
end;
$$;

revoke all on function app_private.favmed_get_queue(boolean,text) from public,anon;
revoke all on function app_private.favmed_set_queue(jsonb,bigint) from public,anon;
grant execute on function app_private.favmed_get_queue(boolean,text) to authenticated;
grant execute on function app_private.favmed_set_queue(jsonb,bigint) to authenticated;

create or replace function app_private.favmed_daily_cleanup()
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_today date := app_private.favmed_local_day(); v_deleted integer;
begin
  delete from app_private.favmed_queue_days where service_day < v_today;
  get diagnostics v_deleted = row_count;
  return jsonb_build_object('local_day',v_today,'expired_days_removed',v_deleted,'cleaned_at',now());
end;
$$;
revoke all on function app_private.favmed_daily_cleanup() from public,anon,authenticated;

-- Limpa os dados de pacientes e exames antigos, mantendo contas, perfis e salas.
delete from public.visit_exams;
delete from public.patient_visits;
delete from public.patients;
delete from app_private.favmed_queue_days;
update app_private.favmed_queue_state set queue='[]'::jsonb,version=coalesce(version,0)+1,updated_at=now()
where singleton=true;

-- Aumenta o limite da fila do dia; cada dia fica em registro próprio.
-- No plano Free, o limite global do Storage continua sendo 50 MB por arquivo.
update storage.buckets set file_size_limit=52428800
where id in ('favmed-documents','favmed-media','patient-documents');

create extension if not exists pg_cron with schema pg_catalog;
do $$
begin
  if exists(select 1 from cron.job where jobname='favmed-daily-reset') then
    perform cron.unschedule('favmed-daily-reset');
  end if;
end $$;
select cron.schedule('favmed-daily-reset','5 4 * * *',
  $$select app_private.favmed_daily_cleanup();$$);
