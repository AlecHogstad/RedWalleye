-- Match pairings per round (spec §4a, the signed-off JSON v1): who plays whom.
-- Shape: [{ "sideA": [event_player_id | null, ...], "sideB": [...] }] — null is
-- an open seat, so empty pairings render before anyone is assigned. Side A
-- seats come from the ordinal-0 team, side B from ordinal-1. Rides the
-- existing rounds RLS (organizer writes via can_manage_round; members read).
-- Promoted to a real table only if query/RLS needs force it.
alter table public.rounds add column matches_json jsonb not null default '[]'::jsonb;
