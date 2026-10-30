-- Break the visit_exams <-> patient_visits RLS recursion without broadening clinical access.
-- SECURITY DEFINER helper checks the authenticated professional's ownership without
-- re-entering patient_visits RLS from the visit_exams UPDATE policy.
create or replace function private.professional_owns_visit(p_visit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.patient_visits v
    where v.id = p_visit_id
      and v.professional_id = (select auth.uid())
  );
$$;

revoke all on function private.professional_owns_visit(uuid) from public, anon;
grant execute on function private.professional_owns_visit(uuid) to authenticated;

drop policy if exists visit_exams_update_professional on public.visit_exams;
create policy visit_exams_update_professional
on public.visit_exams
for update to authenticated
using (
  private.current_active_role() = 'profissional'
  and private.professional_owns_visit(visit_id)
)
with check (
  private.current_active_role() = 'profissional'
  and private.professional_owns_visit(visit_id)
);

-- Keep the public view anonymized (first name + last initial), but include
-- both called and in-progress calls so the waiting-room display can change state.
create or replace view public.public_waiting_room_calls as
select
  case
    when position(' ' in trim(p.full_name)) > 0 then
      regexp_replace(trim(p.full_name), '\\s+.*$', '') || ' ' ||
      left(regexp_replace(trim(p.full_name), '^.*\\s+', ''), 1) || '.'
    else regexp_replace(trim(p.full_name), '\\s+.*$', '')
  end as display_name,
  coalesce(r.name, 'Recepção') as room_name,
  e.updated_at as called_at,
  e.status as call_status
from public.visit_exams e
join public.patient_visits v on v.id = e.visit_id
join public.patients p on p.id = v.patient_id
left join public.rooms r on r.id = e.room_id
where e.status in ('chamado', 'em_atendimento')
  and v.visit_date = current_date
  and v.status <> 'cancelado'
union all
select
  case
    when position(' ' in trim(p.full_name)) > 0 then
      regexp_replace(trim(p.full_name), '\\s+.*$', '') || ' ' ||
      left(regexp_replace(trim(p.full_name), '^.*\\s+', ''), 1) || '.'
    else regexp_replace(trim(p.full_name), '\\s+.*$', '')
  end as display_name,
  coalesce(r.name, 'Recepção') as room_name,
  v.updated_at as called_at,
  v.status as call_status
from public.patient_visits v
join public.patients p on p.id = v.patient_id
left join public.rooms r on r.id = v.room_id
where v.status in ('chamado', 'em_atendimento')
  and v.visit_date = current_date
  and not exists (
    select 1 from public.visit_exams e where e.visit_id = v.id
  );
