-- Public, read-only waiting-room display. Exposes only a minimized patient label,
-- room name and call timestamp for visits actively being attended today.
-- No patient IDs, CPF, birth date, company, exam details, or write access are exposed.

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
  v.started_at as called_at
from public.patient_visits v
join public.patients p on p.id = v.patient_id
left join public.rooms r on r.id = v.room_id
where v.status = 'em_atendimento'
  and v.visit_date = current_date
  and v.started_at is not null;

revoke all on public.public_waiting_room_calls from public, authenticated;
grant select on public.public_waiting_room_calls to anon;
