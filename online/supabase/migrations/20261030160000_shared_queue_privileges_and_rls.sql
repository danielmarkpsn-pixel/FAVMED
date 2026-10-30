-- Restore explicit table/column privileges and shared-queue visibility.
-- RLS remains enabled and remains the row-level authorization boundary.

grant select on public.patients, public.patient_visits, public.visit_exams to authenticated;
grant update (insurance, job_title, document_path, updated_at) on public.patients to authenticated;
grant update (room_id, status, result_summary, display_order, updated_at) on public.visit_exams to authenticated;

drop policy if exists patient_visits_select_authorized on public.patient_visits;
create policy patient_visits_select_authorized on public.patient_visits
for select to authenticated
using (
  private.current_active_role() in ('master', 'recepcao', 'profissional')
  or (
    private.current_active_role() = 'sala'
    and (
      exists (
        select 1 from public.rooms r
        where r.id = patient_visits.room_id
          and r.assigned_profile_id = (select auth.uid())
          and r.active is true
      )
      or exists (
        select 1
        from public.visit_exams e
        join public.rooms r on r.id = e.room_id
        where e.visit_id = patient_visits.id
          and r.assigned_profile_id = (select auth.uid())
          and r.active is true
      )
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
  private.current_active_role() in ('master', 'recepcao', 'profissional')
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
