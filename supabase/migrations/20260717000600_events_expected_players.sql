-- Planning headcount for an event — "how many golfers are coming" — collected
-- by the wizard's first screen and editable until the first round starts.
-- Informational until the roster (O-101) reconciles against it; no RLS change
-- (column rides the existing events policies).
alter table public.events add column expected_players integer;
