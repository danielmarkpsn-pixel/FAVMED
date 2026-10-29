-- Harden audit identity and visit lifecycle timestamps.
-- Additive change: preserve existing records and replace client-supplied audit fields.

create index if not exists patients_created_by_idx
  on public.patients (created_by);
create index if not exists patient_visits_created_by_idx
  on public.patient_visits (created_by);
create index if not exists visit_exams_completed_by_idx
  on public.visit_exams (completed_by);

create or replace function private.set_audit_created_by()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if (select auth.uid()) is not null then
    new.created_by := (select auth.uid());
  end if;
  return new;
end;
$$;
revoke all on function private.set_audit_created_by() from public, anon, authenticated;

drop trigger if exists patients_set_created_by on public.patients;
create trigger patients_set_created_by
before insert on public.patients
for each row execute function private.set_audit_created_by();

drop trigger if exists patient_visits_set_created_by on public.patient_visits;
create trigger patient_visits_set_created_by
before insert on public.patient_visits
for each row execute function private.set_audit_created_by();

create or replace function private.set_patient_visit_timestamps()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if new.status = 'em_atendimento' and old.status is distinct from 'em_atendimento' then
    new.started_at := now();
  elsif new.status in ('aguardando', 'cancelado') then
    new.started_at := null;
  end if;

  if new.status = 'atendido' and old.status is distinct from 'atendido' then
    new.completed_at := now();
  elsif new.status <> 'atendido' then
    new.completed_at := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.set_patient_visit_timestamps() from public, anon, authenticated;

drop trigger if exists patient_visits_set_lifecycle_timestamps on public.patient_visits;
create trigger patient_visits_set_lifecycle_timestamps
before update on public.patient_visits
for each row execute function private.set_patient_visit_timestamps();

revoke update (started_at, completed_at) on public.patient_visits from authenticated;
grant update (visit_date, attendance_type, status, company_name, professional_id, room_id, updated_at)
  on public.patient_visits to authenticated;
