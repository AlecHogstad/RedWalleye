// ---------------------------------------------------------------------------
// Scoring engine — pure functions, no React, fully unit-tested.
//
// This is where the "different handicaps" problem actually gets solved:
//  - Course handicaps come from the round's tees via the USGA formula
//    (handicap index × slope/113 + rating − par), so long tees give more
//    strokes than short ones.
//  - Best-ball formats give each player strokes off the LOW player in the
//    match, allocated hole-by-hole using each hole's stroke index.
//  - Scramble can't give individual strokes (you only make one team score),
//    so instead each TEAM gets a scramble handicap and the higher team is
//    handed the difference as match strokes. This keeps lopsided teams fair.
// ---------------------------------------------------------------------------

import type {
  CourseDef,
  Match,
  Player,
  Side,
  TeeSet,
  TournamentState,
} from "../types";

/** The course + tees a round is being played from. Tee optional until a
 *  round is started (falls back to plain rounded handicap index). */
export interface ScoringContext {
  course: CourseDef;
  tee?: TeeSet;
}

/** Resolve the scoring context for a round from tournament state. Rounds
 *  that haven't been started score against the first course with no tee
 *  adjustment, so nothing crashes before a round begins. */
export function contextForRound(
  state: TournamentState,
  roundId: string,
): ScoringContext {
  const round = state.rounds.find((r) => r.id === roundId);
  const course =
    state.courses.find((c) => c.id === round?.courseId) ?? state.courses[0];
  const tee = round?.teeName
    ? course.tees.find((t) => t.name === round.teeName)
    : undefined;
  return { course, tee };
}

/** Key used to store a scramble team's single score. */
export function teamScoreKey(teamId: string): string {
  return `team:${teamId}`;
}

export function coursePar(course: CourseDef): number {
  return course.holes.reduce((s, h) => s + h.par, 0);
}

/**
 * How many strokes a hole with the given stroke index receives when `total`
 * strokes are spread across 18 holes. Handles totals over 18 (a second
 * stroke rolls onto the hardest holes).
 */
export function strokesOnHole(total: number, strokeIndex: number): number {
  if (total <= 0) return 0;
  const base = Math.floor(total / 18);
  const remainder = total % 18;
  return base + (strokeIndex <= remainder ? 1 : 0);
}

/**
 * Course handicap for a player. With a tee selected this is the USGA
 * formula: index × (slope ÷ 113) + (rating − par), rounded. Without a tee
 * (round not started yet) it falls back to the rounded handicap index.
 */
export function courseHandicap(handicapIndex: number, ctx?: ScoringContext): number {
  if (ctx?.tee) {
    const par = coursePar(ctx.course);
    return Math.round(
      handicapIndex * (ctx.tee.slope / 113) + (ctx.tee.rating - par),
    );
  }
  return Math.round(handicapIndex);
}

/**
 * Scramble team handicap allowance, computed from COURSE handicaps.
 *  - 2 players: 35% of low + 15% of high
 *  - 3 players: 30 / 20 / 10
 *  - 4 players: 25 / 20 / 15 / 10
 * Falls back to a simple average for other counts. Result is rounded.
 */
export function scrambleTeamHandicap(courseHandicaps: number[]): number {
  const sorted = [...courseHandicaps].sort((a, b) => a - b); // low to high
  const weightsByCount: Record<number, number[]> = {
    1: [1],
    2: [0.35, 0.15],
    3: [0.3, 0.2, 0.1],
    4: [0.25, 0.2, 0.15, 0.1],
  };
  const weights = weightsByCount[sorted.length];
  if (!weights) {
    const avg = sorted.reduce((s, h) => s + h, 0) / sorted.length;
    return Math.round(avg);
  }
  const total = sorted.reduce((sum, h, i) => sum + h * weights[i], 0);
  return Math.round(total);
}

export interface StrokeAllocation {
  /** For best-ball: match strokes per playerId. */
  byPlayer: Record<string, number>;
  /** For scramble: match strokes per synthetic team key. */
  byTeam: Record<string, number>;
}

function sidePlayers(side: Side, players: Player[]): Player[] {
  return side.playerIds
    .map((id) => players.find((p) => p.id === id))
    .filter((p): p is Player => Boolean(p));
}

/**
 * Compute how many match strokes each scoring entity receives. Best-ball
 * formats work off the lowest course handicap in the match; scramble works
 * off the lower team handicap.
 */
export function allocateStrokes(
  match: Match,
  players: Player[],
  ctx: ScoringContext,
): StrokeAllocation {
  const byPlayer: Record<string, number> = {};
  const byTeam: Record<string, number> = {};

  if (match.format === "scramble") {
    const chs = (side: Side) =>
      sidePlayers(side, players).map((p) => courseHandicap(p.handicap, ctx));
    const hcpA = scrambleTeamHandicap(chs(match.sideA));
    const hcpB = scrambleTeamHandicap(chs(match.sideB));
    const low = Math.min(hcpA, hcpB);
    byTeam[teamScoreKey(match.sideA.teamId)] = Math.max(0, hcpA - low);
    byTeam[teamScoreKey(match.sideB.teamId)] = Math.max(0, hcpB - low);
    return { byPlayer, byTeam };
  }

  const everyone = [...sidePlayers(match.sideA, players), ...sidePlayers(match.sideB, players)];
  const chs = everyone.map((p) => courseHandicap(p.handicap, ctx));
  const low = chs.length ? Math.min(...chs) : 0;
  everyone.forEach((p, i) => {
    byPlayer[p.id] = Math.max(0, chs[i] - low);
  });
  return { byPlayer, byTeam };
}

export interface HoleResult {
  hole: number;
  netA: number | null;
  netB: number | null;
  winner: "A" | "B" | "halve" | null;
}

export interface MatchState {
  perHole: HoleResult[];
  thru: number; // holes both sides have completed
  leader: "A" | "B" | null;
  margin: number; // holes the leader is up (>= 0)
  holesRemaining: number;
  decided: boolean; // closed out early
  complete: boolean; // decided or all 18 scored
  resultText: string; // "3&2", "AS thru 7", "2 UP", "Halved"
  points: { a: number; b: number }; // tournament points once complete
}

/** Net score for one side on a single hole (best net, or team net for scramble). */
function sideNetForHole(
  match: Match,
  side: Side,
  holeNumber: number,
  strokeIndex: number,
  alloc: StrokeAllocation,
): number | null {
  if (match.format === "scramble") {
    const key = teamScoreKey(side.teamId);
    const gross = match.scores[key]?.[holeNumber];
    if (gross == null) return null;
    return gross - strokesOnHole(alloc.byTeam[key] ?? 0, strokeIndex);
  }

  let best: number | null = null;
  for (const playerId of side.playerIds) {
    const gross = match.scores[playerId]?.[holeNumber];
    if (gross == null) continue;
    const net = gross - strokesOnHole(alloc.byPlayer[playerId] ?? 0, strokeIndex);
    if (best === null || net < best) best = net;
  }
  return best;
}

/**
 * Compute the full match-play state (running status + result).
 */
export function computeMatchState(
  match: Match,
  players: Player[],
  ctx: ScoringContext,
): MatchState {
  const alloc = allocateStrokes(match, players, ctx);
  const perHole: HoleResult[] = [];
  let runningMargin = 0; // + means A is up
  let thru = 0;

  for (const hole of ctx.course.holes) {
    const netA = sideNetForHole(match, match.sideA, hole.number, hole.strokeIndex, alloc);
    const netB = sideNetForHole(match, match.sideB, hole.number, hole.strokeIndex, alloc);

    let winner: HoleResult["winner"] = null;
    if (netA !== null && netB !== null) {
      thru += 1;
      if (netA < netB) {
        winner = "A";
        runningMargin += 1;
      } else if (netB < netA) {
        winner = "B";
        runningMargin -= 1;
      } else {
        winner = "halve";
      }
    }
    perHole.push({ hole: hole.number, netA, netB, winner });
  }

  const totalHoles = ctx.course.holes.length;
  const holesRemaining = totalHoles - thru;
  const margin = Math.abs(runningMargin);
  const leader: MatchState["leader"] =
    runningMargin > 0 ? "A" : runningMargin < 0 ? "B" : null;

  const decided = margin > holesRemaining && thru > 0;
  const complete = decided || (thru === totalHoles && totalHoles > 0);

  let resultText: string;
  let points = { a: 0, b: 0 };

  if (thru === 0) {
    resultText = "Not started";
  } else if (decided) {
    resultText = `${margin}&${holesRemaining}`;
    points = leader === "A" ? { a: 1, b: 0 } : { a: 0, b: 1 };
  } else if (thru === totalHoles) {
    if (margin === 0) {
      resultText = "Halved (AS)";
      points = { a: 0.5, b: 0.5 };
    } else {
      resultText = `${margin} UP`;
      points = leader === "A" ? { a: 1, b: 0 } : { a: 0, b: 1 };
    }
  } else if (margin === 0) {
    resultText = `AS thru ${thru}`;
  } else {
    // dormie (margin === holesRemaining) reads naturally with the same text
    resultText = `${margin} UP thru ${thru}`;
  }

  return {
    perHole,
    thru,
    leader,
    margin,
    holesRemaining,
    decided,
    complete,
    resultText,
    points,
  };
}

export interface TeamStanding {
  teamId: string;
  points: number;
  matchesPlayed: number;
  matchesComplete: number;
}

/** Roll all matches up into team points for the tournament leaderboard.
 *  Each match scores against its own round's course + tees. */
export function computeStandings(
  matches: Match[],
  players: Player[],
  ctxByRound: Record<string, ScoringContext>,
): TeamStanding[] {
  const table = new Map<string, TeamStanding>();
  const ensure = (teamId: string) => {
    if (!table.has(teamId)) {
      table.set(teamId, { teamId, points: 0, matchesPlayed: 0, matchesComplete: 0 });
    }
    return table.get(teamId)!;
  };

  for (const match of matches) {
    const ctx = ctxByRound[match.roundId];
    if (!ctx) continue;
    const state = computeMatchState(match, players, ctx);
    const a = ensure(match.sideA.teamId);
    const b = ensure(match.sideB.teamId);
    if (state.thru > 0) {
      a.matchesPlayed += 1;
      b.matchesPlayed += 1;
    }
    if (state.complete) {
      a.matchesComplete += 1;
      b.matchesComplete += 1;
      a.points += state.points.a;
      b.points += state.points.b;
    }
  }

  return [...table.values()].sort((x, y) => y.points - x.points);
}
