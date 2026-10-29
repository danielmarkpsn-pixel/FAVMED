-- Add a distinct "called" state so the public waiting-room screen announces
-- the patient before the professional marks the consultation as started.

alter table public.patient_visits
  drop constraint if exists patient_visits_status_check;

alter table public.patient_visits
  add constraint patient_visits_status_check
  check (status in ('aguardando', 'chamado', 'em_atendimento', 'atendido', 'cancelado'));

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
  v.updated_at as called_at
from public.patient_visits v
join public.patients p on p.id = v.patient_id
left join public.rooms r on r.id = v.room_id
where v.status = 'chamado'
  and v.visit_date = current_date;

revoke all on public.public_waiting_room_calls from public, authenticated;
grant select on public.public_waiting_room_calls to anon;
