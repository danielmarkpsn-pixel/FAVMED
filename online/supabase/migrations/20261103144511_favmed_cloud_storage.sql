
insert into storage.buckets (id,name,public,file_size_limit)
values
  ('favmed-documents','favmed-documents',false,10485760),
  ('favmed-media','favmed-media',false,524288000)
on conflict (id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit;

drop policy if exists favmed_documents_read on storage.objects;
drop policy if exists favmed_documents_insert on storage.objects;
drop policy if exists favmed_documents_delete on storage.objects;
drop policy if exists favmed_media_read on storage.objects;
drop policy if exists favmed_media_insert on storage.objects;
drop policy if exists favmed_media_delete on storage.objects;

create policy favmed_documents_read on storage.objects for select to authenticated
using (bucket_id='favmed-documents' and private.current_active_role()=any(array['master','recepcao','profissional']::text[]));
create policy favmed_documents_insert on storage.objects for insert to authenticated
with check (bucket_id='favmed-documents' and private.current_active_role()=any(array['master','recepcao']::text[]));
create policy favmed_documents_delete on storage.objects for delete to authenticated
using (bucket_id='favmed-documents' and private.current_active_role()=any(array['master','recepcao']::text[]));
create policy favmed_media_read on storage.objects for select to authenticated
using (bucket_id='favmed-media' and private.current_active_role()=any(array['master','recepcao','profissional','sala']::text[]));
create policy favmed_media_insert on storage.objects for insert to authenticated
with check (bucket_id='favmed-media' and private.current_active_role()=any(array['master','recepcao']::text[]));
create policy favmed_media_delete on storage.objects for delete to authenticated
using (bucket_id='favmed-media' and private.current_active_role()=any(array['master','recepcao']::text[]));
