-- Keep exam-level professional calls and add visit-level reception station calls.
-- Reception calls must not overwrite visit_exams.room_id (the examination room).
create or replace view public.public_waiting_room_calls
with (security_barrier = true)
as
with calls as (
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
    and v.visit_date = current_date

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
    coalesce(r.name, 'Recepção') as room_name,
    v.updated_at as called_at
  from public.patient_visits v
  join public.patients p on p.id = v.patient_id
  left join public.rooms r on r.id = v.room_id
  where v.status = 'chamado'
    and v.visit_date = current_date
    and not exists (
      select 1 from public.visit_exams e
      where e.visit_id = v.id and e.status = 'chamado'
    )
)
select display_name, room_name, called_at
from calls;

revoke all on public.public_waiting_room_calls from public, authenticated;
grant select on public.public_waiting_room_calls to anon;
