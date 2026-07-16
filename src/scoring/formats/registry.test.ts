import { describe, expect, it } from "vitest";
import type { CourseDef, Match, Player } from "../../types";
import { teamScoreKey, type ScoringContext } from "../engine";
import {
  FORMAT_REGISTRY,
  getFormat,
  isTeamBall,
  resolveFormatRules,
  seatsPerSide,
} from "./index";

const course: CourseDef = {
  id: "t",
  name: "Test",
  holes: Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, strokeIndex: i + 1 })),
  tees: [{ name: "W", yardage: 6000, rating: 72, slope: 113 }],
};
const ctx: ScoringContext = { course, tee: course.tees[0] };

// A scramble group with `strokes` on every hole (18 * strokes gross).
function group(id: string, teamId: string, strokes: number, holes = 18): Match {
  const key = teamScoreKey(teamId);
  const scores: Match["scores"] = { [key]: {} };
  for (let h = 1; h <= holes; h++) scores[key][h] = strokes;
  return {
    id,
    roundId: "r2",
    format: "scramble",
    sideA: { teamId, playerIds: ["x", "y", "z", "w"] },
    sideB: { teamId: teamId === "tA" ? "tB" : "tA", playerIds: [] },
    scores,
  };
}

describe("format registry", () => {
  it("registers every format under its own id, with sane metadata", () => {
    for (const [key, plugin] of Object.entries(FORMAT_REGISTRY)) {
      expect(plugin.id).toBe(key);
      expect(plugin.seatsPerSide).toBeGreaterThan(0);
      expect(plugin.ruleSections.length).toBeGreaterThan(0);
    }
    expect(seatsPerSide("fourball")).toBe(2);
    expect(seatsPerSide("scramble")).toBe(4);
    expect(isTeamBall("fourball")).toBe(false);
    expect(isTeamBall("scramble")).toBe(true);
    expect(getFormat("fourball").entry).toBe("per-player");
    expect(getFormat("scramble").scope).toBe("field");
  });

  it("four-ball scoreRound sums Nassau points to each side's team", () => {
    const players: Player[] = [
      { id: "a1", name: "A1", handicap: 0, teamId: "tA" },
      { id: "a2", name: "A2", handicap: 0, teamId: "tA" },
      { id: "b1", name: "B1", handicap: 0, teamId: "tB" },
      { id: "b2", name: "B2", handicap: 0, teamId: "tB" },
    ];
    const scores: Match["scores"] = { a1: {}, a2: {}, b1: {}, b2: {} };
    for (let h = 1; h <= 18; h++) {
      scores.a1[h] = 4;
      scores.a2[h] = 4;
      scores.b1[h] = 5; // A wins every hole → sweeps front, back, overall
      scores.b2[h] = 5;
    }
    const m: Match = {
      id: "r1m1",
      roundId: "r1",
      format: "fourball",
      sideA: { teamId: "tA", playerIds: ["a1", "a2"] },
      sideB: { teamId: "tB", playerIds: ["b1", "b2"] },
      scores,
    };
    const fb = getFormat("fourball");
    const { states, teamPoints } = fb.scoreRound([m], players, ctx, fb.defaultRules);
    expect(teamPoints.tA).toBeCloseTo(3);
    expect(teamPoints.tB ?? 0).toBeCloseTo(0);
    expect(states.r1m1.complete).toBe(true);
  });

  it("scramble scoreRound places groups 6/4/2/0 (ties split) once all finish", () => {
    // Gross: tA 72 & 90, tB 72 & 108. Two tied at 72 share (6+4)/2 = 5; 90 = 2; 108 = 0.
    const matches = [
      group("r2m1", "tA", 4),
      group("r2m2", "tA", 5),
      group("r2m3", "tB", 4),
      group("r2m4", "tB", 6),
    ];
    const sc = getFormat("scramble");
    const { teamPoints } = sc.scoreRound(matches, [], ctx, sc.defaultRules);
    expect(teamPoints.tA).toBeCloseTo(7); // 5 + 2
    expect(teamPoints.tB).toBeCloseTo(5); // 5 + 0
  });

  it("scramble awards nothing until every group has 18 holes", () => {
    const matches = [
      group("r2m1", "tA", 4),
      group("r2m2", "tA", 5),
      group("r2m3", "tB", 4),
      group("r2m4", "tB", 6, 17), // unfinished
    ];
    const sc = getFormat("scramble");
    const { teamPoints } = sc.scoreRound(matches, [], ctx, sc.defaultRules);
    expect(Object.keys(teamPoints)).toHaveLength(0);
  });
});

describe("new Nassau formats", () => {
  it("expose the right seats and entry", () => {
    expect(seatsPerSide("fourmanbest")).toBe(4);
    expect(seatsPerSide("singles")).toBe(1);
    expect(getFormat("singles").entry).toBe("per-player");
    expect(getFormat("fourmanbest").scope).toBe("match");
  });

  it("singles scores a Nassau like best ball", () => {
    const players: Player[] = [
      { id: "a", name: "A", handicap: 0, teamId: "tA" },
      { id: "b", name: "B", handicap: 0, teamId: "tB" },
    ];
    const scores: Match["scores"] = { a: {}, b: {} };
    for (let h = 1; h <= 18; h++) {
      scores.a[h] = 4;
      scores.b[h] = 5;
    }
    const m: Match = {
      id: "r3m1",
      roundId: "r3",
      format: "singles",
      sideA: { teamId: "tA", playerIds: ["a"] },
      sideB: { teamId: "tB", playerIds: ["b"] },
      scores,
    };
    const sg = getFormat("singles");
    expect(sg.scoreRound([m], players, ctx, sg.defaultRules).teamPoints.tA).toBeCloseTo(3);
  });

  it("4-man best ball counts the single best net of all four", () => {
    const ids = ["a1", "a2", "a3", "a4", "b1", "b2", "b3", "b4"];
    const players: Player[] = ids.map((id) => ({
      id,
      name: id,
      handicap: 0,
      teamId: id.startsWith("a") ? "tA" : "tB",
    }));
    const scores: Match["scores"] = {};
    for (const id of ids) scores[id] = {};
    for (let h = 1; h <= 18; h++) {
      // Only a4 is any good for A (4); a1-a3 blow up (7). B all shoot 5.
      scores.a1[h] = 7;
      scores.a2[h] = 7;
      scores.a3[h] = 7;
      scores.a4[h] = 4;
      scores.b1[h] = 5;
      scores.b2[h] = 5;
      scores.b3[h] = 5;
      scores.b4[h] = 5;
    }
    const m: Match = {
      id: "r1m1",
      roundId: "r1",
      format: "fourmanbest",
      sideA: { teamId: "tA", playerIds: ["a1", "a2", "a3", "a4"] },
      sideB: { teamId: "tB", playerIds: ["b1", "b2", "b3", "b4"] },
      scores,
    };
    const sg = getFormat("fourmanbest");
    // a4's 4 beats B's 5 every hole → A sweeps all three bets.
    expect(sg.scoreRound([m], players, ctx, sg.defaultRules).teamPoints.tA).toBeCloseTo(3);
  });
});

describe("House Rules override scoring", () => {
  it("resolveFormatRules layers overrides over the shipped defaults", () => {
    expect(resolveFormatRules("fourball")).toEqual({
      segmentValue: 1,
      handicapAllowancePct: 100,
    });
    expect(
      resolveFormatRules("fourball", { formats: { fourball: { segmentValue: 2 } } }),
    ).toEqual({ segmentValue: 2, handicapAllowancePct: 100 });
  });

  it("four-ball segmentValue scales every bet's points", () => {
    const players: Player[] = [
      { id: "a1", name: "A1", handicap: 0, teamId: "tA" },
      { id: "b1", name: "B1", handicap: 0, teamId: "tB" },
    ];
    const scores: Match["scores"] = { a1: {}, b1: {} };
    for (let h = 1; h <= 18; h++) {
      scores.a1[h] = 4; // A sweeps all three bets
      scores.b1[h] = 5;
    }
    const m: Match = {
      id: "r1m1",
      roundId: "r1",
      format: "fourball",
      sideA: { teamId: "tA", playerIds: ["a1"] },
      sideB: { teamId: "tB", playerIds: ["b1"] },
      scores,
    };
    const { teamPoints } = getFormat("fourball").scoreRound([m], players, ctx, {
      segmentValue: 2,
      handicapAllowancePct: 100,
    });
    expect(teamPoints.tA).toBeCloseTo(6); // 3 bets × 2
  });

  it("four-ball handicap allowance scales the strokes given", () => {
    const players: Player[] = [
      { id: "low", name: "Low", handicap: 0, teamId: "tA" },
      { id: "high", name: "High", handicap: 10, teamId: "tB" },
    ];
    const m: Match = {
      id: "r1m1",
      roundId: "r1",
      format: "fourball",
      sideA: { teamId: "tA", playerIds: ["low"] },
      sideB: { teamId: "tB", playerIds: ["high"] },
      scores: { low: {}, high: {} },
    };
    const full = getFormat("fourball").allocateStrokes(m, players, ctx, {
      handicapAllowancePct: 100,
    });
    const half = getFormat("fourball").allocateStrokes(m, players, ctx, {
      handicapAllowancePct: 50,
    });
    expect(full.byPlayer.high).toBe(10);
    expect(half.byPlayer.high).toBe(5); // round(10 × 50%)
  });

  it("scramble placementPoints override the podium payout", () => {
    // Distinct grosses (72, 76, 80, 90) so the four places are unambiguous.
    const matches = [
      group("r2m1", "tA", 4), // 72 → 1st
      group("r2m2", "tB", 5), // 90 → 4th (bump below)
      group("r2m3", "tA", 4), // tweak to 80 → 3rd
      group("r2m4", "tB", 4), // tweak to 76 → 2nd
    ];
    const key = (m: Match) => Object.keys(m.scores)[0];
    matches[2].scores[key(matches[2])][1] = 12; // +8 → 80
    matches[3].scores[key(matches[3])][1] = 8; // +4 → 76
    const { teamPoints } = getFormat("scramble").scoreRound(matches, [], ctx, {
      placementPoints: [12, 6, 2, 0],
    });
    // Places: m1(72)=12 → tA, m4(76)=6 → tB, m3(80)=2 → tA, m2(90)=0 → tB.
    expect(teamPoints.tA).toBeCloseTo(14); // 12 + 2
    expect(teamPoints.tB).toBeCloseTo(6); // 6 + 0
  });
});
