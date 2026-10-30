-- Allow active professionals to read the shared operational queue.
-- This changes SELECT visibility only; UPDATE permissions remain restricted to
-- visits/exams assigned to the professional. RLS stays enabled on all tables.
-- The current operational schema is single-clinic (no tenant_id/clinic_id exists).

drop policy if exists patient_visits_select_authorized on public.patient_visits;
create policy patient_visits_select_authorized on public.patient_visits
for select to authenticated
using (
  private.current_active_role() in ('master', 'recepcao', 'profissional')
  or (
    private.current_active_role() = 'sala'
    and exists (
      select 1 from public.rooms r
      where r.id = patient_visits.room_id
        and r.assigned_profile_id = (select auth.uid())
        and r.active is true
    )
  )
);

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
    )
  )
);

drop policy if exists visit_exams_select_authorized on public.visit_exams;
create policy visit_exams_select_authorized on public.visit_exams
for select to authenticated
using (
  private.current_active_role() in ('master', 'recepcao')
  or (
    private.current_active_role() = 'profissional'
    and exists (
      select 1 from public.patient_visits v
      where v.id = visit_exams.visit_id
    )
  )
  or (
    private.current_active_role() = 'sala'
    and exists (
      select 1 from public.rooms r
      where r.id = visit_exams.room_id
        and r.assigned_profile_id = (select auth.uid())
        and r.active is true
    )
  )
);
