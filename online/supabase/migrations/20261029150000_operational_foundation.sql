-- FAVMED Online: operational data foundation.
-- This migration is intentionally additive and belongs to the feature branch.
-- Do not apply to production until reviewed and validated with distinct test users.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.current_active_role()
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid())
    and p.active is true
  limit 1;
$$;
revoke all on function private.current_active_role() from public, anon;
grant execute on function private.current_active_role() to authenticated;

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(trim(full_name)) between 2 and 160),
  cpf text unique check (cpf is null or cpf ~ '^[0-9]{11}$'),
  birth_date date,
  sex text check (sex is null or sex in ('feminino', 'masculino', 'outro', 'nao_informado')),
  phone text,
  email text,
  company_name text,
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.professionals (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete restrict,
  specialty text,
  registration_number text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(trim(name)) between 1 and 80),
  room_type text not null default 'atendimento'
    check (room_type in ('recepcao', 'consulta', 'exame', 'espera', 'outro')),
  assigned_profile_id uuid unique references public.profiles(id) on delete set null,
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.patient_visits (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete restrict,
  visit_date date not null default current_date,
  attendance_type text not null default 'Pontual'
    check (attendance_type in ('Pontual', 'Consulta Ocupacional', 'Agendado')),
  status text not null default 'aguardando'
    check (status in ('aguardando', 'em_atendimento', 'atendido', 'cancelado')),
  company_name text,
  professional_id uuid references public.profiles(id) on delete set null,
  room_id uuid references public.rooms(id) on delete set null,
  checked_in_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.visit_exams (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.patient_visits(id) on delete cascade,
  exam_name text not null check (char_length(trim(exam_name)) between 1 and 160),
  room_id uuid references public.rooms(id) on delete set null,
  status text not null default 'pendente'
    check (status in ('pendente', 'em_atendimento', 'realizado', 'cancelado')),
  result_summary text,
  completed_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists patients_name_idx on public.patients (lower(full_name));
create index if not exists patients_created_at_idx on public.patients (created_at desc);
create index if not exists patient_visits_patient_date_idx on public.patient_visits (patient_id, visit_date desc);
create index if not exists patient_visits_status_date_idx on public.patient_visits (status, visit_date, checked_in_at);
create index if not exists patient_visits_professional_idx on public.patient_visits (professional_id, visit_date desc);
create index if not exists patient_visits_room_idx on public.patient_visits (room_id, visit_date desc);
create index if not exists visit_exams_visit_idx on public.visit_exams (visit_id, display_order);
create index if not exists visit_exams_room_status_idx on public.visit_exams (room_id, status);

alter table public.patients enable row level security;
alter table public.patients force row level security;
alter table public.professionals enable row level security;
alter table public.professionals force row level security;
alter table public.rooms enable row level security;
alter table public.rooms force row level security;
alter table public.patient_visits enable row level security;
alter table public.patient_visits force row level security;
alter table public.visit_exams enable row level security;
alter table public.visit_exams force row level security;

-- Patients: master and reception can manage records. Professionals can only read
-- patients assigned to them through a visit. Waiting-room accounts never read all PII.
create policy patients_select_authorized on public.patients
for select to authenticated
using (
  private.current_active_role() in ('master', 'recepcao')
  or (
    private.current_active_role() = 'profissional'
    and exists (
      select 1 from public.patient_visits v
      where v.patient_id = patients.id
        and v.professional_id = (select auth.uid())
    )
  )
);

create policy patients_insert_reception on public.patients
for insert to authenticated
with check (private.current_active_role() in ('master', 'recepcao'));

create policy patients_update_reception on public.patients
for update to authenticated
using (private.current_active_role() in ('master', 'recepcao'))
with check (private.current_active_role() in ('master', 'recepcao'));

create policy patients_delete_master on public.patients
for delete to authenticated
using (private.current_active_role() = 'master');

-- Professional directory: users see their own professional profile; Master/reception
-- can administer the directory.
create policy professionals_select_authorized on public.professionals
for select to authenticated
using (
  private.current_active_role() in ('master', 'recepcao')
  or profile_id = (select auth.uid())
);

create policy professionals_insert_admin on public.professionals
for insert to authenticated
with check (private.current_active_role() = 'master');

create policy professionals_update_admin on public.professionals
for update to authenticated
using (private.current_active_role() = 'master')
with check (private.current_active_role() = 'master');

create policy professionals_delete_master on public.professionals
for delete to authenticated
using (private.current_active_role() = 'master');

-- Reception, professionals and Master can see active rooms; room accounts can
-- only see the room assigned to their own profile.
create policy rooms_select_authorized on public.rooms
for select to authenticated
using (
  private.current_active_role() in ('master', 'recepcao', 'profissional')
  or (
    private.current_active_role() = 'sala'
    and assigned_profile_id = (select auth.uid())
  )
);

create policy rooms_insert_admin on public.rooms
for insert to authenticated
with check (private.current_active_role() in ('master', 'recepcao'));

create policy rooms_update_admin on public.rooms
for update to authenticated
using (private.current_active_role() in ('master', 'recepcao'))
with check (private.current_active_role() in ('master', 'recepcao'));

create policy rooms_delete_master on public.rooms
for delete to authenticated
using (private.current_active_role() = 'master');

-- Visits: Master/reception manage the queue. Professionals can only read/update
-- visits assigned to them, without being able to reassign the visit.
create policy patient_visits_select_authorized on public.patient_visits
for select to authenticated
using (
  private.current_active_role() in ('master', 'recepcao')
  or (
    private.current_active_role() = 'profissional'
    and professional_id = (select auth.uid())
  )
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

create policy patient_visits_insert_reception on public.patient_visits
for insert to authenticated
with check (private.current_active_role() in ('master', 'recepcao'));

create policy patient_visits_update_reception on public.patient_visits
for update to authenticated
using (private.current_active_role() in ('master', 'recepcao'))
with check (private.current_active_role() in ('master', 'recepcao'));

create policy patient_visits_update_professional on public.patient_visits
for update to authenticated
using (
  private.current_active_role() = 'profissional'
  and professional_id = (select auth.uid())
)
with check (
  private.current_active_role() = 'profissional'
  and professional_id = (select auth.uid())
);

create policy patient_visits_delete_master on public.patient_visits
for delete to authenticated
using (private.current_active_role() = 'master');

-- Exam rows are visible only to Master/reception, the assigned professional,
-- or the account assigned to the exam's room.
create policy visit_exams_select_authorized on public.visit_exams
for select to authenticated
using (
  private.current_active_role() in ('master', 'recepcao')
  or exists (
    select 1 from public.patient_visits v
    where v.id = visit_exams.visit_id
      and v.professional_id = (select auth.uid())
      and private.current_active_role() = 'profissional'
  )
  or exists (
    select 1 from public.rooms r
    where r.id = visit_exams.room_id
      and r.assigned_profile_id = (select auth.uid())
      and r.active is true
      and private.current_active_role() = 'sala'
  )
);

create policy visit_exams_insert_reception on public.visit_exams
for insert to authenticated
with check (private.current_active_role() in ('master', 'recepcao'));

create policy visit_exams_update_reception on public.visit_exams
for update to authenticated
using (private.current_active_role() in ('master', 'recepcao'))
with check (private.current_active_role() in ('master', 'recepcao'));

create policy visit_exams_update_professional on public.visit_exams
for update to authenticated
using (
  private.current_active_role() = 'profissional'
  and exists (
    select 1 from public.patient_visits v
    where v.id = visit_exams.visit_id
      and v.professional_id = (select auth.uid())
  )
)
with check (
  private.current_active_role() = 'profissional'
  and exists (
    select 1 from public.patient_visits v
    where v.id = visit_exams.visit_id
      and v.professional_id = (select auth.uid())
  )
);

create policy visit_exams_delete_master on public.visit_exams
for delete to authenticated
using (private.current_active_role() = 'master');

-- Explicit grants: RLS remains the row-level authorization boundary.
grant select, insert, update, delete on public.patients to authenticated;
grant select, insert, update, delete on public.professionals to authenticated;
grant select, insert, update, delete on public.rooms to authenticated;
grant select, insert, update, delete on public.patient_visits to authenticated;
grant select, insert, update, delete on public.visit_exams to authenticated;
