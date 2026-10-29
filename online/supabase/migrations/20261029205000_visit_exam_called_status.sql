-- Exam-level calls allow a professional to call one requested exam/room at a time.
alter table public.visit_exams
  drop constraint if exists visit_exams_status_check;
alter table public.visit_exams
  add constraint visit_exams_status_check
  check (status in ('pendente', 'chamado', 'em_atendimento', 'realizado', 'cancelado'));

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
  e.updated_at as called_at
from public.visit_exams e
join public.patient_visits v on v.id = e.visit_id
join public.patients p on p.id = v.patient_id
left join public.rooms r on r.id = e.room_id
where e.status = 'chamado'
  and v.visit_date = current_date;

revoke all on public.public_waiting_room_calls from public, authenticated;
grant select on public.public_waiting_room_calls to anon;
