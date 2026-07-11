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
  computeBestBallContributions,
  contextForRound,
  type ScoringContext,
} from "../src/scoring/engine";
import type { Match, Side, TournamentState } from "../src/types";

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

function run(state: TournamentState): void {
  const ctxByRound: Record<string, ScoringContext> = {};
  for (const r of state.rounds) ctxByRound[r.id] = contextForRound(state, r.id);

  const rows = computeBestBallContributions(state.matches, state.players, ctxByRound);
  if (rows.length === 0) {
    console.log("No four-ball scores found yet — nothing to rank.");
    return;
  }

  const name = (id: string) => state.players.find((p) => p.id === id)?.name ?? id;
  console.log("\nBest Ball (four-ball) — gross point contribution, least valuable first\n");
  console.log("  #  player          team   points   carried");
  console.log("  -- --------------- ----   ------   -------");
  rows.forEach((r, i) => {
    console.log(
      `  ${String(i + 1).padStart(2)} ${name(r.playerId).padEnd(15)} ${r.teamId.padEnd(4)}   ` +
        `${r.points.toFixed(2).padStart(6)}   ${`${r.countingHoles}/${r.holes}`.padStart(7)}`,
    );
  });
  const min = rows[0];
  console.log(`\n→ Least valuable by point contribution: ${name(min.playerId)} (${min.points.toFixed(2)} pts).`);
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
