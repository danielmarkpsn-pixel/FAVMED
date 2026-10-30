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
grant update (status, call_label, called_at, started_at, released_at, updated_by, display_order, updated_at)
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
