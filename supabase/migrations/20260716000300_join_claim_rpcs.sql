-- ===========================================================================
-- O-92 — Anonymous player claim flow (no-account join via link)
--
-- A player opens the share link, (anonymously) signs in, sees the roster, and
-- either claims a pre-entered name or adds themselves — no account, no email
-- (Hard Rule 3). These SECURITY DEFINER RPCs are the ONLY way an unbound user
-- touches an event: there is deliberately no broad SELECT/INSERT policy on
-- events/event_players for non-members (that would leak every event). Each RPC
-- validates the join code and scopes strictly to that one event.
--
-- After a successful claim/add, `event_players.claimed_by = auth.uid()`, so the
-- `is_event_member` RLS path (tenant-core migration) lights up and the player
-- can read the event and write their own scores — nothing else.
--
-- Depends on: 20260716000100 (events, event_players).
-- ===========================================================================

-- Peek an event by its join code: the event summary + roster (names + claimed
-- flag only — no handicaps, no other players' UIDs). Lets a not-yet-bound
-- player choose their slot. Returns null for an unknown code.
create or replace function public.get_event_by_code(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ev public.events;
begin
  select * into ev from public.events where join_code = p_code;
  if ev.id is null then
    return null;
  end if;
  return jsonb_build_object(
    'event', jsonb_build_object('id', ev.id, 'name', ev.name, 'status', ev.status),
    'players', coalesce((
      select jsonb_agg(
               jsonb_build_object('id', ep.id, 'name', ep.name, 'claimed', ep.claimed_by is not null)
               order by ep.created_at)
      from public.event_players ep
      where ep.event_id = ev.id and ep.status = 'active'
    ), '[]'::jsonb)
  );
end;
$$;

-- Bind the caller's anonymous UID to an existing roster slot. Recovery for the
-- "two guys tapped Mike" / lost-session case: an already-claimed slot re-binds
-- only when the 4-digit rejoin PIN matches. Returns the slot + its PIN.
create or replace function public.claim_slot(p_code text, p_player_id uuid, p_pin text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ev  public.events;
  ep  public.event_players;
  pin text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select * into ev from public.events where join_code = p_code;
  if ev.id is null then raise exception 'event not found'; end if;
  if ev.status = 'final' then raise exception 'event has ended'; end if;

  select * into ep from public.event_players
    where id = p_player_id and event_id = ev.id and status = 'active';
  if ep.id is null then raise exception 'roster slot not found'; end if;

  if ep.claimed_by is null then
    pin := lpad((floor(random() * 10000))::int::text, 4, '0');
    update public.event_players set claimed_by = auth.uid(), rejoin_pin = pin where id = ep.id;
  elsif ep.claimed_by = auth.uid() then
    pin := ep.rejoin_pin;                       -- already mine, no-op
  else
    if p_pin is null or p_pin <> ep.rejoin_pin then
      raise exception 'slot already claimed';   -- wrong/absent PIN
    end if;
    pin := ep.rejoin_pin;
    update public.event_players set claimed_by = auth.uid() where id = ep.id;
  end if;

  return jsonb_build_object('player_id', ep.id, 'event_id', ev.id, 'rejoin_pin', pin);
end;
$$;

-- A player not on the pre-entered roster adds themselves. Creates an active,
-- claimed slot and returns its PIN.
create or replace function public.add_self(p_code text, p_name text, p_handicap numeric default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ev     public.events;
  new_id uuid;
  pin    text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'name required'; end if;

  select * into ev from public.events where join_code = p_code;
  if ev.id is null then raise exception 'event not found'; end if;
  if ev.status = 'final' then raise exception 'event has ended'; end if;

  -- (O-108) A2 enforces the free-tier player-count cap here, server-side.

  pin := lpad((floor(random() * 10000))::int::text, 4, '0');
  insert into public.event_players (event_id, name, handicap, claimed_by, rejoin_pin)
    values (ev.id, trim(p_name), p_handicap, auth.uid(), pin)
    returning id into new_id;

  return jsonb_build_object('player_id', new_id, 'event_id', ev.id, 'rejoin_pin', pin);
end;
$$;

-- Only signed-in users (incl. anonymous) may call these; not the public role.
revoke execute on function public.get_event_by_code(text) from public;
revoke execute on function public.claim_slot(text, uuid, text) from public;
revoke execute on function public.add_self(text, text, numeric) from public;
grant execute on function public.get_event_by_code(text) to authenticated;
grant execute on function public.claim_slot(text, uuid, text) to authenticated;
grant execute on function public.add_self(text, text, numeric) to authenticated;
