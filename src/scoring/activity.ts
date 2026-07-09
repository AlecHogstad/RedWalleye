// ---------------------------------------------------------------------------
// Activity feed — DERIVED, not stored.
//
// Every headline moment (birdies, blow-ups, lead changes, closeouts, the
// overall trip lead) is a pure function of the scores already syncing across
// phones, so the feed rebuilds identically on every device with no extra
// database rows and no races between scorekeepers. The only genuinely
// discrete events — booze mulligans — come in from the stored activity log.
//
// Nothing here has a wall-clock timestamp (scores don't carry one), so the
// feed is ordered by GOLF chronology: later round → higher hole → bigger
// moment. That reads more naturally than "5m ago" anyway ("Hunter birdied 7"
// is located by the hole, which is what everyone actually remembers).
// ---------------------------------------------------------------------------

import type { Match, Player, TournamentState } from "../types";
import {
  computeMatchState,
  computeStandings,
  courseHandicap,
  isScrambleFieldMatch,
  strokesOnHole,
  teamScoreKey,
  type HoleResult,
  type ScoringContext,
} from "./engine";

export type FeedKind =
  | "ace" // hole-in-one (gross 1 on a par 3)
  | "eagle" // net eagle or better (net-to-par ≤ -2)
  | "birdie" // net birdie (net-to-par === -1)
  | "blowup" // net double bogey or worse (net-to-par ≥ +2)
  | "matchLead" // a side took the lead in its match
  | "comeback" // a side erased a 3+ deficit to take the lead
  | "matchFinal" // a match (the overall 18 bet) was won / closed out / halved
  | "segment" // a Nassau nine (front or back) was won or halved
  | "overallLead" // the overall trip lead changed hands (at a round's end)
  | "snake" // who currently holds the snake in a group
  | "mulligan"; // a booze mulligan was taken (stored event)

export interface FeedItem {
  id: string; // stable key (also dedupes)
  kind: FeedKind;
  order: number; // golf-chronology sort — higher is more recent / bigger
  roundId: string;
  hole?: number;
  matchId?: string;
  teamId?: string; // subject team (event's team, or the player's team)
  otherTeamId?: string; // opponent, for match events
  playerId?: string; // subject player, when it's about one golfer
  value?: number; // net-to-par, match margin, snake pot, or points
  text?: string; // result string like "3&2"
  segment?: "front" | "back"; // which nine, for `segment` events
  ts?: number; // real timestamp, mulligans only
  mediaPath?: string;
  mediaStatus?: "pending" | "ready";
}

// Bigger moments sort above smaller ones that share a round+hole.
const WEIGHT: Record<FeedKind, number> = {
  ace: 9,
  overallLead: 8,
  matchFinal: 7,
  segment: 6,
  comeback: 6,
  matchLead: 5,
  eagle: 4,
  mulligan: 4,
  birdie: 3,
  blowup: 2,
  snake: 1,
};

function orderOf(roundIndex: number, hole: number | undefined, kind: FeedKind): number {
  return roundIndex * 100000 + (hole ?? 0) * 1000 + WEIGHT[kind];
}

/** The latest hole scored in a nine — where its result posts in the feed, so
 *  the nine's summary sits just above that nine's per-hole highlights. */
function segmentLastHole(holes: HoleResult[]): number {
  const scored = holes.filter((h) => h.winner != null);
  return scored.length ? scored[scored.length - 1].hole : (holes[0]?.hole ?? 0);
}

/** The other team in a match, relative to `teamId`. */
function opponent(match: Match, teamId: string): string {
  return match.sideA.teamId === teamId ? match.sideB.teamId : match.sideA.teamId;
}

/** Classify a net-to-par into a scoring-highlight kind, or null for par/bogey. */
function classify(netToPar: number): FeedKind | null {
  if (netToPar <= -2) return "eagle";
  if (netToPar === -1) return "birdie";
  if (netToPar >= 2) return "blowup";
  return null;
}

/** How many holes of a match have been played (for placing snake/mulligan). */
function matchThru(match: Match, players: Player[], ctx: ScoringContext): number {
  return computeMatchState(match, players, ctx).thru;
}

// --- Per-hole scoring highlights --------------------------------------------

function holeEvents(
  match: Match,
  players: Player[],
  ctx: ScoringContext,
  roundIndex: number,
): FeedItem[] {
  const items: FeedItem[] = [];
  const holes = ctx.course.holes;

  const emit = (
    kind: FeedKind,
    hole: number,
    netToPar: number,
    who: { teamId: string; playerId?: string },
  ) => {
    items.push({
      id: `${kind}:${match.id}:${who.playerId ?? who.teamId}:${hole}`,
      kind,
      order: orderOf(roundIndex, hole, kind),
      roundId: match.roundId,
      hole,
      matchId: match.id,
      teamId: who.teamId,
      playerId: who.playerId,
      value: netToPar,
    });
  };

  if (match.format === "scramble") {
    // Raw team ball, no handicap — highlights are gross-to-par.
    for (const side of [match.sideA, match.sideB]) {
      if (side.playerIds.length === 0) continue; // one team per entry, sideB empty
      const key = teamScoreKey(side.teamId);
      for (const h of holes) {
        const g = match.scores[key]?.[h.number];
        if (g == null) continue;
        if (g === 1 && h.par === 3) {
          emit("ace", h.number, 1 - h.par, { teamId: side.teamId });
          continue;
        }
        const toPar = g - h.par;
        const kind = classify(toPar);
        if (kind) emit(kind, h.number, toPar, { teamId: side.teamId });
      }
    }
    return items;
  }

  const ids = [...match.sideA.playerIds, ...match.sideB.playerIds];
  for (const pid of ids) {
    const player = players.find((p) => p.id === pid);
    if (!player) continue;
    const hcp = courseHandicap(player.handicap, ctx);
    for (const h of holes) {
      const g = match.scores[pid]?.[h.number];
      if (g == null) continue;
      if (g === 1 && h.par === 3) {
        emit("ace", h.number, 1 - h.par, { teamId: player.teamId, playerId: pid });
        continue;
      }
      const netToPar = g - strokesOnHole(hcp, h.strokeIndex) - h.par;
      const kind = classify(netToPar);
      if (kind) emit(kind, h.number, netToPar, { teamId: player.teamId, playerId: pid });
    }
  }
  return items;
}

// --- Match-play drama: lead changes, comebacks, closeouts -------------------

function matchProgressEvents(
  match: Match,
  players: Player[],
  ctx: ScoringContext,
  roundIndex: number,
): FeedItem[] {
  if (isScrambleFieldMatch(match)) return [];

  const st = computeMatchState(match, players, ctx);
  const items: FeedItem[] = [];

  let margin = 0; // + means side A is up
  let prevLeaderTeam: string | null = null;
  let maxDeficitA = 0; // most holes A has been down
  let maxDeficitB = 0;
  let comebackDone = false;

  for (const r of st.perHole) {
    if (r.winner == null) continue; // hole not decided / not both scored
    if (r.winner === "A") margin += 1;
    else if (r.winner === "B") margin -= 1;

    if (margin < 0) maxDeficitA = Math.max(maxDeficitA, -margin);
    if (margin > 0) maxDeficitB = Math.max(maxDeficitB, margin);

    const leaderTeam =
      margin > 0 ? match.sideA.teamId : margin < 0 ? match.sideB.teamId : null;

    if (leaderTeam && leaderTeam !== prevLeaderTeam) {
      const wasDown = margin > 0 ? maxDeficitA : maxDeficitB;
      const comeback = !comebackDone && wasDown >= 3;
      const kind: FeedKind = comeback ? "comeback" : "matchLead";
      if (comeback) comebackDone = true;
      items.push({
        id: `${kind}:${match.id}:${r.hole}`,
        kind,
        order: orderOf(roundIndex, r.hole, kind),
        roundId: match.roundId,
        hole: r.hole,
        matchId: match.id,
        teamId: leaderTeam,
        otherTeamId: opponent(match, leaderTeam),
        value: comeback ? wasDown : Math.abs(margin),
      });
    }
    prevLeaderTeam = leaderTeam;
  }

  if (st.complete) {
    const winnerTeam =
      st.leader === "A"
        ? match.sideA.teamId
        : st.leader === "B"
          ? match.sideB.teamId
          : null;
    const subjectTeam = winnerTeam ?? match.sideA.teamId;
    items.push({
      id: `matchFinal:${match.id}`,
      kind: "matchFinal",
      order: orderOf(roundIndex, st.thru, "matchFinal"),
      roundId: match.roundId,
      hole: st.thru,
      matchId: match.id,
      teamId: subjectTeam,
      otherTeamId: opponent(match, subjectTeam),
      value: st.margin,
      text: st.resultText,
    });
  }

  // The two nine-hole Nassau bets — announce each as it locks.
  const nines = [
    { seg: "front" as const, s: st.front, holes: st.perHole.filter((h) => h.hole <= 9) },
    { seg: "back" as const, s: st.back, holes: st.perHole.filter((h) => h.hole >= 10) },
  ];
  for (const { seg, s, holes } of nines) {
    if (!s.complete) continue;
    const winnerTeam =
      s.leader === "A" ? match.sideA.teamId : s.leader === "B" ? match.sideB.teamId : null;
    const subject = winnerTeam ?? match.sideA.teamId;
    const hole = segmentLastHole(holes);
    items.push({
      id: `segment:${match.id}:${seg}`,
      kind: "segment",
      segment: seg,
      order: orderOf(roundIndex, hole, "segment"),
      roundId: match.roundId,
      hole,
      matchId: match.id,
      teamId: subject,
      otherTeamId: opponent(match, subject),
      value: s.margin,
      text: s.winner === "halve" ? "halved" : s.resultText,
    });
  }
  return items;
}

// --- Snake (current holder per group) ---------------------------------------

function snakeEvents(
  match: Match,
  players: Player[],
  ctx: ScoringContext,
  sideGames: TournamentState["sideGames"],
  roundIndex: number,
): FeedItem[] {
  const sg = sideGames[match.id];
  if (!sg?.snake || !sg.snakeHolder) return [];
  const holder = players.find((p) => p.id === sg.snakeHolder);
  if (!holder) return [];
  const hole = Math.max(1, matchThru(match, players, ctx));
  return [
    {
      id: `snake:${match.id}:${sg.snakeHolder}`,
      kind: "snake",
      order: orderOf(roundIndex, hole, "snake"),
      roundId: match.roundId,
      hole,
      matchId: match.id,
      teamId: holder.teamId,
      playerId: sg.snakeHolder,
      value: sg.snakeChanges ?? 0,
    },
  ];
}

// --- Overall trip lead changes (settled at each round's end) -----------------

/** The single team strictly ahead in the standings, or null on a tie/empty. */
function strictLeader(standings: ReturnType<typeof computeStandings>): string | null {
  if (standings.length === 0) return null;
  if (standings.length === 1) return standings[0].teamId;
  return standings[0].points > standings[1].points ? standings[0].teamId : null;
}

function overallLeadEvents(
  state: TournamentState,
  ctxByRound: Record<string, ScoringContext>,
  roundIndexById: Record<string, number>,
): FeedItem[] {
  const items: FeedItem[] = [];
  let prevLeader: string | null = null;

  // Walk rounds in order; recompute standings as each one finalizes. A round
  // only awards its points once it's final, so this is exact — the coarse
  // granularity (per finished round) is deliberate: mid-round the drama lives
  // in the match-lead items, not a flickering projected trophy.
  for (const round of state.rounds) {
    if (round.status !== "final") continue;
    const idx = roundIndexById[round.id];
    const settledMatches = state.matches.filter(
      (m) =>
        roundIndexById[m.roundId] <= idx &&
        state.rounds.find((r) => r.id === m.roundId)?.status === "final",
    );
    const leader = strictLeader(
      computeStandings(settledMatches, state.players, ctxByRound),
    );
    if (leader && leader !== prevLeader) {
      const standings = computeStandings(settledMatches, state.players, ctxByRound);
      items.push({
        id: `overallLead:${round.id}`,
        kind: "overallLead",
        order: orderOf(idx, 18, "overallLead"),
        roundId: round.id,
        teamId: leader,
        value: standings.find((s) => s.teamId === leader)?.points ?? 0,
      });
      prevLeader = leader;
    } else if (leader) {
      prevLeader = leader;
    }
  }
  return items;
}

// --- Assembly ----------------------------------------------------------------

/** Build the full activity feed for the tournament, newest/biggest first. */
export function buildFeed(
  state: TournamentState,
  ctxByRound: Record<string, ScoringContext>,
): FeedItem[] {
  const roundIndexById: Record<string, number> = Object.fromEntries(
    state.rounds.map((r, i) => [r.id, i]),
  );
  const items: FeedItem[] = [];

  for (const match of state.matches) {
    const round = state.rounds.find((r) => r.id === match.roundId);
    if (!round || round.status === "pending") continue; // nothing scored yet
    const ctx = ctxByRound[match.roundId];
    if (!ctx) continue;
    const ri = roundIndexById[match.roundId];
    items.push(...holeEvents(match, state.players, ctx, ri));
    items.push(...matchProgressEvents(match, state.players, ctx, ri));
    items.push(...snakeEvents(match, state.players, ctx, state.sideGames, ri));
  }

  items.push(...overallLeadEvents(state, ctxByRound, roundIndexById));

  // Stored discrete events: booze mulligans.
  for (const e of state.activity) {
    if (e.type !== "mulligan") continue;
    const match = state.matches.find((m) => m.id === e.matchId);
    if (!match) continue;
    const ri = roundIndexById[match.roundId] ?? 0;
    const player = state.players.find((p) => p.id === e.playerId);
    items.push({
      id: e.id,
      kind: "mulligan",
      order: orderOf(ri, e.hole, "mulligan"),
      roundId: match.roundId,
      hole: e.hole,
      matchId: e.matchId,
      teamId: player?.teamId,
      playerId: e.playerId,
      ts: e.ts,
      mediaPath: e.media?.path,
      mediaStatus: e.media?.status,
    });
  }

  return items.sort((a, b) => b.order - a.order);
}

/** Feed lines for the match-page ticker — active round, other groups only. */
export function feedForMatchTicker(
  feed: FeedItem[],
  roundId: string,
  excludeMatchId: string,
  limit = 12,
): FeedItem[] {
  return feed
    .filter((e) => e.roundId === roundId && e.matchId !== excludeMatchId)
    .slice(0, limit);
}
