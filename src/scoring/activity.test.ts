import { describe, expect, it } from "vitest";
import { buildFeed } from "./activity";
import { contextForRound, type ScoringContext } from "./engine";
import { seedState } from "../data/seed";
import type { TournamentState } from "../types";

/** Seed with every round started on Big Fish so scores can be entered and the
 *  feed has real contexts to work from. */
function startedState(): TournamentState {
  const s = seedState();
  s.rounds = s.rounds.map((r) => ({
    ...r,
    status: "active",
    courseId: "bigfish",
    teeName: "Member",
  }));
  return s;
}

function contexts(s: TournamentState): Record<string, ScoringContext> {
  return Object.fromEntries(s.rounds.map((r) => [r.id, contextForRound(s, r.id)]));
}

describe("buildFeed — per-hole highlights", () => {
  it("is empty when nothing has been scored", () => {
    const s = seedState(); // all rounds pending
    expect(buildFeed(s, contexts(s))).toEqual([]);
  });

  it("flags a gross ace on a par 3", () => {
    const s = startedState();
    const m = s.matches.find((x) => x.id === "r1m1")!; // Team A: hunter/frank
    // Hole 3 at Big Fish is a par 3. A gross 1 is an ace.
    m.scores.hunter[3] = 1;
    const feed = buildFeed(s, contexts(s));
    const ace = feed.find((f) => f.kind === "ace");
    expect(ace).toBeDefined();
    expect(ace!.playerId).toBe("hunter");
    expect(ace!.hole).toBe(3);
  });

  it("flags a net birdie and a net blow-up, and ignores pars", () => {
    const s = startedState();
    const m = s.matches.find((x) => x.id === "r1m1")!;
    // Score the extremes so the classification is unambiguous.
    m.scores.frank[1] = 2; // well under par → birdie or better
    m.scores.frank[2] = 9; // par 5, +4 gross → blow-up even with a stroke
    const feed = buildFeed(s, contexts(s));
    const forFrank = feed.filter((f) => f.playerId === "frank");
    expect(forFrank.some((f) => f.kind === "birdie" || f.kind === "eagle")).toBe(true);
    expect(forFrank.some((f) => f.kind === "blowup")).toBe(true);
  });
});

describe("buildFeed — match drama", () => {
  it("emits a match-lead change when a side goes ahead", () => {
    const s = startedState();
    const m = s.matches.find((x) => x.id === "r1m1")!; // tA (hunter/frank) v tB (nated/mike)
    m.scores.hunter[1] = 3;
    m.scores.frank[1] = 3;
    m.scores.nated[1] = 8;
    m.scores.mike[1] = 8;
    const feed = buildFeed(s, contexts(s));
    const lead = feed.find((f) => f.kind === "matchLead");
    expect(lead).toBeDefined();
    expect(lead!.teamId).toBe("tA");
    expect(lead!.otherTeamId).toBe("tB");
    expect(lead!.hole).toBe(1);
  });

  it("emits a closeout when a match is mathematically decided", () => {
    const s = startedState();
    const m = s.matches.find((x) => x.id === "r1m1")!;
    // Side A wins holes 1..10 outright → 10 up with 8 to play → closed out.
    for (let h = 1; h <= 10; h++) {
      m.scores.hunter[h] = 2;
      m.scores.frank[h] = 2;
      m.scores.nated[h] = 9;
      m.scores.mike[h] = 9;
    }
    const feed = buildFeed(s, contexts(s));
    const fin = feed.find((f) => f.kind === "matchFinal");
    expect(fin).toBeDefined();
    expect(fin!.teamId).toBe("tA");
    expect(fin!.text).toMatch(/&/); // e.g. "10&8"
  });
});

describe("buildFeed — snake & mulligans", () => {
  it("surfaces the current snake holder with the pot size", () => {
    const s = startedState();
    const m = s.matches.find((x) => x.id === "r2m1")!; // scramble, Team A group 1
    m.scores["team:tA"][1] = 5; // give the group a hole so it has a 'thru'
    s.sideGames[m.id] = { snake: true, snakeHolder: "hunter", snakeChanges: 3 };
    const feed = buildFeed(s, contexts(s));
    const snake = feed.find((f) => f.kind === "snake");
    expect(snake).toBeDefined();
    expect(snake!.playerId).toBe("hunter");
    expect(snake!.value).toBe(3);
  });

  it("includes stored booze mulligans, ordered by their hole", () => {
    const s = startedState();
    s.activity = [
      { id: "a1", type: "mulligan", matchId: "r2m1", playerId: "hunter", ts: 100, hole: 4 },
    ];
    const feed = buildFeed(s, contexts(s));
    const mull = feed.find((f) => f.kind === "mulligan");
    expect(mull).toBeDefined();
    expect(mull!.playerId).toBe("hunter");
    expect(mull!.hole).toBe(4);
  });
});

describe("buildFeed — overall lead", () => {
  it("announces the trip leader once a round is final", () => {
    const s = startedState();
    // Finalize Round 1 only; Team A sweeps all four matches → strict leader.
    s.rounds = s.rounds.map((r) =>
      r.id === "r1" ? { ...r, status: "final" } : { ...r, status: "pending" },
    );
    const winFor = (matchId: string, side: "A" | "B") => {
      const m = s.matches.find((x) => x.id === matchId)!;
      const win = side === "A" ? m.sideA : m.sideB;
      const lose = side === "A" ? m.sideB : m.sideA;
      for (let h = 1; h <= 18; h++) {
        for (const pid of win.playerIds) m.scores[pid][h] = 3;
        for (const pid of lose.playerIds) m.scores[pid][h] = 8;
      }
    };
    winFor("r1m1", "A");
    winFor("r1m2", "A");
    winFor("r1m3", "A");
    winFor("r1m4", "A");
    const feed = buildFeed(s, contexts(s));
    const lead = feed.find((f) => f.kind === "overallLead");
    expect(lead).toBeDefined();
    expect(lead!.teamId).toBe("tA");
  });
});
