// Data layer for the product surface. Thin wrappers over the product Supabase
// client that return typed rows (src/product/types.ts). RLS does the authz —
// these functions just shape the calls. Every write that lands a row the
// organizer owns sets organizer_id = the signed-in uid so the events_insert
// policy (organizer_id = auth.uid()) passes.

import { getProductClient } from "./supabase";
import type { Course, EventRow, Game, Round } from "./types";

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

  const MAX_ATTEMPTS = 5;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const { data, error } = await client
      .from("events")
      .insert({
        organizer_id: uid,
        name,
        join_code: randomJoinCode(),
      })
      .select()
      .single();

    if (!error && data) return data as EventRow;

    // 23505 = unique_violation. Only join_code is unique here, so retry with a
    // fresh code. Anything else is a real failure — surface it.
    if (error && error.code === "23505" && attempt < MAX_ATTEMPTS - 1) continue;
    if (error) throw new Error(error.message);
  }
  throw new Error("Could not generate a unique join code. Please try again.");
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

/** Delete a round (its games row cascades). Draft-stage editing only — the
 *  dashboard hides this once the round is underway. */
export async function deleteRound(roundId: string): Promise<void> {
  const client = getProductClient();
  if (!client) throw new Error("Supabase project not configured.");
  const { error } = await client.from("rounds").delete().eq("id", roundId);
  if (error) throw new Error(error.message);
}
