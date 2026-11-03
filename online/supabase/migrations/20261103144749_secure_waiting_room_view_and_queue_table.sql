create policy favmed_queue_state_deny_direct_access
on app_private.favmed_queue_state
for all to public
using (false)
with check (false);

create or replace function app_private.favmed_public_waiting_room_calls()
returns table(display_name text, room_name text, called_at timestamptz, call_status text)
language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_role text;
begin
  select p.role into v_role from public.profiles p where p.id=auth.uid() and p.active=true;
  if v_role not in ('master','recepcao','profissional','sala') then
    raise exception 'Perfil sem acesso à tela de chamadas' using errcode='42501';
  end if;
  return query
  select case when position(' ' in trim(p.full_name))>0
    then split_part(trim(p.full_name),' ',1)||' '||left(reverse(split_part(reverse(trim(p.full_name)),' ',1)),1)||'.'
    else trim(p.full_name) end::text,
    coalesce(r.name,'Recepção')::text,e.updated_at,e.status::text
  from public.visit_exams e
  join public.patient_visits v on v.id=e.visit_id
  join public.patients p on p.id=v.patient_id
  left join public.rooms r on r.id=e.room_id
  where e.status=any(array['chamado','em_atendimento']) and v.visit_date=current_date and v.status<>'cancelado'
  union all
  select case when position(' ' in trim(p.full_name))>0
    then split_part(trim(p.full_name),' ',1)||' '||left(reverse(split_part(reverse(trim(p.full_name)),' ',1)),1)||'.'
    else trim(p.full_name) end::text,
    coalesce(r.name,'Recepção')::text,v.updated_at,v.status::text
  from public.patient_visits v
  join public.patients p on p.id=v.patient_id
  left join public.rooms r on r.id=v.room_id
  where v.status=any(array['chamado','em_atendimento']) and v.visit_date=current_date
    and not exists(select 1 from public.visit_exams e where e.visit_id=v.id);
end;
$$;

revoke all on function app_private.favmed_public_waiting_room_calls() from public,anon;
grant execute on function app_private.favmed_public_waiting_room_calls() to authenticated;

create or replace view public.public_waiting_room_calls
with (security_invoker=true)
as select * from app_private.favmed_public_waiting_room_calls();

revoke all on public.public_waiting_room_calls from public,anon;
grant select on public.public_waiting_room_calls to authenticated;