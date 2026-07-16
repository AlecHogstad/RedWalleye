// Data layer for the product surface. Thin wrappers over the product Supabase
// client that return typed rows (src/product/types.ts). RLS does the authz —
// these functions just shape the calls. Every write that lands a row the
// organizer owns sets organizer_id = the signed-in uid so the events_insert
// policy (organizer_id = auth.uid()) passes.

import { getProductClient } from "./supabase";
import type { EventRow } from "./types";

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
  startsOn?: string | null; // ISO date (yyyy-mm-dd) or null
  endsOn?: string | null;
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
        starts_on: input.startsOn ?? null,
        ends_on: input.endsOn ?? null,
        join_code: randomJoinCode(),
      })
      .select()
      .single();

    if (!error && data) return data as EventRow;

    // 23505 = unique_violation. Only the join_code is unique here, so retry
    // with a fresh code. Anything else is a real failure — surface it.
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
