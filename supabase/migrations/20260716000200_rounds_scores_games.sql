-- ===========================================================================
-- O-90 — Scoring substrate: courses, tees, rounds, round_players, scores, games
--
-- Second slice of the multi-tenant schema (builds on the tenant core). Adds the
-- global crowdsourced course library and the per-round scoring tables. Every
-- table ships default-deny RLS in this migration (Hard Rule 2).
--
-- Load-bearing decision (O-90): `rounds.event_id` is NULLABLE. A solo round is
-- a round with no event — one schema, one score path for both modes. Ownership
-- of a solo round comes from its `created_by` + its `round_players.user_id`.
--
-- Course library is GLOBAL (no tenant): read by any authenticated user, and any
-- authenticated user may add/correct entries — the compounding asset. Events
-- are tenant-scoped via the event helpers from the tenant-core migration.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Global course library (no tenant scope)
-- ---------------------------------------------------------------------------
create table public.courses (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  location   text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.tees (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references public.courses (id) on delete cascade,
  name       text not null,
  rating     numeric,
  slope      integer,
  par        integer,
  -- per-hole [{hole,par,si,yards}] — shape validated in the app / O-96.
  hole_data  jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index tees_course_id_idx on public.tees (course_id);

-- ---------------------------------------------------------------------------
-- Rounds — event round OR solo round (event_id null). One format per round
-- lives in `games`; the round just fixes course + tee + date.
-- ---------------------------------------------------------------------------
create table public.rounds (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid references public.events (id) on delete cascade,   -- NULL = solo
  course_id  uuid references public.courses (id) on delete set null,
  tee_id     uuid references public.tees (id) on delete set null,
  round_date date,
  status     text not null default 'pending'
               check (status in ('pending', 'active', 'final')),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index rounds_event_id_idx  on public.rounds (event_id);
create index rounds_created_by_idx on public.rounds (created_by);

-- ---------------------------------------------------------------------------
-- round_players — who is in a round. Exactly one of event_player_id (event
-- round) / user_id (solo round).
-- ---------------------------------------------------------------------------
create table public.round_players (
  id              uuid primary key default gen_random_uuid(),
  round_id        uuid not null references public.rounds (id) on delete cascade,
  event_player_id uuid references public.event_players (id) on delete cascade,
  user_id         uuid references auth.users (id) on delete cascade,
  created_at      timestamptz not null default now(),
  check (num_nonnulls(event_player_id, user_id) = 1),
  unique (round_id, event_player_id),
  unique (round_id, user_id)
);
create index round_players_round_id_idx on public.round_players (round_id);
create index round_players_user_id_idx  on public.round_players (user_id);

-- ---------------------------------------------------------------------------
-- scores — one row per player per hole. Players write only their own; the
-- organizer may fill gaps / correct (audit via updated_by).
-- ---------------------------------------------------------------------------
create table public.scores (
  id              uuid primary key default gen_random_uuid(),
  round_id        uuid not null references public.rounds (id) on delete cascade,
  round_player_id uuid not null references public.round_players (id) on delete cascade,
  hole_number     smallint not null check (hole_number between 1 and 18),
  strokes         smallint,
  pickup_flag     boolean not null default false,
  updated_by      uuid references auth.users (id) on delete set null,
  updated_at      timestamptz not null default now(),
  unique (round_player_id, hole_number)
);
create index scores_round_id_idx on public.scores (round_id);

-- ---------------------------------------------------------------------------
-- games — house rules locked at event creation. config_json is the engine's
-- HouseRules blob (format + rules + side games).
-- ---------------------------------------------------------------------------
create table public.games (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  round_id    uuid references public.rounds (id) on delete cascade,  -- null = event-wide
  type        text not null,
  config_json jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index games_event_id_idx on public.games (event_id);

-- ---------------------------------------------------------------------------
-- RLS helpers for round-scoped access (SECURITY DEFINER → no recursion).
-- ---------------------------------------------------------------------------
create or replace function public.can_read_round(r uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.rounds ro where ro.id = r and (
      (ro.event_id is not null and (is_event_organizer(ro.event_id) or is_event_member(ro.event_id)))
      or ro.created_by = auth.uid()
      or exists (select 1 from public.round_players rp where rp.round_id = r and rp.user_id = auth.uid())
      or exists (
        select 1 from public.round_players rp
        join public.event_players ep on ep.id = rp.event_player_id
        where rp.round_id = r and ep.claimed_by = auth.uid()
      )
    )
  );
$$;

-- Organizer of the round's event, or the owner of a solo round.
create or replace function public.can_manage_round(r uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.rounds ro where ro.id = r and (
      (ro.event_id is not null and is_event_organizer(ro.event_id))
      or (ro.event_id is null and ro.created_by = auth.uid())
    )
  );
$$;

-- The caller owns this round_player (solo user, or a claimed event slot).
create or replace function public.owns_round_player(rp uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.round_players r
    left join public.event_players ep on ep.id = r.event_player_id
    where r.id = rp and (r.user_id = auth.uid() or ep.claimed_by = auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS: courses / tees — global library (read all; any authenticated user
-- contributes; edits/removals by the creator).
-- ---------------------------------------------------------------------------
alter table public.courses enable row level security;
create policy courses_select on public.courses for select using (true);
create policy courses_insert on public.courses for insert with check (created_by = auth.uid());
create policy courses_update on public.courses for update using (created_by = auth.uid());
create policy courses_delete on public.courses for delete using (created_by = auth.uid());

alter table public.tees enable row level security;
create policy tees_select on public.tees for select using (true);
create policy tees_insert on public.tees for insert with check (created_by = auth.uid());
create policy tees_update on public.tees for update using (created_by = auth.uid());
create policy tees_delete on public.tees for delete using (created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- RLS: rounds / round_players / scores / games
-- ---------------------------------------------------------------------------
alter table public.rounds enable row level security;
create policy rounds_select on public.rounds
  for select using (
    (event_id is not null and (is_event_organizer(event_id) or is_event_member(event_id)))
    or created_by = auth.uid()
  );
create policy rounds_insert on public.rounds
  for insert with check (
    (event_id is not null and is_event_organizer(event_id))
    or (event_id is null and created_by = auth.uid())
  );
create policy rounds_update on public.rounds
  for update using (can_manage_round(id)) with check (can_manage_round(id));
create policy rounds_delete on public.rounds
  for delete using (can_manage_round(id));

alter table public.round_players enable row level security;
create policy round_players_select on public.round_players
  for select using (can_read_round(round_id));
create policy round_players_write on public.round_players
  for all using (can_manage_round(round_id)) with check (can_manage_round(round_id));

alter table public.scores enable row level security;
create policy scores_select on public.scores
  for select using (can_read_round(round_id));
-- Players write only their own scores; organizer/solo-owner may write any in
-- the round (fill gaps, corrections).
create policy scores_insert on public.scores
  for insert with check (can_manage_round(round_id) or owns_round_player(round_player_id));
create policy scores_update on public.scores
  for update using (can_manage_round(round_id) or owns_round_player(round_player_id))
  with check (can_manage_round(round_id) or owns_round_player(round_player_id));
create policy scores_delete on public.scores
  for delete using (can_manage_round(round_id));

alter table public.games enable row level security;
create policy games_select on public.games
  for select using (is_event_organizer(event_id) or is_event_member(event_id));
create policy games_write on public.games
  for all using (is_event_organizer(event_id)) with check (is_event_organizer(event_id));
