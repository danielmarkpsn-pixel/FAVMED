-- Allow every active professional account to work across all rooms, matching local mode.
-- Room filtering remains a UI concern; it is not an authorization boundary.

drop policy if exists patient_visits_update_professional on public.patient_visits;
create policy patient_visits_update_professional
on public.patient_visits
for update
to authenticated
using ((select private.current_active_role()) = 'profissional')
with check ((select private.current_active_role()) = 'profissional');

drop policy if exists visit_exams_update_professional on public.visit_exams;
create policy visit_exams_update_professional
on public.visit_exams
for update
to authenticated
using ((select private.current_active_role()) = 'profissional')
with check ((select private.current_active_role()) = 'profissional');

comment on policy patient_visits_update_professional on public.patient_visits is
'Permite que qualquer profissional ativo atualize atendimentos de todas as salas, conforme o fluxo do modo local.';
comment on policy visit_exams_update_professional on public.visit_exams is
'Permite que qualquer profissional ativo atualize exames de todas as salas, conforme o fluxo do modo local.';
