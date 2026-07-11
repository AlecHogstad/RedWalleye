// ---------------------------------------------------------------------------
// "Least valuable by point contribution" — Best Ball (four-ball) rounds only.
//
// WHY THIS EXISTS: real trip scores live only in the Supabase `rw_kv` table
// (and each phone's localStorage), never in the repo. This script pulls the
// live delta, merges it over the seed exactly like the app does, and ranks
// every golfer by how many Nassau points their ball earned their team in the
// four-ball rounds (Rounds 1 & 3) — the scramble is excluded because it has no
// per-player ball.
//
// METRIC (as requested: point contribution, NOT handicap-adjusted):
//   * Best ball is recomputed on GROSS scores — no strokes given to anyone.
//     (Done by running the tested engine with every handicap flattened to 0,
//     so the match-relative allocation is 0 for all players.)
//   * Each four-ball match is a Nassau: front 9 / back 9 / overall 18, 1 pt
//     each. Those points are the team's; we split each bet's points among the
//     side's two partners by their share of the "counting ball" — the hole's
//     lower gross (a tie splits the hole 50/50) — across that bet's stretch.
//   * A player's contribution therefore sums, across all their four-ball
//     matches, to their share of every point their side actually won. Summed
//     over both partners it equals the side's four-ball points exactly.
//
// RUN:  npx vite-node scripts/least-valuable.ts
//       npx vite-node scripts/least-valuable.ts --demo   (offline sanity check)
// ---------------------------------------------------------------------------

import { seedState } from "../src/data/seed";
import { supabaseConfig } from "../src/sync/supabaseConfig";
import {
  computeMatchState,
  contextForRound,
  type ScoringContext,
} from "../src/scoring/engine";
import type { Match, Player, Side, TournamentState } from "../src/types";

// --- Live fetch (plain REST — anon key is a public identifier) ---------------

interface KvRow {
  id: string;
  value: unknown;
}

async function fetchRows(): Promise<KvRow[]> {
  if (!supabaseConfig) throw new Error("Sync is disabled (supabaseConfig is null).");
  const url =
    `${supabaseConfig.url}/rest/v1/rw_kv` +
    `?select=id,value&id=like.${encodeURIComponent("rw|%")}`;
  const res = await fetch(url, {
    headers: {
      apikey: supabaseConfig.anonKey,
      Authorization: `Bearer ${supabaseConfig.anonKey}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return (await res.json()) as KvRow[];
}

// --- Merge the flat kv rows over the seed (the subset this metric needs) -----

function applyRows(base: TournamentState, rows: KvRow[]): TournamentState {
  const state: TournamentState = structuredClone(base);
  const holeNum = (k: string) => Number(k.replace(/^h/, ""));

  for (const { id, value } of rows) {
    if (value == null) continue;
    const [v, kind, a, b, c] = id.split("|");
    if (v !== "rw") continue;

    if (kind === "scores" && a && b && c) {
      const match = state.matches.find((m) => m.id === a);
      if (!match) continue;
      (match.scores[b] ??= {})[holeNum(c)] = value as number;
    } else if (kind === "rounds" && a) {
      const round = state.rounds.find((r) => r.id === a);
      if (!round) continue;
      const patch = value as { status?: Match["format"]; courseId?: string; teeName?: string } & {
        status?: TournamentState["rounds"][number]["status"];
      };
      if (patch.status) round.status = patch.status;
      if (patch.courseId) round.courseId = patch.courseId;
      if (patch.teeName) round.teeName = patch.teeName;
    } else if (kind === "players" && a) {
      const patch = value as { name?: string; handicap?: number; teamId?: string; deleted?: boolean };
      const existing = state.players.find((p) => p.id === a);
      if (patch.deleted) {
        state.players = state.players.filter((p) => p.id !== a);
      } else if (existing) {
        if (patch.name != null) existing.name = patch.name;
        if (patch.handicap != null) existing.handicap = patch.handicap;
        if (patch.teamId != null) existing.teamId = patch.teamId;
      } else if (patch.name != null && patch.handicap != null) {
        state.players.push({ id: a, name: patch.name, handicap: patch.handicap, teamId: patch.teamId ?? "" });
      }
    } else if (kind === "matches" && a) {
      const match = state.matches.find((m) => m.id === a);
      if (!match) continue;
      const patch = value as { sideA?: Side; sideB?: Side };
      if (patch.sideA) match.sideA = patch.sideA;
      if (patch.sideB) match.sideB = patch.sideB;
    }
  }
  return state;
}

// --- Per-player point attribution for one four-ball side ---------------------

/** Which side player belongs to, and the two partners. */
function attributeSide(
  match: Match,
  side: Side,
  segPoints: number,
  holes: number[],
  credit: Map<string, number>,
): void {
  if (segPoints <= 0) return; // lost bet — this side earned nothing to split
  const shares = new Map<string, number>();
  let totalCounting = 0;
  for (const hole of holes) {
    const scored = side.playerIds
      .map((id) => ({ id, g: match.scores[id]?.[hole] }))
      .filter((x): x is { id: string; g: number } => x.g != null);
    if (scored.length === 0) continue;
    const low = Math.min(...scored.map((x) => x.g));
    const winners = scored.filter((x) => x.g === low);
    for (const w of winners) {
      shares.set(w.id, (shares.get(w.id) ?? 0) + 1 / winners.length);
      totalCounting += 1 / winners.length;
    }
  }
  if (totalCounting === 0) return;
  for (const [id, s] of shares) {
    credit.set(id, (credit.get(id) ?? 0) + (segPoints * s) / totalCounting);
  }
}

const FRONT = Array.from({ length: 9 }, (_, i) => i + 1);
const BACK = Array.from({ length: 9 }, (_, i) => i + 10);
const OVERALL = Array.from({ length: 18 }, (_, i) => i + 1);

function run(state: TournamentState): void {
  // Gross best ball: flatten handicaps so the engine gives everyone 0 strokes.
  const grossPlayers: Player[] = state.players.map((p) => ({ ...p, handicap: 0 }));
  const ctxByRound: Record<string, ScoringContext> = {};
  for (const r of state.rounds) ctxByRound[r.id] = contextForRound(state, r.id);

  const credit = new Map<string, number>(); // playerId -> gross best-ball points earned
  const holesPlayed = new Map<string, number>(); // playerId -> four-ball holes with a score
  let anyData = false;

  for (const match of state.matches) {
    if (match.format !== "fourball") continue;
    const ctx = ctxByRound[match.roundId];
    const st = computeMatchState(match, grossPlayers, ctx);
    if (st.thru === 0) continue;
    anyData = true;

    attributeSide(match, match.sideA, st.front.points.a, FRONT, credit);
    attributeSide(match, match.sideB, st.front.points.b, FRONT, credit);
    attributeSide(match, match.sideA, st.back.points.a, BACK, credit);
    attributeSide(match, match.sideB, st.back.points.b, BACK, credit);
    attributeSide(match, match.sideA, st.overall.points.a, OVERALL, credit);
    attributeSide(match, match.sideB, st.overall.points.b, OVERALL, credit);

    for (const id of [...match.sideA.playerIds, ...match.sideB.playerIds]) {
      for (const h of OVERALL) if (match.scores[id]?.[h] != null) {
        holesPlayed.set(id, (holesPlayed.get(id) ?? 0) + 1);
      }
    }
  }

  if (!anyData) {
    console.log("No four-ball scores found yet — nothing to rank.");
    return;
  }

  const name = (id: string) => state.players.find((p) => p.id === id)?.name ?? id;
  const team = (id: string) => state.players.find((p) => p.id === id)?.teamId ?? "?";
  const rows = [...holesPlayed.keys()]
    .map((id) => ({ id, name: name(id), team: team(id), pts: credit.get(id) ?? 0, thru: holesPlayed.get(id) ?? 0 }))
    .sort((a, b) => a.pts - b.pts);

  console.log("\nBest Ball (four-ball) — gross point contribution, least valuable first\n");
  console.log("  #  player          team   points   holes");
  console.log("  -- --------------- ----   ------   -----");
  rows.forEach((r, i) => {
    console.log(
      `  ${String(i + 1).padStart(2)} ${r.name.padEnd(15)} ${r.team.padEnd(4)}   ${r.pts.toFixed(2).padStart(6)}   ${String(r.thru).padStart(5)}`,
    );
  });
  const min = rows[0];
  console.log(`\n→ Least valuable by point contribution: ${min.name} (${min.pts.toFixed(2)} pts).`);
}

// --- Demo dataset (offline math check) ---------------------------------------

function demoRows(): KvRow[] {
  // r1m1: hunter+frank (A) vs nated+mike (B) at Big Fish. Make hunter carry
  // every counting hole for A and A sweep all three bets, so hunter should get
  // ~all of A's 3 points and frank ~0.
  const rows: KvRow[] = [
    { id: "rw|rounds|r1", value: { status: "final", courseId: "bigfish", teeName: "Tournament" } },
  ];
  for (let h = 1; h <= 18; h++) {
    rows.push({ id: `rw|scores|r1m1|hunter|h${h}`, value: 4 }); // low ball every hole
    rows.push({ id: `rw|scores|r1m1|frank|h${h}`, value: 7 });
    rows.push({ id: `rw|scores|r1m1|nated|h${h}`, value: 6 }); // B loses every hole
    rows.push({ id: `rw|scores|r1m1|mike|h${h}`, value: 6 });
  }
  return rows;
}

async function main(): Promise<void> {
  const demo = process.argv.includes("--demo");
  const rows = demo ? demoRows() : await fetchRows();
  console.log(demo ? "(demo dataset)" : `Fetched ${rows.length} live row(s).`);
  run(applyRows(seedState(), rows));
}

main().catch((e) => {
  console.error("\nCould not compute:", e.message);
  console.error(
    "\nIf this is a network/egress error, run it from a machine that can reach\n" +
      "supabase.co (your laptop). The metric itself is offline — try --demo.",
  );
  process.exit(1);
});
