// Data layer for the product surface. Thin wrappers over the product Supabase
// client that return typed rows (src/product/types.ts). RLS does the authz —
// these functions just shape the calls. Every write that lands a row the
// organizer owns sets organizer_id = the signed-in uid so the events_insert
// policy (organizer_id = auth.uid()) passes.

import { getProductClient } from "./supabase";
import type { Course, EventPlayer, EventRow, Game, Round, Team } from "./types";

/** Human-friendly join codes: no 0/O/1/I ambiguity, uppercase, 6 chars. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomJoinCode(len = 6): string {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  let out = "";
  for (let i = 0; i < len; i += 1) {
    out += CODE_ALPHABET[arr[i] % CODE_ALPHABET.length];
  }
  return out;
}

export interface NewEventInput {
  name: string;
  /** Planning headcount ("16 guys are coming"). Editable until the event starts. */
  expectedPlayers: number;
  /** Rounds to seed as placeholders — course & format get set on the dashboard. */
  rounds: number;
}

/**
 * Insert a draft event owned by the signed-in organizer. Generates a unique
 * join_code client-side and retries on the (rare) unique-collision so the
 * organizer never sees a raw constraint error.
 */
export async function createEvent(input: NewEventInput): Promise<EventRow> {
  const client = getProductClient();
  if (!client) throw new Error("Supabase project not configured.");

  const { data: auth } = await client.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("You must be signed in to create an event.");

  const name = input.name.trim();
  if (!name) throw new Error("Event name is required.");

  let event: EventRow | null = null;
  const MAX_ATTEMPTS = 5;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const { data, error } = await client
      .from("events")
      .insert({
        organizer_id: uid,
        name,
        expected_players: input.expectedPlayers,
        join_code: randomJoinCode(),
      })
      .select()
      .single();

    if (!error && data) {
      event = data as EventRow;
      break;
    }
    // 23505 = unique_violation. Only join_code is unique here, so retry with a
    // fresh code. Anything else is a real failure — surface it.
    if (error && error.code === "23505" && attempt < MAX_ATTEMPTS - 1) continue;
    if (error) throw new Error(error.message);
  }
  if (!event) throw new Error("Could not generate a unique join code. Please try again.");

  // Seed the requested number of rounds as placeholders (no course/format yet —
  // the dashboard's Rounds section fills those in). If this fails, drop the
  // event so a retry starts clean (rounds cascade with it).
  const count = Math.max(0, Math.floor(input.rounds));
  if (count > 0) {
    const { error: roundsErr } = await client.from("rounds").insert(
      Array.from({ length: count }, () => ({
        event_id: event!.id,
        status: "pending",
        created_by: uid,
      })),
    );
    if (roundsErr) {
      await client.from("events").delete().eq("id", event.id);
      throw new Error(roundsErr.message);
    }
  }
  return event;
}

/** Patch event details (name / headcount). Draft-stage only in the UI; RLS
 *  limits it to the organizer regardless. */
export async function updateEvent(
  id: string,
  patch: { name?: string; expectedPlayers?: number | null },
): Promise<EventRow> {
  const client = getProductClient();
  if (!client) throw new Error("Supabase project not configured.");

  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (!trimmed) throw new Error("Event name is required.");
    row.name = trimmed;
  }
  if (patch.expectedPlayers !== undefined) row.expected_players = patch.expectedPlayers;

  const { data, error } = await client.from("events").update(row).eq("id", id).select().single();
  if (error) throw new Error(error.message);
  return data as EventRow;
}

/** A single event by id. RLS returns it only to its organizer or a bound
 *  player; anyone else gets null (no row, not an error). */
export async function getEventById(id: string): Promise<EventRow | null> {
  const client = getProductClient();
  if (!client) throw new Error("Supabase project not configured.");

  const { data, error } = await client.from("events").select().eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as EventRow | null) ?? null;
}

/** The organizer's own events, newest first. RLS scopes this to events they own
 *  (plus any they've joined as a player, which the home screen filters out). */
export async function listMyEvents(): Promise<EventRow[]> {
  const client = getProductClient();
  if (!client) throw new Error("Supabase project not configured.");

  const { data: auth } = await client.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return [];

  const { data, error } = await client
    .from("events")
    .select()
    .eq("organizer_id", uid)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as EventRow[];
}

// ---------------------------------------------------------------------------
// Courses (global library) & rounds — the wizard's "Rounds & courses" step.
// ---------------------------------------------------------------------------

/** The global course library, A→Z. Readable by any signed-in user. */
export async function listCourses(): Promise<Course[]> {
  const client = getProductClient();
  if (!client) throw new Error("Supabase project not configured.");
  const { data, error } = await client.from("courses").select().order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as Course[];
}

/** Add a course to the shared library (minimal entry — name + optional
 *  location; tees/scorecard come with the full course picker, O-96). */
export async function createCourse(name: string, location?: string): Promise<Course> {
  const client = getProductClient();
  if (!client) throw new Error("Supabase project not configured.");
  const { data: auth } = await client.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("You must be signed in.");

  const trimmed = name.trim();
  if (!trimmed) throw new Error("Course name is required.");

  const { data, error } = await client
    .from("courses")
    .insert({ name: trimmed, location: location?.trim() || null, created_by: uid })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Course;
}

/** A round plus its format (the round's `games` row, when one exists). */
export interface RoundWithGame {
  round: Round;
  game: Game | null;
}

/** An event's rounds in play order (date, then creation), each with its game. */
export async function listEventRounds(eventId: string): Promise<RoundWithGame[]> {
  const client = getProductClient();
  if (!client) throw new Error("Supabase project not configured.");

  const [roundsRes, gamesRes] = await Promise.all([
    client
      .from("rounds")
      .select()
      .eq("event_id", eventId)
      .order("round_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
    client.from("games").select().eq("event_id", eventId).not("round_id", "is", null),
  ]);
  if (roundsRes.error) throw new Error(roundsRes.error.message);
  if (gamesRes.error) throw new Error(gamesRes.error.message);

  const gameByRound = new Map<string, Game>();
  for (const g of (gamesRes.data ?? []) as Game[]) {
    if (g.round_id) gameByRound.set(g.round_id, g);
  }
  return ((roundsRes.data ?? []) as Round[]).map((round) => ({
    round,
    game: gameByRound.get(round.id) ?? null,
  }));
}

export interface NewRoundInput {
  eventId: string;
  courseId: string;
  /** Format id from FORMAT_REGISTRY (one format per round). */
  format: string;
}

/** Create a round and its format row. The `games` row carries the engine's
 *  HouseRules blob; it starts as just `{ format }` and the house-rules editor
 *  (later step) patches config_json in place. */
export async function createRound(input: NewRoundInput): Promise<RoundWithGame> {
  const client = getProductClient();
  if (!client) throw new Error("Supabase project not configured.");
  const { data: auth } = await client.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("You must be signed in.");

  const { data: round, error: roundErr } = await client
    .from("rounds")
    .insert({
      event_id: input.eventId,
      course_id: input.courseId,
      status: "pending",
      created_by: uid,
    })
    .select()
    .single();
  if (roundErr) throw new Error(roundErr.message);

  const { data: game, error: gameErr } = await client
    .from("games")
    .insert({
      event_id: input.eventId,
      round_id: (round as Round).id,
      type: input.format,
      config_json: { format: input.format },
    })
    .select()
    .single();
  if (gameErr) {
    // Don't leave a format-less round behind — roll back the round row.
    await client.from("rounds").delete().eq("id", (round as Round).id);
    throw new Error(gameErr.message);
  }
  return { round: round as Round, game: game as Game };
}

/** Set (or change) an existing round's course + format — used for the
 *  placeholder rounds the wizard seeds, and for edits while the event is a
 *  draft. Upserts the round's games row. */
export async function setRoundSetup(args: {
  roundId: string;
  eventId: string;
  courseId: string;
  format: string;
}): Promise<RoundWithGame> {
  const client = getProductClient();
  if (!client) throw new Error("Supabase project not configured.");

  const { data: round, error: roundErr } = await client
    .from("rounds")
    .update({ course_id: args.courseId })
    .eq("id", args.roundId)
    .select()
    .single();
  if (roundErr) throw new Error(roundErr.message);

  const { data: existing, error: findErr } = await client
    .from("games")
    .select()
    .eq("round_id", args.roundId)
    .maybeSingle();
  if (findErr) throw new Error(findErr.message);

  if (existing) {
    const prevConfig = ((existing as Game).config_json ?? {}) as Record<string, unknown>;
    const { data: game, error } = await client
      .from("games")
      .update({ type: args.format, config_json: { ...prevConfig, format: args.format } })
      .eq("id", (existing as Game).id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { round: round as Round, game: game as Game };
  }

  const { data: game, error: insertErr } = await client
    .from("games")
    .insert({
      event_id: args.eventId,
      round_id: args.roundId,
      type: args.format,
      config_json: { format: args.format },
    })
    .select()
    .single();
  if (insertErr) throw new Error(insertErr.message);
  return { round: round as Round, game: game as Game };
}

/** Delete a round (its games row cascades). Draft-stage editing only — the
 *  dashboard hides this once the round is underway. */
export async function deleteRound(roundId: string): Promise<void> {
  const client = getProductClient();
  if (!client) throw new Error("Supabase project not configured.");
  const { error } = await client.from("rounds").delete().eq("id", roundId);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Teams & roster — two captain teams (the engine is 2-team head-to-head) and
// the event_players roster the organizer pre-fills; players mostly arrive via
// the share link (O-92) and claim these slots.
// ---------------------------------------------------------------------------

/** An event's teams in display order (0 = "Team A"). */
export async function listTeams(eventId: string): Promise<Team[]> {
  const client = getProductClient();
  if (!client) throw new Error("Supabase project not configured.");
  const { data, error } = await client
    .from("teams")
    .select()
    .eq("event_id", eventId)
    .order("ordinal");
  if (error) throw new Error(error.message);
  return (data ?? []) as Team[];
}

/** Seed the two default teams. Idempotent in effect: the unique
 *  (event_id, ordinal) constraint stops a double-seed — on conflict we just
 *  re-read whatever exists. */
export async function createDefaultTeams(eventId: string): Promise<Team[]> {
  const client = getProductClient();
  if (!client) throw new Error("Supabase project not configured.");
  const { data, error } = await client
    .from("teams")
    .insert([
      { event_id: eventId, name: "Team A", ordinal: 0 },
      { event_id: eventId, name: "Team B", ordinal: 1 },
    ])
    .select();
  if (error) {
    if (error.code === "23505") return listTeams(eventId); // raced another tab
    throw new Error(error.message);
  }
  return (data ?? []) as Team[];
}

export async function renameTeam(teamId: string, name: string): Promise<Team> {
  const client = getProductClient();
  if (!client) throw new Error("Supabase project not configured.");
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Team name is required.");
  const { data, error } = await client
    .from("teams")
    .update({ name: trimmed })
    .eq("id", teamId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Team;
}

/** The roster, active players first, in creation order. */
export async function listEventPlayers(eventId: string): Promise<EventPlayer[]> {
  const client = getProductClient();
  if (!client) throw new Error("Supabase project not configured.");
  const { data, error } = await client
    .from("event_players")
    .select()
    .eq("event_id", eventId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as EventPlayer[];
}

export async function addEventPlayer(
  eventId: string,
  name: string,
  handicap?: number | null,
): Promise<EventPlayer> {
  const client = getProductClient();
  if (!client) throw new Error("Supabase project not configured.");
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Player name is required.");
  const { data, error } = await client
    .from("event_players")
    .insert({ event_id: eventId, name: trimmed, handicap: handicap ?? null })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as EventPlayer;
}

/** Patch a roster slot (name / handicap / team assignment). */
export async function updateEventPlayer(
  id: string,
  patch: { name?: string; handicap?: number | null; teamId?: string | null },
): Promise<EventPlayer> {
  const client = getProductClient();
  if (!client) throw new Error("Supabase project not configured.");
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.handicap !== undefined) row.handicap = patch.handicap;
  if (patch.teamId !== undefined) row.team_id = patch.teamId;
  const { data, error } = await client
    .from("event_players")
    .update(row)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as EventPlayer;
}

/** Hard-delete a roster slot — the pre-score removal path (spec §8); the
 *  post-score soft-withdraw arrives with scoring. */
export async function removeEventPlayer(id: string): Promise<void> {
  const client = getProductClient();
  if (!client) throw new Error("Supabase project not configured.");
  const { error } = await client.from("event_players").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Join flow (O-92) — no-account entry via the share link. The caller gets an
// anonymous session, peeks the event by code, then claims a slot or adds
// themselves through the SECURITY DEFINER RPCs (the only path an unbound
// user has into an event).
// ---------------------------------------------------------------------------

/** Make sure the browser has SOME session — anonymous if nobody is signed in.
 *  (An organizer opening their own link keeps their real session.) */
export async function ensureSession(): Promise<void> {
  const client = getProductClient();
  if (!client) throw new Error("Supabase project not configured.");
  const { data } = await client.auth.getSession();
  if (data.session) return;
  const { error } = await client.auth.signInAnonymously();
  if (error) {
    throw new Error(
      `Could not start a guest session (${error.message}). Anonymous sign-ins must be ` +
        "enabled: Supabase → Authentication → Sign In / Providers → Anonymous.",
    );
  }
}

export interface JoinRosterEntry {
  id: string;
  name: string;
  claimed: boolean;
}

export interface JoinEventInfo {
  event: { id: string; name: string; status: string };
  players: JoinRosterEntry[];
}

/** Peek an event by join code (names + claimed flags only). Null = bad code. */
export async function getEventByCode(code: string): Promise<JoinEventInfo | null> {
  const client = getProductClient();
  if (!client) throw new Error("Supabase project not configured.");
  const { data, error } = await client.rpc("get_event_by_code", { p_code: code });
  if (error) throw new Error(error.message);
  return (data as JoinEventInfo | null) ?? null;
}

export interface JoinResult {
  player_id: string;
  event_id: string;
  /** 4-digit recovery code — lets the player rebind on another phone. */
  rejoin_pin: string;
}

/** Claim a pre-entered roster slot (PIN required only to take over an
 *  already-claimed one). */
export async function claimSlot(code: string, playerId: string, pin?: string): Promise<JoinResult> {
  const client = getProductClient();
  if (!client) throw new Error("Supabase project not configured.");
  const { data, error } = await client.rpc("claim_slot", {
    p_code: code,
    p_player_id: playerId,
    p_pin: pin ?? null,
  });
  if (error) throw new Error(error.message);
  return data as JoinResult;
}

/** Join as someone not on the pre-entered list. */
export async function addSelf(code: string, name: string, handicap?: number | null): Promise<JoinResult> {
  const client = getProductClient();
  if (!client) throw new Error("Supabase project not configured.");
  const { data, error } = await client.rpc("add_self", {
    p_code: code,
    p_name: name,
    p_handicap: handicap ?? null,
  });
  if (error) throw new Error(error.message);
  return data as JoinResult;
}
