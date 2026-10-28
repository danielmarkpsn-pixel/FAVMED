-- DRAFT ONLY — review before applying to any Supabase project.
-- This file is a design draft, not an applied migration.
-- Scope: authentication profiles only. No patient/queue tables are included.

begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 120),
  role text not null check (role in ('master', 'recepcao', 'profissional', 'sala')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.profiles force row level security;

-- Profiles are readable only by the owner for now.
-- Master-wide listing and user administration must go through a server-side
-- Edge Function that validates the caller's active Master profile.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

-- Intentionally no INSERT, UPDATE, or DELETE policies for browser clients.
-- This prevents self-registration, role escalation, and client-side disabling.
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;

-- Server-side admin functions are not included in this draft. The initial
-- Master must be provisioned through a controlled administrative process.
-- Never put a service_role/secret key in browser code or Git.

commit;
