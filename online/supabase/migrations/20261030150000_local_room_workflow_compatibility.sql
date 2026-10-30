-- FAVMED: preserve the local per-room workflow model in the online database.
-- Additive only. Review and test in an isolated project before applying remotely.

create table if not exists public.visit_room_workflows (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.patient_visits(id) on delete cascade,
  service_key text not null check (char_length(trim(service_key)) between 1 and 100),
  room_id uuid not null references public.rooms(id) on delete restrict,
  service_label text not null check (char_length(trim(service_label)) between 1 and 120),
  status text not null default 'aguardando'
    check (status in ('aguardando', 'chamado', 'em_atendimento', 'liberado')),
  call_label text,
  called_at timestamptz,
  started_at timestamptz,
  released_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (visit_id, service_key)
);

create index if not exists visit_room_workflows_visit_idx
  on public.visit_room_workflows (visit_id, display_order);
create index if not exists visit_room_workflows_room_status_idx
  on public.visit_room_workflows (room_id, status, updated_at desc);

alter table public.visit_room_workflows enable row level security;
alter table public.visit_room_workflows force row level security;

drop policy if exists visit_room_workflows_select_authorized on public.visit_room_workflows;
create policy visit_room_workflows_select_authorized
on public.visit_room_workflows for select to authenticated
using (
  private.current_active_role() in ('master', 'recepcao')
  or (
    private.current_active_role() = 'profissional'
    and exists (
      select 1 from public.patient_visits v
      where v.id = visit_room_workflows.visit_id
        and v.professional_id = (select auth.uid())
    )
  )
  or (
    private.current_active_role() = 'sala'
    and exists (
      select 1 from public.rooms r
      where r.id = visit_room_workflows.room_id
        and r.assigned_profile_id = (select auth.uid())
        and r.active is true
    )
  )
);

drop policy if exists visit_room_workflows_insert_reception on public.visit_room_workflows;
create policy visit_room_workflows_insert_reception
on public.visit_room_workflows for insert to authenticated
with check (
  private.current_active_role() in ('master', 'recepcao')
  and exists (
    select 1 from public.patient_visits v
    where v.id = visit_room_workflows.visit_id
  )
);

drop policy if exists visit_room_workflows_update_reception on public.visit_room_workflows;
create policy visit_room_workflows_update_reception
on public.visit_room_workflows for update to authenticated
using (private.current_active_role() in ('master', 'recepcao'))
with check (private.current_active_role() in ('master', 'recepcao'));

drop policy if exists visit_room_workflows_update_professional on public.visit_room_workflows;
create policy visit_room_workflows_update_professional
on public.visit_room_workflows for update to authenticated
using (
  private.current_active_role() = 'profissional'
  and exists (
    select 1 from public.patient_visits v
    where v.id = visit_room_workflows.visit_id
      and v.professional_id = (select auth.uid())
  )
)
with check (
  private.current_active_role() = 'profissional'
  and exists (
    select 1 from public.patient_visits v
    where v.id = visit_room_workflows.visit_id
      and v.professional_id = (select auth.uid())
  )
);

drop policy if exists visit_room_workflows_update_room on public.visit_room_workflows;
create policy visit_room_workflows_update_room
on public.visit_room_workflows for update to authenticated
using (
  private.current_active_role() = 'sala'
  and exists (
    select 1 from public.rooms r
    where r.id = visit_room_workflows.room_id
      and r.assigned_profile_id = (select auth.uid())
      and r.active is true
  )
)
with check (
  private.current_active_role() = 'sala'
  and exists (
    select 1 from public.rooms r
    where r.id = visit_room_workflows.room_id
      and r.assigned_profile_id = (select auth.uid())
      and r.active is true
  )
);

drop policy if exists visit_room_workflows_delete_master on public.visit_room_workflows;
create policy visit_room_workflows_delete_master
on public.visit_room_workflows for delete to authenticated
using (private.current_active_role() = 'master');

grant select, insert, delete on public.visit_room_workflows to authenticated;
grant update (status, call_label, display_order)
  on public.visit_room_workflows to authenticated;

-- Reception-station calls are separate from exam/room calls.
alter table public.patient_visits
  add column if not exists exam_types text[] not null default '{}',
  add column if not exists reception_call_room_id uuid references public.rooms(id) on delete set null,
  add column if not exists reception_call_label text,
  add column if not exists reception_called_at timestamptz;

grant update (exam_types, reception_call_room_id, reception_call_label, reception_called_at)
  on public.patient_visits to authenticated;

create or replace function private.guard_reception_station_call()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if (
    new.reception_call_room_id is distinct from old.reception_call_room_id
    or new.reception_call_label is distinct from old.reception_call_label
    or new.reception_called_at is distinct from old.reception_called_at
  ) and private.current_active_role() not in ('master', 'recepcao') then
    raise exception 'Somente a recepção pode iniciar ou remover chamadas de recepção.';
  end if;

  if new.reception_call_room_id is not null
     and not exists (
       select 1 from public.rooms r
       where r.id = new.reception_call_room_id
         and r.room_type = 'recepcao'
         and r.active is true
     ) then
    raise exception 'A estação de recepção selecionada não está ativa.';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_reception_station_call() from public, anon, authenticated;
drop trigger if exists patient_visits_guard_reception_station_call on public.patient_visits;
create trigger patient_visits_guard_reception_station_call
before update on public.patient_visits
for each row execute function private.guard_reception_station_call();


create or replace function private.guard_visit_room_workflow_update()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $
begin
  if private.current_active_role() = 'sala'
     and (
       new.service_key is distinct from old.service_key
       or new.room_id is distinct from old.room_id
       or new.service_label is distinct from old.service_label
       or new.call_label is distinct from old.call_label
       or new.display_order is distinct from old.display_order
     ) then
    raise exception 'A conta da sala pode alterar somente o estado do atendimento.';
  end if;
  return new;
end;
$;
revoke all on function private.guard_visit_room_workflow_update() from public, anon, authenticated;
drop trigger if exists visit_room_workflows_guard_update on public.visit_room_workflows;
create trigger visit_room_workflows_guard_update
before update on public.visit_room_workflows
for each row execute function private.guard_visit_room_workflow_update();

create or replace function private.visit_room_workflows_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  if new.status is distinct from old.status then
    new.updated_by := (select auth.uid());
    if new.status = 'chamado' then
      new.called_at := now();
    elsif new.status = 'em_atendimento' then
      new.started_at := now();
    elsif new.status = 'liberado' then
      new.released_at := now();
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.visit_room_workflows_set_updated_at() from public, anon, authenticated;
drop trigger if exists visit_room_workflows_set_updated_at on public.visit_room_workflows;
create trigger visit_room_workflows_set_updated_at
before update on public.visit_room_workflows
for each row execute function private.visit_room_workflows_set_updated_at();

-- Minimal public display only: abbreviated patient label and the station/room.
-- This view intentionally does not expose patient IDs, CPF, dates of birth,
-- company, exam names, or clinical data.
create or replace view public.public_waiting_room_calls
with (security_barrier = true)
as
select
  case
    when position(' ' in trim(p.full_name)) > 0 then
      regexp_replace(trim(p.full_name), '\s+.*$', '')
      || ' '
      || left(regexp_replace(trim(p.full_name), '^.*\s+', ''), 1)
      || '.'
    else regexp_replace(trim(p.full_name), '\s+.*$', '')
  end as display_name,
  coalesce(r.name, 'Recepção') as room_name,
  v.reception_called_at as called_at
from public.patient_visits v
join public.patients p on p.id = v.patient_id
left join public.rooms r on r.id = v.reception_call_room_id
where v.visit_date = current_date
  and v.reception_call_room_id is not null
  and v.reception_called_at is not null

union all

select
  case
    when position(' ' in trim(p.full_name)) > 0 then
      regexp_replace(trim(p.full_name), '\s+.*$', '')
      || ' '
      || left(regexp_replace(trim(p.full_name), '^.*\s+', ''), 1)
      || '.'
    else regexp_replace(trim(p.full_name), '\s+.*$', '')
  end as display_name,
  coalesce(w.call_label, r.name, w.service_label) as room_name,
  w.called_at as called_at
from public.visit_room_workflows w
join public.patient_visits v on v.id = w.visit_id
join public.patients p on p.id = v.patient_id
join public.rooms r on r.id = w.room_id
where v.visit_date = current_date
  and w.status in ('chamado', 'em_atendimento')
  and w.called_at is not null;


union all

-- Backward compatibility for visits created by the current online interface.
select
  case
    when position(' ' in trim(p.full_name)) > 0 then
      regexp_replace(trim(p.full_name), '\\s+.*
grant select on public.public_waiting_room_calls to anon;
, '')
      || ' '
      || left(regexp_replace(trim(p.full_name), '^.*\\s+', ''), 1)
      || '.'
    else regexp_replace(trim(p.full_name), '\\s+.*
grant select on public.public_waiting_room_calls to anon;
, '')
  end as display_name,
  coalesce(r.name, 'Recepção') as room_name,
  coalesce(v.started_at, v.updated_at) as called_at
from public.patient_visits v
join public.patients p on p.id = v.patient_id
left join public.rooms r on r.id = v.room_id
where v.visit_date = current_date
  and v.status in ('chamado', 'em_atendimento')
  and not exists (
    select 1 from public.visit_room_workflows w
    where w.visit_id = v.id and w.status in ('chamado', 'em_atendimento')
  )

revoke all on public.public_waiting_room_calls from public, authenticated;
grant select on public.public_waiting_room_calls to anon;


-- Atomic reception check-in: patient, visit, per-room workflows and requested
-- exams are committed together or rolled back together. SECURITY INVOKER keeps
-- all existing RLS policies in force; no service-role bypass is introduced.
create or replace function public.create_local_compatible_visit(
  p_patient jsonb,
  p_visit jsonb,
  p_workflows jsonb,
  p_exams jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  v_patient_id uuid;
  v_visit_id uuid;
  v_room_count integer;
begin
  if coalesce(private.current_active_role(), '') not in ('master', 'recepcao') then
    raise exception 'Somente a recepção pode cadastrar pacientes na fila.';
  end if;
  if coalesce(jsonb_typeof(p_patient), '') <> 'object'
     or coalesce(jsonb_typeof(p_visit), '') <> 'object'
     or coalesce(jsonb_typeof(p_workflows), '') <> 'array'
     or coalesce(jsonb_typeof(coalesce(p_exams, '[]'::jsonb)), '') <> 'array' then
    raise exception 'Dados de cadastro inválidos.';
  end if;
  if jsonb_array_length(p_workflows) = 0 then
    raise exception 'Selecione pelo menos uma sala para o atendimento.';
  end if;

  select count(*) into v_room_count
  from jsonb_to_recordset(p_workflows) as w(room_id uuid)
  join public.rooms r on r.id = w.room_id
  where r.active is true and r.room_type <> 'recepcao';
  if v_room_count <> jsonb_array_length(p_workflows) then
    raise exception 'Uma ou mais salas selecionadas não existem ou estão inativas.';
  end if;

  insert into public.patients (
    full_name, cpf, birth_date, company_name, insurance, job_title, created_by
  ) values (
    nullif(trim(p_patient->>'full_name'), ''),
    nullif(regexp_replace(coalesce(p_patient->>'cpf', ''), '\D', '', 'g'), ''),
    nullif(p_patient->>'birth_date', '')::date,
    nullif(trim(p_patient->>'company_name'), ''),
    nullif(trim(p_patient->>'insurance'), ''),
    nullif(trim(p_patient->>'job_title'), ''),
    (select auth.uid())
  ) returning id into v_patient_id;

  insert into public.patient_visits (
    patient_id, visit_date, attendance_type, exam_types, status,
    company_name, professional_id, room_id, initial_room_ids,
    priority, aso_pending, aso_completed, checked_in_at, created_by
  ) values (
    v_patient_id,
    coalesce(nullif(p_visit->>'visit_date', '')::date, current_date),
    coalesce(nullif(p_visit->>'attendance_type', ''), 'Pontual'),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_visit->'exam_types', '[]'::jsonb))), '{}'),
    'aguardando',
    nullif(trim(p_visit->>'company_name'), ''),
    nullif(p_visit->>'professional_id', '')::uuid,
    nullif(p_visit->>'room_id', '')::uuid,
    coalesce(array(select jsonb_array_elements_text(coalesce(p_visit->'initial_room_ids', '[]'::jsonb))::uuid), '{}'),
    coalesce((p_visit->>'priority')::boolean, false),
    coalesce((p_visit->>'aso_pending')::boolean, false),
    false,
    coalesce(nullif(p_visit->>'checked_in_at', '')::timestamptz, now()),
    (select auth.uid())
  ) returning id into v_visit_id;

  insert into public.visit_room_workflows (
    visit_id, service_key, room_id, service_label, status, call_label, display_order
  )
  select v_visit_id, w.service_key, w.room_id, w.service_label,
         coalesce(nullif(w.status, ''), 'aguardando'),
         nullif(w.call_label, ''), coalesce(w.display_order, 0)
  from jsonb_to_recordset(p_workflows) as w(
    service_key text, room_id uuid, service_label text, status text,
    call_label text, display_order integer
  );

  if jsonb_array_length(coalesce(p_exams, '[]'::jsonb)) > 0 then
    insert into public.visit_exams (visit_id, exam_name, room_id, display_order)
    select v_visit_id, e.exam_name, e.room_id, coalesce(e.display_order, 0)
    from jsonb_to_recordset(p_exams) as e(
      exam_name text, room_id uuid, display_order integer
    )
    where nullif(trim(e.exam_name), '') is not null;
  end if;

  return v_visit_id;
end;
$$;

revoke all on function public.create_local_compatible_visit(jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.create_local_compatible_visit(jsonb, jsonb, jsonb, jsonb) to authenticated;


-- A room account must see a visit when its room is any of the visit's selected
-- rooms, not only when it happens to be the first room_id.
drop policy if exists patient_visits_select_authorized on public.patient_visits;
create policy patient_visits_select_authorized on public.patient_visits
for select to authenticated
using (
  private.current_active_role() in ('master', 'recepcao')
  or (
    private.current_active_role() = 'profissional'
    and professional_id = (select auth.uid())
  )
  or (
    private.current_active_role() = 'sala'
    and exists (
      select 1 from public.rooms r
      where r.assigned_profile_id = (select auth.uid())
        and r.active is true
        and (r.id = patient_visits.room_id or r.id = any(patient_visits.initial_room_ids))
    )
  )
);


-- Local FAVMED has a shared professional queue filtered by service/room, not by
-- an assigned clinician. Preserve that behavior for unassigned visits while
-- keeping visits explicitly assigned to another professional private.
drop policy if exists patients_select_authorized on public.patients;
create policy patients_select_authorized on public.patients
for select to authenticated
using (
  private.current_active_role() in ('master', 'recepcao')
  or (
    private.current_active_role() = 'profissional'
    and exists (
      select 1 from public.patient_visits v
      where v.patient_id = patients.id
        and (v.professional_id = (select auth.uid()) or v.professional_id is null)
    )
  )
);

drop policy if exists patient_visits_select_authorized on public.patient_visits;
create policy patient_visits_select_authorized on public.patient_visits
for select to authenticated
using (
  private.current_active_role() in ('master', 'recepcao')
  or (
    private.current_active_role() = 'profissional'
    and (professional_id = (select auth.uid()) or professional_id is null)
  )
  or (
    private.current_active_role() = 'sala'
    and exists (
      select 1 from public.rooms r
      where r.assigned_profile_id = (select auth.uid())
        and r.active is true
        and (r.id = patient_visits.room_id or r.id = any(patient_visits.initial_room_ids))
    )
  )
);

drop policy if exists visit_room_workflows_select_authorized on public.visit_room_workflows;
create policy visit_room_workflows_select_authorized
on public.visit_room_workflows for select to authenticated
using (
  private.current_active_role() in ('master', 'recepcao')
  or (
    private.current_active_role() = 'profissional'
    and exists (
      select 1 from public.patient_visits v
      where v.id = visit_room_workflows.visit_id
        and (v.professional_id = (select auth.uid()) or v.professional_id is null)
    )
  )
  or (
    private.current_active_role() = 'sala'
    and exists (
      select 1 from public.rooms r
      where r.id = visit_room_workflows.room_id
        and r.assigned_profile_id = (select auth.uid())
        and r.active is true
    )
  )
);

drop policy if exists visit_room_workflows_update_professional on public.visit_room_workflows;
create policy visit_room_workflows_update_professional
on public.visit_room_workflows for update to authenticated
using (
  private.current_active_role() = 'profissional'
  and exists (
    select 1 from public.patient_visits v
    where v.id = visit_room_workflows.visit_id
      and (v.professional_id = (select auth.uid()) or v.professional_id is null)
  )
)
with check (
  private.current_active_role() = 'profissional'
  and exists (
    select 1 from public.patient_visits v
    where v.id = visit_room_workflows.visit_id
      and (v.professional_id = (select auth.uid()) or v.professional_id is null)
  )
);

drop policy if exists visit_exams_select_authorized on public.visit_exams;
create policy visit_exams_select_authorized on public.visit_exams
for select to authenticated
using (
  private.current_active_role() in ('master', 'recepcao')
  or exists (
    select 1 from public.patient_visits v
    where v.id = visit_exams.visit_id
      and private.current_active_role() = 'profissional'
      and (v.professional_id = (select auth.uid()) or v.professional_id is null)
  )
  or exists (
    select 1 from public.rooms r
    where r.id = visit_exams.room_id
      and r.assigned_profile_id = (select auth.uid())
      and r.active is true
      and private.current_active_role() = 'sala'
  )
);

drop policy if exists visit_exams_update_professional on public.visit_exams;
create policy visit_exams_update_professional on public.visit_exams
for update to authenticated
using (
  private.current_active_role() = 'profissional'
  and exists (
    select 1 from public.patient_visits v
    where v.id = visit_exams.visit_id
      and (v.professional_id = (select auth.uid()) or v.professional_id is null)
  )
)
with check (
  private.current_active_role() = 'profissional'
  and exists (
    select 1 from public.patient_visits v
    where v.id = visit_exams.visit_id
      and (v.professional_id = (select auth.uid()) or v.professional_id is null)
  )
);
