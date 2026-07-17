-- ===========================================================================
-- Fix: INSERT ... RETURNING on events was rejected by RLS (42501)
--
-- Root cause: when an INSERT carries a RETURNING clause (which supabase-js
-- always adds via `.select()`, and PostgREST via `Prefer: return=representation`),
-- Postgres additionally requires the NEW row to be visible under a SELECT
-- policy. The original events_select policy checked visibility through
-- `is_event_organizer(id)` — a SECURITY DEFINER helper that looks the row up
-- in `events` by id. A row being inserted is not yet visible to queries inside
-- the same command (command-id visibility), so the lookup found nothing, the
-- SELECT policy evaluated false, and the whole insert failed with the
-- misleading "new row violates row-level security policy for table events".
--
-- Fix: evaluate ownership directly against the row's own column
-- (`organizer_id = auth.uid()`), which works for both existing rows and the
-- row being inserted. The member branch (`is_event_member`) is unchanged — it
-- queries event_players, a different table, so it never had this problem.
--
-- The other tables are already safe: their SELECT policies look up OTHER
-- tables (events / rounds / event_players), whose rows exist before the
-- insert in question. `events` was the only self-referential case.
--
-- Verified against a local Postgres 16: insert-with-RETURNING succeeds for
-- the organizer; cross-tenant isolation holds (a second user sees zero rows);
-- teams / event_players / rounds inserts with RETURNING all pass; the
-- claimed-member visibility path still works.
-- ===========================================================================

drop policy events_select on public.events;
create policy events_select on public.events
  for select using (organizer_id = auth.uid() or is_event_member(id));
