// ---------------------------------------------------------------------------
// Scoring engine — pure functions, no React, fully unit-tested.
//
// The tournament is two drafted teams (A vs B) playing head-to-head every
// round. Every match is a NASSAU — three separate bets: the front nine
// (holes 1–9), the back nine (holes 10–18), and the overall 18. Each bet is
// won by whoever wins more holes in that stretch (a halve splits it).
//
//  - Course handicaps come from the round's tees via the USGA formula
//    (handicap index × slope/113 + rating − par).
//  - Best-ball formats (four-ball, 4-man) give each player strokes off the
//    LOW player in the match, allocated hole-by-hole by stroke index; the
//    best net ball on each hole is the side's score.
//  - Scramble is scored on the RAW team ball — one score per hole, no
//    handicap (a four-man scramble is low enough already).
//
// How many points each Nassau segment is worth depends on the format, so that
// every round totals 12 points (see NASSAU_SEGMENT_VALUE):
//    Round 1  four-ball  4 matches × (1+1+1) = 12
//    Round 2  scramble   4 groups, placement 6/4/2/0 = 12
//    Round 3  four-ball  4 matches × (1+1+1) = 12   (2-man, new pairings)
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

/** Key used to store a scramble side's single team score. */
export function teamScoreKey(teamId: string): string {
  return `team:${teamId}`;
}

/** Points each Nassau segment (front / back / match) is worth, per format, so
 *  that every four-ball round adds up to 12 with its match count. */
const NASSAU_SEGMENT_VALUE: Record<Format, number> = {
  fourball: 1, // Rounds 1 & 3: 4 matches × 3 = 12
  scramble: 2, // legacy head-to-head scramble only; field scramble uses placement
};

/** Placement points for the four scramble groups (1st–4th by gross). */
export const SCRAMBLE_PLACE_POINTS = [6, 4, 2, 0] as const;

/** Scramble foursome playing the field (one group per match, no opponent side). */
export function isScrambleFieldMatch(match: Match): boolean {
  return match.format === "scramble" && match.sideB.playerIds.length === 0;
}

export function nassauSegmentValue(format: Format): number {
  return NASSAU_SEGMENT_VALUE[format];
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
 *  - Best-ball (four-ball, 4-man) works off the lowest course handicap in the
 *    match, given hole-by-hole on the hardest holes.
 *  - Scramble is scored on the raw team ball — no strokes given.
 */
export function allocateStrokes(
  match: Match,
  players: Player[],
  ctx: ScoringContext,
): StrokeAllocation {
  const byPlayer: Record<string, number> = {};
  const byTeam: Record<string, number> = {};

  if (match.format === "scramble") {
    // Raw team ball, both sides — no handicap.
    byTeam[teamScoreKey(match.sideA.teamId)] = 0;
    byTeam[teamScoreKey(match.sideB.teamId)] = 0;
    return { byPlayer, byTeam };
  }

  const inMatch = [
    ...sidePlayers(match.sideA, players),
    ...sidePlayers(match.sideB, players),
  ];
  const low = inMatch.length
    ? Math.min(...inMatch.map((p) => courseHandicap(p.handicap, ctx)))
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

/** One Nassau bet (front 9, back 9, or the overall 18). */
export interface SegmentResult {
  thru: number; // holes decided in this stretch
  total: number; // holes in this stretch (9 or 18)
  margin: number; // holes the leader is up (>= 0)
  leader: "A" | "B" | null;
  decided: boolean; // closed out early (margin > holes remaining)
  complete: boolean; // decided or every hole in the stretch played
  winner: "A" | "B" | "halve" | null; // set once complete
  resultText: string; // "3&2", "2 UP", "AS thru 7", "Halved", "—"
  points: { a: number; b: number }; // locked once complete
}

export interface MatchState {
  perHole: HoleResult[];
  thru: number; // holes both sides have completed (overall)
  front: SegmentResult;
  back: SegmentResult;
  overall: SegmentResult;
  // Headline aliases (the overall 18 bet) for status displays:
  leader: "A" | "B" | null;
  margin: number;
  holesRemaining: number;
  decided: boolean;
  complete: boolean; // overall bet complete
  resultText: string;
  points: { a: number; b: number }; // total across front + back + overall
}

/** Net score for one side on a single hole (best net, or team ball for scramble). */
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

/** Resolve one Nassau bet from the holes in its stretch. */
function segmentResult(holes: HoleResult[], segValue: number): SegmentResult {
  let running = 0; // + means A is up
  let thru = 0;
  for (const h of holes) {
    if (h.winner == null) continue;
    thru += 1;
    if (h.winner === "A") running += 1;
    else if (h.winner === "B") running -= 1;
  }
  const total = holes.length;
  const remaining = total - thru;
  const margin = Math.abs(running);
  const leader: SegmentResult["leader"] =
    running > 0 ? "A" : running < 0 ? "B" : null;
  const decided = margin > remaining && thru > 0;
  const complete = decided || (thru === total && total > 0);

  let winner: SegmentResult["winner"] = null;
  let resultText = "—";
  let points = { a: 0, b: 0 };

  if (thru === 0) {
    resultText = "—";
  } else if (complete) {
    if (margin === 0) {
      winner = "halve";
      points = { a: segValue / 2, b: segValue / 2 };
      resultText = "Halved";
    } else {
      winner = leader;
      points = leader === "A" ? { a: segValue, b: 0 } : { a: 0, b: segValue };
      resultText = decided && remaining > 0 ? `${margin}&${remaining}` : `${margin} UP`;
    }
  } else if (margin === 0) {
    resultText = `AS thru ${thru}`;
  } else {
    resultText = `${margin} UP thru ${thru}`;
  }

  return { thru, total, margin, leader, decided, complete, winner, resultText, points };
}

export interface ScrambleGroupTotal {
  matchId: string;
  teamId: string;
  gross: number;
  thru: number;
  complete: boolean;
}

/** Gross stroke total for one scramble foursome. */
export function computeScrambleGroupTotal(
  match: Match,
  ctx: ScoringContext,
): ScrambleGroupTotal {
  const key = teamScoreKey(match.sideA.teamId);
  const byHole = match.scores[key] ?? {};
  let gross = 0;
  let thru = 0;
  for (const h of ctx.course.holes) {
    const s = byHole[h.number];
    if (s != null) {
      gross += s;
      thru += 1;
    }
  }
  return {
    matchId: match.id,
    teamId: match.sideA.teamId,
    gross,
    thru,
    complete: thru === ctx.course.holes.length,
  };
}

/**
 * Rank the four scramble groups once every foursome has 18 holes. Ties split
 * the points for the places they occupy (e.g. two tied for 2nd share 4+2).
 */
export function computeScramblePlacement(
  roundMatches: Match[],
  ctx: ScoringContext,
): Map<string, number> {
  const groups = roundMatches
    .filter(isScrambleFieldMatch)
    .map((m) => computeScrambleGroupTotal(m, ctx));
  const out = new Map<string, number>();
  for (const g of groups) out.set(g.matchId, 0);
  if (groups.length === 0) return out;
  if (!groups.every((g) => g.complete)) return out;

  const sorted = [...groups].sort((a, b) => a.gross - b.gross);
  let rank = 0;
  let i = 0;
  while (i < sorted.length) {
    const gross = sorted[i].gross;
    let j = i + 1;
    while (j < sorted.length && sorted[j].gross === gross) j += 1;
    const tied = j - i;
    let pot = 0;
    for (let k = 0; k < tied; k++) pot += SCRAMBLE_PLACE_POINTS[rank + k] ?? 0;
    const each = tied > 0 ? pot / tied : 0;
    for (let k = i; k < j; k++) out.set(sorted[k].matchId, each);
    rank += tied;
    i = j;
  }
  return out;
}

/** Placement points for one scramble group, or null until all four finish. */
export function scrambleGroupPlacementPoints(
  match: Match,
  roundMatches: Match[],
  ctx: ScoringContext,
): number | null {
  if (!isScrambleFieldMatch(match)) return null;
  const placement = computeScramblePlacement(roundMatches, ctx);
  if (!roundMatches.filter(isScrambleFieldMatch).every(
    (m) => computeScrambleGroupTotal(m, ctx).complete,
  )) {
    return null;
  }
  return placement.get(match.id) ?? 0;
}

function emptySegment(thru: number, total: number, text: string): SegmentResult {
  return {
    thru,
    total,
    margin: 0,
    leader: null,
    decided: false,
    complete: thru === total && thru > 0,
    winner: null,
    resultText: text,
    points: { a: 0, b: 0 },
  };
}

/**
 * Compute the full head-to-head Nassau state for a match: per-hole winners
 * plus the three bets (front, back, overall) and the total points.
 */
export function computeMatchState(
  match: Match,
  players: Player[],
  ctx: ScoringContext,
): MatchState {
  if (isScrambleFieldMatch(match)) {
    const g = computeScrambleGroupTotal(match, ctx);
    const text =
      g.thru === 0
        ? "Not started"
        : g.complete
          ? `Gross ${g.gross}`
          : `${g.gross} thru ${g.thru}`;
    const seg = emptySegment(g.thru, ctx.course.holes.length, text);
    return {
      perHole: [],
      thru: g.thru,
      front: seg,
      back: seg,
      overall: seg,
      leader: null,
      margin: 0,
      holesRemaining: ctx.course.holes.length - g.thru,
      decided: false,
      complete: g.complete,
      resultText: text,
      points: { a: 0, b: 0 },
    };
  }

  const alloc = allocateStrokes(match, players, ctx);
  const segValue = nassauSegmentValue(match.format);

  const perHole: HoleResult[] = ctx.course.holes.map((hole) => {
    const netA = sideNetForHole(match, match.sideA, hole.number, hole.strokeIndex, alloc);
    const netB = sideNetForHole(match, match.sideB, hole.number, hole.strokeIndex, alloc);
    let winner: HoleResult["winner"] = null;
    if (netA !== null && netB !== null) {
      winner = netA < netB ? "A" : netB < netA ? "B" : "halve";
    }
    return { hole: hole.number, netA, netB, winner };
  });

  const front = segmentResult(perHole.filter((h) => h.hole <= 9), segValue);
  const back = segmentResult(perHole.filter((h) => h.hole >= 10), segValue);
  const overall = segmentResult(perHole, segValue);

  const thru = overall.thru;
  const points = {
    a: front.points.a + back.points.a + overall.points.a,
    b: front.points.b + back.points.b + overall.points.b,
  };

  return {
    perHole,
    thru,
    front,
    back,
    overall,
    leader: overall.leader,
    margin: overall.margin,
    holesRemaining: overall.total - overall.thru,
    decided: overall.decided,
    complete: overall.complete,
    resultText: thru === 0 ? "Not started" : overall.resultText,
    points,
  };
}

// --- Individual round totals (player leaderboard) ---------------------------

export interface RoundTotals {
  gross: number;
  net: number;
  thru: number;
}

/**
 * A player's gross and net totals for one match, summed over the holes
 * actually played. Net uses the player's FULL course handicap for the round's
 * tees (not the match-relative allocation); in a scramble the player's score
 * is their team's raw scramble ball (no handicap, so net equals gross).
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
    hcp = 0; // scramble is scored on the raw team ball — no handicap
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

/**
 * Roll every match up into team points for the tournament leaderboard. Each
 * match is a Nassau: its front / back / overall bets each lock in points as
 * they complete (a bet is won by the side up in that stretch, halved 50/50).
 * `computeMatchState.points` already reflects only the completed bets, so
 * summing it gives live, correct standings.
 */
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

  const scrambleRoundIds = new Set(
    matches.filter(isScrambleFieldMatch).map((m) => m.roundId),
  );

  for (const match of matches) {
    if (isScrambleFieldMatch(match)) continue;
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
    }
    a.points += state.points.a;
    b.points += state.points.b;
  }

  for (const roundId of scrambleRoundIds) {
    const ctx = ctxByRound[roundId];
    if (!ctx) continue;
    const roundMatches = matches.filter((m) => m.roundId === roundId);
    const placement = computeScramblePlacement(roundMatches, ctx);
    const allDone = roundMatches
      .filter(isScrambleFieldMatch)
      .every((m) => computeScrambleGroupTotal(m, ctx).complete);

    for (const m of roundMatches.filter(isScrambleFieldMatch)) {
      const g = computeScrambleGroupTotal(m, ctx);
      const team = ensure(m.sideA.teamId);
      if (g.thru > 0) team.matchesPlayed += 1;
      if (g.complete) team.matchesComplete += 1;
      if (allDone) team.points += placement.get(m.id) ?? 0;
    }
  }

  return [...table.values()].sort((x, y) => y.points - x.points);
}
