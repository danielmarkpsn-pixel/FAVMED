-- Restore reception/professional workflow fields that exist in the local FAVMED module.
alter table public.patients
  add column if not exists insurance text,
  add column if not exists job_title text;

alter table public.patient_visits
  add column if not exists priority boolean not null default false,
  add column if not exists aso_pending boolean not null default false,
  add column if not exists aso_completed boolean not null default false;

alter table public.patient_visits
  drop constraint if exists patient_visits_attendance_type_check;
alter table public.patient_visits
  add constraint patient_visits_attendance_type_check
  check (attendance_type in (
    'Admissional', 'Demissional', 'Periódico', 'Retorno',
    'Mudança de riscos', 'Particular', 'Pontual',
    'Consulta Ocupacional', 'Concurso', 'Agendado'
  ));

alter table public.patient_visits
  drop constraint if exists patient_visits_aso_flags_check;
alter table public.patient_visits
  add constraint patient_visits_aso_flags_check
  check (not (aso_pending and aso_completed));

grant update (insurance, job_title) on public.patients to authenticated;
grant update (priority, aso_pending, aso_completed) on public.patient_visits to authenticated;

create or replace function private.guard_reception_visit_flags()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if private.current_active_role() not in ('master', 'recepcao')
     and (new.priority is distinct from old.priority
       or new.aso_pending is distinct from old.aso_pending
       or new.aso_completed is distinct from old.aso_completed) then
    raise exception 'Somente a recepção pode alterar prioridade e status do ASO.';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_reception_visit_flags() from public, anon, authenticated;
drop trigger if exists patient_visits_guard_reception_flags on public.patient_visits;
create trigger patient_visits_guard_reception_flags
before update on public.patient_visits
for each row execute function private.guard_reception_visit_flags();
