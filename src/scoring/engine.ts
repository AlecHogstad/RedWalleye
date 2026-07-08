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
//    so instead each TEAM gets a scramble handicap; teams play their own ball
//    and compare net totals against the whole field (stroke play), strokes
//    given off the field's low team handicap so lopsided teams stay fair.
// ---------------------------------------------------------------------------

import type {
  CourseDef,
  Format,
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

/**
 * Formats where every team tees off on its own (one entry per team, sideB
 * empty) and is scored against the whole field, not head-to-head:
 *  - fourman: best net ball of the foursome
 *  - scramble: the single team scramble ball
 */
export function isStrokePlay(format: Format): boolean {
  return format === "fourman" || format === "scramble";
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
 * Compute how many match strokes each scoring entity receives.
 *  - Four-ball works off the lowest course handicap in the match.
 *  - Scramble (team stroke play, teams tee off alone) works off the lowest
 *    team scramble handicap in the WHOLE FIELD so team totals are comparable.
 *  - 4-man (team stroke play, teams tee off alone) works off the lowest
 *    course handicap in the WHOLE FIELD so team totals are comparable.
 */
export function allocateStrokes(
  match: Match,
  players: Player[],
  ctx: ScoringContext,
): StrokeAllocation {
  const byPlayer: Record<string, number> = {};
  const byTeam: Record<string, number> = {};

  if (match.format === "scramble") {
    // Field-wide team stroke play: every team plays its own scramble ball, so
    // strokes come off the WHOLE FIELD's low scramble handicap (like fourman)
    // to keep team nets comparable. The field's teams are reconstructed by
    // grouping every player by team — each team's roster is its scramble entry.
    const teamHandicap = (ids: string[]) =>
      scrambleTeamHandicap(
        ids
          .map((id) => players.find((p) => p.id === id))
          .filter((p): p is Player => Boolean(p))
          .map((p) => courseHandicap(p.handicap, ctx)),
      );
    const rosterByTeam = new Map<string, string[]>();
    for (const p of players) {
      if (!p.teamId) continue;
      const list = rosterByTeam.get(p.teamId) ?? [];
      list.push(p.id);
      rosterByTeam.set(p.teamId, list);
    }
    const fieldLow = rosterByTeam.size
      ? Math.min(...[...rosterByTeam.values()].map((ids) => teamHandicap(ids)))
      : 0;
    const ownHcp = scrambleTeamHandicap(
      sidePlayers(match.sideA, players).map((p) => courseHandicap(p.handicap, ctx)),
    );
    byTeam[teamScoreKey(match.sideA.teamId)] = Math.max(0, ownHcp - fieldLow);
    return { byPlayer, byTeam };
  }

  const inMatch = [...sidePlayers(match.sideA, players), ...sidePlayers(match.sideB, players)];
  const lowPool = match.format === "fourman" ? players : inMatch;
  const low = lowPool.length
    ? Math.min(...lowPool.map((p) => courseHandicap(p.handicap, ctx)))
    : 0;
  inMatch.forEach((p) => {
    byPlayer[p.id] = Math.max(0, courseHandicap(p.handicap, ctx) - low);
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
  /**
   * Stroke-play sub-result over the holes both sides have completed — the SAME
   * best-net-ball figures that decide the holes, totalled. Bragging rights
   * only (no tournament points); a side can win the match yet lose on strokes.
   */
  strokePlay: {
    netA: number;
    netB: number;
    thru: number; // holes counted (both sides scored)
    winner: "A" | "B" | "halve" | null; // lower total wins; null until any hole
  };
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
  let spNetA = 0; // stroke-play running totals over the compared holes
  let spNetB = 0;

  for (const hole of ctx.course.holes) {
    const netA = sideNetForHole(match, match.sideA, hole.number, hole.strokeIndex, alloc);
    const netB = sideNetForHole(match, match.sideB, hole.number, hole.strokeIndex, alloc);

    let winner: HoleResult["winner"] = null;
    if (netA !== null && netB !== null) {
      thru += 1;
      spNetA += netA;
      spNetB += netB;
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

  const strokePlay: MatchState["strokePlay"] = {
    netA: spNetA,
    netB: spNetB,
    thru,
    winner:
      thru === 0 ? null : spNetA < spNetB ? "A" : spNetB < spNetA ? "B" : "halve",
  };

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
    strokePlay,
  };
}

// --- Team stroke play (4-man best ball, teams tee off alone) ----------------

export interface StrokePlayHole {
  hole: number;
  par: number;
  net: number | null; // best net ball of the team, null until scored
}

export interface StrokePlayState {
  perHole: StrokePlayHole[];
  thru: number;
  netTotal: number; // sum of best nets over completed holes
  toPar: number; // netTotal - par of completed holes
  toParText: string; // "E", "+3", "-2"
  complete: boolean;
}

/**
 * Team stroke play for one team entry (sideA; sideB is empty). For fourman the
 * team score on a hole is its best net ball; for a scramble it's the single
 * team scramble ball, netted with the team's field-relative scramble strokes.
 */
export function computeStrokePlay(
  match: Match,
  players: Player[],
  ctx: ScoringContext,
): StrokePlayState {
  const alloc = allocateStrokes(match, players, ctx);
  const isScramble = match.format === "scramble";
  const teamKey = teamScoreKey(match.sideA.teamId);
  const teamStrokes = alloc.byTeam[teamKey] ?? 0;
  let thru = 0;
  let netTotal = 0;
  let parTotal = 0;

  const perHole: StrokePlayHole[] = ctx.course.holes.map((h) => {
    let best: number | null = null;
    if (isScramble) {
      const gross = match.scores[teamKey]?.[h.number];
      if (gross != null) best = gross - strokesOnHole(teamStrokes, h.strokeIndex);
    } else {
      for (const playerId of match.sideA.playerIds) {
        const gross = match.scores[playerId]?.[h.number];
        if (gross == null) continue;
        const net = gross - strokesOnHole(alloc.byPlayer[playerId] ?? 0, h.strokeIndex);
        if (best === null || net < best) best = net;
      }
    }
    if (best !== null) {
      thru += 1;
      netTotal += best;
      parTotal += h.par;
    }
    return { hole: h.number, par: h.par, net: best };
  });

  const toPar = netTotal - parTotal;
  return {
    perHole,
    thru,
    netTotal,
    toPar,
    toParText: toPar === 0 ? "E" : toPar > 0 ? `+${toPar}` : `${toPar}`,
    complete: thru === ctx.course.holes.length && thru > 0,
  };
}

// --- Individual round totals (player leaderboard) ---------------------------

export interface RoundTotals {
  gross: number;
  net: number;
  thru: number;
}

/**
 * A player's gross and net totals for one match/entry, summed over the
 * holes actually played. Net uses the player's FULL course handicap for
 * the round's tees (not the match-relative allocation); in a scramble the
 * player's score is their team's scramble score, netted with the team
 * scramble handicap.
 */
export function computePlayerTotals(
  match: Match,
  playerId: string,
  players: Player[],
  ctx: ScoringContext,
): RoundTotals | null {
  const player = players.find((p) => p.id === playerId);
  if (!player) return null;

  const onA = match.sideA.playerIds.includes(playerId);
  const onB = match.sideB.playerIds.includes(playerId);
  if (!onA && !onB) return null;

  let key = playerId;
  let hcp: number;
  if (match.format === "scramble") {
    const side = onA ? match.sideA : match.sideB;
    key = teamScoreKey(side.teamId);
    hcp = scrambleTeamHandicap(
      sidePlayers(side, players).map((p) => courseHandicap(p.handicap, ctx)),
    );
  } else {
    hcp = courseHandicap(player.handicap, ctx);
  }

  let gross = 0;
  let net = 0;
  let thru = 0;
  for (const h of ctx.course.holes) {
    const g = match.scores[key]?.[h.number];
    if (g == null) continue;
    thru += 1;
    gross += g;
    net += g - strokesOnHole(hcp, h.strokeIndex);
  }
  return thru > 0 ? { gross, net, thru } : null;
}

// --- Stableford (opt-in side game) ------------------------------------------

/**
 * Standard net Stableford points for a hole, from net-minus-par:
 * albatross+ (≤ -3) = 5, eagle (-2) = 4, birdie (-1) = 3, par (0) = 2,
 * bogey (+1) = 1, double bogey or worse = 0.
 */
export function stablefordPoints(netToPar: number): number {
  if (netToPar <= -3) return 5;
  if (netToPar === -2) return 4;
  if (netToPar === -1) return 3;
  if (netToPar === 0) return 2;
  if (netToPar === 1) return 1;
  return 0;
}

export interface StablefordRow {
  playerId: string;
  points: number;
  thru: number;
}

/**
 * Per-player net Stableford standings for a match, highest points first.
 * Only meaningful where players hole their own ball (four-ball, four-man);
 * a scramble has one team score, so this returns an empty list for it.
 */
export function computeStableford(
  match: Match,
  players: Player[],
  ctx: ScoringContext,
): StablefordRow[] {
  if (match.format === "scramble") return [];

  const ids = [...match.sideA.playerIds, ...match.sideB.playerIds];
  const rows: StablefordRow[] = [];
  for (const id of ids) {
    const player = players.find((p) => p.id === id);
    if (!player) continue;
    const hcp = courseHandicap(player.handicap, ctx);
    let points = 0;
    let thru = 0;
    for (const h of ctx.course.holes) {
      const g = match.scores[id]?.[h.number];
      if (g == null) continue;
      thru += 1;
      const net = g - strokesOnHole(hcp, h.strokeIndex);
      points += stablefordPoints(net - h.par);
    }
    rows.push({ playerId: id, points, thru });
  }
  return rows.sort((a, b) => b.points - a.points);
}

export interface TeamStanding {
  teamId: string;
  points: number;
  matchesPlayed: number;
  matchesComplete: number;
}

/** Points a stroke-play round puts on the table, awarded once every team in
 *  the round has finished all 18:
 *   - fourman: 2 to the low-net team, split on ties (winner-take-all).
 *   - scramble: placement points 3 / 1 / 0 / 0 by finish; teams tied at a
 *     score pool the points for the positions they occupy and split them. */
function awardStrokePlayPoints(
  states: { teamId: string; toPar: number }[],
  format: Format,
  add: (teamId: string, pts: number) => void,
): void {
  if (format === "scramble") {
    const placement = [3, 1, 0, 0];
    const sorted = [...states].sort((a, b) => a.toPar - b.toPar);
    let i = 0;
    while (i < sorted.length) {
      let j = i;
      while (j < sorted.length && sorted[j].toPar === sorted[i].toPar) j += 1;
      const pool = placement.slice(i, j).reduce((s, p) => s + (p ?? 0), 0);
      const share = pool / (j - i);
      for (let k = i; k < j; k += 1) add(sorted[k].teamId, share);
      i = j;
    }
    return;
  }
  // fourman: 2 to the low team, split on ties.
  const best = Math.min(...states.map((s) => s.toPar));
  const winners = states.filter((s) => s.toPar === best);
  for (const w of winners) add(w.teamId, 2 / winners.length);
}

/** Roll everything up into team points for the tournament leaderboard.
 *  Match-play formats (four-ball) award 1 per win / ½ per halve. Stroke-play
 *  rounds (scramble, fourman) award their prize once every team in the round
 *  has finished all 18 — see `awardStrokePlayPoints`. */
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

  const strokePlayByRound = new Map<string, Match[]>();

  for (const match of matches) {
    const ctx = ctxByRound[match.roundId];
    if (!ctx) continue;

    if (isStrokePlay(match.format)) {
      const list = strokePlayByRound.get(match.roundId) ?? [];
      list.push(match);
      strokePlayByRound.set(match.roundId, list);
      continue;
    }

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

  for (const [roundId, entries] of strokePlayByRound) {
    const ctx = ctxByRound[roundId];
    const states = entries.map((e) => ({
      teamId: e.sideA.teamId,
      st: computeStrokePlay(e, players, ctx),
    }));
    for (const { teamId, st } of states) {
      const row = ensure(teamId);
      if (st.thru > 0) row.matchesPlayed += 1;
      if (st.complete) row.matchesComplete += 1;
    }
    if (states.length > 0 && states.every(({ st }) => st.complete)) {
      awardStrokePlayPoints(
        states.map(({ teamId, st }) => ({ teamId, toPar: st.toPar })),
        entries[0].format,
        (teamId, pts) => {
          ensure(teamId).points += pts;
        },
      );
    }
  }

  return [...table.values()].sort((x, y) => y.points - x.points);
}
