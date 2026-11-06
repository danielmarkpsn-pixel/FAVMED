-- The hallway screen uses a dedicated anonymous read-only client.
-- Staff panels use their own authenticated RPCs, so this endpoint needs no
-- authenticated EXECUTE grant.
revoke execute on function public.favmed_get_public_queue(text) from authenticated;
grant execute on function public.favmed_get_public_queue(text) to anon;
