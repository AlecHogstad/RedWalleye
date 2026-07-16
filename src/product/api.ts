// Data layer for the product surface. Thin wrappers over the product Supabase
// client that return typed rows (src/product/types.ts). RLS does the authz —
// these functions just shape the calls. Every write that lands a row the
// organizer owns sets organizer_id = the signed-in uid so the events_insert
// policy (organizer_id = auth.uid()) passes.

import { getProductClient, productUrl, productAnonKey } from "./supabase";
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

  // Use the SESSION (not just getUser) so we can see the exact token that will
  // be sent on the write — auth.uid() at the DB is read from this token's `sub`.
  const { data: sess } = await client.auth.getSession();
  const session = sess.session;
  const uid = session?.user?.id;
  const claims = decodeJwt(session?.access_token);
  const nowSec = Math.floor(Date.now() / 1000);
  const expired = claims?.exp ? claims.exp < nowSec : undefined;
  const configuredUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
  // eslint-disable-next-line no-console
  console.log("[createEvent] auth debug", {
    hasSession: Boolean(session),
    hasToken: Boolean(session?.access_token),
    uid,
    tokenRole: claims?.role,
    tokenSub: claims?.sub,
    subMatchesUid: claims?.sub === uid,
    tokenIss: claims?.iss,
    tokenExp: claims?.exp,
    expired,
    configuredUrl,
  });
  if (!session || !uid) {
    throw new Error(
      "You're not signed in to the database (no active session). Sign out and sign back in, then try again.",
    );
  }

  const name = input.name.trim();
  if (!name) throw new Error("Event name is required.");

  const token = session.access_token;

  // Insert via a hand-built request so the session token is ATTACHED EXPLICITLY
  // and can't be stripped by a sibling Supabase client. Decisive test: if this
  // succeeds where the supabase-js client insert 403s, the client's header was
  // being clobbered. (Temporary raw path while we stabilize product auth.)
  const MAX_ATTEMPTS = 5;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const resp = await fetch(`${productUrl}/rest/v1/events`, {
      method: "POST",
      headers: {
        apikey: productAnonKey,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        organizer_id: uid,
        name,
        starts_on: input.startsOn ?? null,
        ends_on: input.endsOn ?? null,
        join_code: randomJoinCode(),
      }),
    });

    const bodyText = await resp.text();
    // eslint-disable-next-line no-console
    console.log("[createEvent] explicit insert", resp.status, bodyText);

    if (resp.ok) {
      const rows = bodyText ? JSON.parse(bodyText) : [];
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (row) return row as EventRow;
      throw new Error("Event created but no row returned.");
    }

    // 23505 = unique_violation on join_code → retry with a fresh code.
    if (resp.status === 409 && /23505/.test(bodyText) && attempt < MAX_ATTEMPTS - 1) continue;

    // Anything else is terminal. Surface the auth facts for diagnosis.
    throw new Error(
      `Insert failed (HTTP ${resp.status}). ${bodyText} — debug: role=${
        claims?.role ?? "?"
      } sub=${claims?.sub ? String(claims.sub).slice(0, 8) : "none"} uid=${uid.slice(
        0,
        8,
      )} match=${claims?.sub === uid} expired=${expired}`,
    );
  }
  throw new Error("Could not generate a unique join code. Please try again.");
}

/** Decode a JWT payload (no verification — display only). Returns null on any
 *  malformed input. Temporary aid for the RLS/auth diagnostic above. */
function decodeJwt(
  token?: string,
): { role?: string; sub?: string; exp?: number; iss?: string } | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
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
