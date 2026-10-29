-- Private PDF storage for patient documents. Files are never publicly accessible.
alter table public.patients add column if not exists document_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('patient-documents', 'patient-documents', false, 10485760, array['application/pdf']::text[])
on conflict (id) do update
set public = false, file_size_limit = 10485760, allowed_mime_types = array['application/pdf']::text[];

drop policy if exists patient_documents_read_authorized on storage.objects;
create policy patient_documents_read_authorized on storage.objects
for select to authenticated
using (
  bucket_id = 'patient-documents'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and (
    private.current_active_role() in ('master', 'recepcao')
    or (
      private.current_active_role() = 'profissional'
      and exists (
        select 1
        from public.patient_visits v
        where v.patient_id::text = (storage.foldername(name))[1]
          and v.professional_id = (select auth.uid())
      )
    )
  )
);

drop policy if exists patient_documents_insert_reception on storage.objects;
create policy patient_documents_insert_reception on storage.objects
for insert to authenticated
with check (
  bucket_id = 'patient-documents'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and private.current_active_role() in ('master', 'recepcao')
);

drop policy if exists patient_documents_update_reception on storage.objects;
create policy patient_documents_update_reception on storage.objects
for update to authenticated
using (bucket_id = 'patient-documents' and private.current_active_role() in ('master', 'recepcao'))
with check (
  bucket_id = 'patient-documents'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and private.current_active_role() in ('master', 'recepcao')
);

drop policy if exists patient_documents_delete_reception on storage.objects;
create policy patient_documents_delete_reception on storage.objects
for delete to authenticated
using (bucket_id = 'patient-documents' and private.current_active_role() in ('master', 'recepcao'));

grant update (document_path) on public.patients to authenticated;
