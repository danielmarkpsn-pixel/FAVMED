-- The authenticated "sala" role uses the same minimized, read-only feed as the public display.
-- The view exposes only an abbreviated patient name, room, call time and status.
grant select on public.public_waiting_room_calls to authenticated;
