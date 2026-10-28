-- Restore the administrative CRUD privileges required by the master-users Edge Function.
-- RLS remains enabled; service_role bypasses RLS by design and is only used server-side.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO service_role;
