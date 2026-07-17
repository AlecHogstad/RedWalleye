-- ===========================================================================
-- Hide event_players.rejoin_pin from direct reads
--
-- Members can SELECT the roster (event_players_select), and row access
-- exposes every column — including other players' rejoin PINs, which would
-- let any joined player hijack a teammate's slot via claim_slot. Column-level
-- grants fix it: re-grant SELECT on every column EXCEPT rejoin_pin.
--
-- The PIN still reaches its owner through the O-92 RPCs (SECURITY DEFINER),
-- which is the only place it's needed. Organizer-side PIN recovery (O-101)
-- will use a definer RPC as well.
--
-- NOTE for the app: with column grants in place, `select *` fails with
-- "permission denied" — the API layer selects explicit column lists.
-- ===========================================================================

revoke select on public.event_players from authenticated;
grant select (id, event_id, name, handicap, team_id, claimed_by, status, created_at)
  on public.event_players to authenticated;
