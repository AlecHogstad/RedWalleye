-- ===========================================================================
-- O-90 — Event tenant core: events, teams, event_players (+ RLS)
--
-- First slice of the multi-tenant schema. One Postgres DB, shared tables,
-- logical isolation via RLS (never per-tournament DBs). Every table here ships
-- its policies in this same migration — a missing policy is a data leak, not a
-- TODO (Hard Rule 2, default-deny).
--
-- Scope of THIS migration (as signed off):
--   * events         — the tenant root; an organizer's golf event.
--   * teams          — 2-team config (spec §5); N-team is field/cumulative only.
--   * event_players  — the roster; names + handicaps, claimed by anon UIDs.
-- `events` is included because event_players/teams FK to it and every RLS
-- check derives from event ownership. Rounds / round_players / scores / games
-- land in follow-up migrations.
--
-- NOT here (by design):
--   * The join-by-code READ/claim path for an unbound player is O-92, via a
--     SECURITY DEFINER RPC (validates the code, returns/claims a slot) — NOT a
--     broad SELECT policy, which would leak every event. Policies below only
--     admit the organizer and already-bound players.
--   * dollars / payment amounts — Hard Rule 1. `payment_status` is a flag only.
--
-- Ordering note: tables are created before the RLS helper functions, which are
-- created before the policies that call them — SQL function bodies are checked
-- at create time, so their referenced tables must already exist.
--
-- Apply: `supabase db push` (or paste into the SQL editor on the project).
-- ===========================================================================

create extension if not exists pgcrypto; -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- events — an organizer's golf event (the tenant root).
create table public.events (
  id             uuid primary key default gen_random_uuid(),
  organizer_id   uuid not null references auth.users (id) on delete cascade,
  name           text not null,
  starts_on      date,
  ends_on        date,
  -- draft: editable setup · active: a round has started, rules locked ·
  -- final: all rounds done, read-only.
  status         text not null default 'draft'
                   check (status in ('draft', 'active', 'final')),
  -- payment is a flag, never an amount (Hard Rule 1). Flipped by the Stripe
  -- webhook in A2; caps (O-108) read it. Orthogonal to `status`.
  payment_status text not null default 'unpaid'
                   check (payment_status in ('unpaid', 'paid')),
  -- short, shareable join code (app-generated). Unbound players reach the
  -- event through the O-92 RPC by this code, not by row access.
  join_code      text not null unique,
  created_at     timestamptz not null default now()
);
create index events_organizer_id_idx on public.events (organizer_id);

-- teams — 2-team config for v1 (spec §5). N-team stays field/cumulative, so a
-- head-to-head event has exactly two rows here; the app enforces the count.
create table public.teams (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events (id) on delete cascade,
  name       text not null,
  color      text,
  ordinal    smallint not null,        -- 0-based display order (0 = "Team A")
  created_at timestamptz not null default now(),
  unique (event_id, ordinal)
);
create index teams_event_id_idx on public.teams (event_id);

-- event_players — the roster. Names + handicaps; a slot is claimed by an
-- anonymous auth UID on join (O-92). team_id assigns them to a side.
create table public.event_players (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events (id) on delete cascade,
  name       text not null,
  handicap   numeric,
  team_id    uuid references public.teams (id) on delete set null,
  -- the anonymous auth UID that claimed this slot; null = unclaimed.
  claimed_by uuid references auth.users (id) on delete set null,
  -- low-stakes 4-digit recovery code (duplicate claims / lost session) — a
  -- convenience token, not a credential. Claim/rejoin logic is O-92.
  rejoin_pin text,
  -- active: on the roster · withdrawn: removed after scoring, scores kept out
  -- of standings but retained for the audit trail (spec §8).
  status     text not null default 'active'
               check (status in ('active', 'withdrawn')),
  created_at timestamptz not null default now()
);
create index event_players_event_id_idx  on public.event_players (event_id);
create index event_players_claimed_by_idx on public.event_players (claimed_by);
create index event_players_team_id_idx    on public.event_players (team_id);

-- ---------------------------------------------------------------------------
-- RLS helpers — SECURITY DEFINER so policies don't recurse through the very
-- tables they protect. Owned by the migration role (BYPASSRLS), so the checks
-- run without re-triggering RLS. search_path pinned to avoid hijacking.
-- ---------------------------------------------------------------------------
create or replace function public.is_event_organizer(e uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.events ev
    where ev.id = e and ev.organizer_id = auth.uid()
  );
$$;

create or replace function public.is_event_member(e uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.event_players ep
    where ep.event_id = e
      and ep.claimed_by = auth.uid()
      and ep.status = 'active'
  );
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security — enable (default-deny) + explicit policies.
-- ---------------------------------------------------------------------------

alter table public.events enable row level security;

-- Organizer sees and controls their own events; bound players can read the
-- event they belong to. (Unbound join-by-code read is the O-92 RPC.)
create policy events_select on public.events
  for select using (is_event_organizer(id) or is_event_member(id));
create policy events_insert on public.events
  for insert with check (organizer_id = auth.uid());
create policy events_update on public.events
  for update using (is_event_organizer(id)) with check (is_event_organizer(id));
create policy events_delete on public.events
  for delete using (is_event_organizer(id));

alter table public.teams enable row level security;

create policy teams_select on public.teams
  for select using (is_event_organizer(event_id) or is_event_member(event_id));
create policy teams_write on public.teams
  for all using (is_event_organizer(event_id))
  with check (is_event_organizer(event_id));

alter table public.event_players enable row level security;

-- Organizer + bound players of the event can read the roster.
create policy event_players_select on public.event_players
  for select using (is_event_organizer(event_id) or is_event_member(event_id));
-- Organizer pre-enters the roster. Self-add on join is the O-92 RPC.
create policy event_players_insert on public.event_players
  for insert with check (is_event_organizer(event_id));
-- Organizer edits anyone; a player may edit only their own claimed slot.
create policy event_players_update on public.event_players
  for update using (is_event_organizer(event_id) or claimed_by = auth.uid())
  with check (is_event_organizer(event_id) or claimed_by = auth.uid());
-- Only the organizer removes players (hard delete pre-score; withdraw is an
-- UPDATE to status, covered above).
create policy event_players_delete on public.event_players
  for delete using (is_event_organizer(event_id));
