import { describe, expect, it } from "vitest";
import type { CourseDef, Match, Player } from "../../types";
import type { ScoringContext } from "../engine";
import { getFormat } from "../formats";
import {
  SIDEGAME_REGISTRY,
  getSideGame,
  resolveSideGameRules,
  stablefordRowsFor,
} from "./index";

const course: CourseDef = {
  id: "t",
  name: "Test",
  holes: Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, strokeIndex: i + 1 })),
  tees: [{ name: "W", yardage: 6000, rating: 72, slope: 113 }],
};
const ctx: ScoringContext = { course, tee: course.tees[0] };

const players: Player[] = [
  { id: "a1", name: "A1", handicap: 0, teamId: "tA" },
  { id: "b1", name: "B1", handicap: 0, teamId: "tB" },
];

// a1 birdies every hole (3 on a par 4); b1 pars every hole.
function match(): Match {
  const scores: Match["scores"] = { a1: {}, b1: {} };
  for (let h = 1; h <= 18; h++) {
    scores.a1[h] = 3;
    scores.b1[h] = 4;
  }
  return {
    id: "r1m1",
    roundId: "r1",
    format: "fourball",
    sideA: { teamId: "tA", playerIds: ["a1"] },
    sideB: { teamId: "tB", playerIds: ["b1"] },
    scores,
  };
}

describe("side-game registry", () => {
  it("registers each side game and its metadata", () => {
    for (const [key, plugin] of Object.entries(SIDEGAME_REGISTRY)) {
      expect(plugin.id).toBe(key);
    }
    expect(getSideGame("stableford")?.kind).toBe("derived");
    expect(getSideGame("snake")?.kind).toBe("manual");
    // Stableford needs per-player entry; snake fits any format.
    expect(getSideGame("stableford")!.appliesTo(getFormat("fourball"))).toBe(true);
    expect(getSideGame("stableford")!.appliesTo(getFormat("scramble"))).toBe(false);
    expect(getSideGame("snake")!.appliesTo(getFormat("scramble"))).toBe(true);
  });

  it("resolveSideGameRules layers overrides over the shipped defaults", () => {
    expect(resolveSideGameRules("stableford")).toEqual({ points: [5, 4, 3, 2, 1, 0] });
    expect(resolveSideGameRules("snake")).toEqual({ potPerChange: 1 });
    expect(
      resolveSideGameRules("snake", { formats: {}, sideGames: { snake: { potPerChange: 5 } } }),
    ).toEqual({ potPerChange: 5 });
  });

  it("computes default Stableford (birdies = 3 pts/hole)", () => {
    const rows = stablefordRowsFor(match(), players, ctx);
    const a1 = rows.find((r) => r.playerId === "a1")!;
    const b1 = rows.find((r) => r.playerId === "b1")!;
    expect(a1.points).toBe(18 * 3); // 18 birdies × 3
    expect(b1.points).toBe(18 * 2); // 18 pars × 2
  });

  it("honors a custom Stableford points table", () => {
    // Modified table where a birdie is worth 5.
    const rows = stablefordRowsFor(match(), players, ctx, {
      formats: {},
      sideGames: { stableford: { points: [8, 6, 5, 2, 1, 0] } },
    });
    expect(rows.find((r) => r.playerId === "a1")!.points).toBe(18 * 5);
  });

  it("returns no Stableford rows for a scramble (team ball)", () => {
    const scr: Match = {
      id: "r2m1",
      roundId: "r2",
      format: "scramble",
      sideA: { teamId: "tA", playerIds: ["a1", "b1"] },
      sideB: { teamId: "tB", playerIds: [] },
      scores: { "team:tA": { 1: 4 } },
    };
    expect(stablefordRowsFor(scr, players, ctx)).toEqual([]);
  });
});
