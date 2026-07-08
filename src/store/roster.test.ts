import { describe, expect, it } from "vitest";
import { reconcileRoster, rosterOf } from "./roster";
import { seedState } from "../data/seed";
import type { Player } from "../types";

/** Add an unassigned player to a state clone (pure). */
function withPoolPlayer(id: string, name = "Ringer", handicap = 5) {
  const state = seedState();
  const p: Player = { id, name, handicap, teamId: "" };
  state.players.push(p);
  return state;
}

describe("rosterOf", () => {
  it("returns every player tagged with the team, in player order", () => {
    const state = seedState();
    expect(rosterOf(state, "tA")).toEqual([
      "hunter",
      "frank",
      "brody",
      "alex",
      "hank",
      "jeff",
      "nikk",
      "nick",
    ]);
    expect(rosterOf(state, "tB")).toHaveLength(8);
  });
});

describe("reconcileRoster", () => {
  it("swaps a player across their matches and flips team tags", () => {
    const state = withPoolPlayer("ringer");
    // Replace Nick with the pool player on Team A.
    const roster = rosterOf(state, "tA").map((id) => (id === "nick" ? "ringer" : id));
    const { next, matchPatches, playerTeamChanges } = reconcileRoster(
      state,
      "tA",
      roster,
    );

    expect(rosterOf(next, "tA")).toContain("ringer");
    expect(rosterOf(next, "tA")).not.toContain("nick");

    // Nick sat in the r1m4 four-ball pair; the ringer takes the seat.
    const r1m4 = next.matches.find((m) => m.id === "r1m4")!;
    expect(r1m4.sideA.playerIds).toContain("ringer");
    expect(r1m4.sideA.playerIds).not.toContain("nick");

    expect(next.players.find((p) => p.id === "ringer")!.teamId).toBe("tA");
    expect(next.players.find((p) => p.id === "nick")!.teamId).toBe("");
    expect(playerTeamChanges).toContainEqual({ id: "nick", teamId: "" });
    expect(playerTeamChanges).toContainEqual({ id: "ringer", teamId: "tA" });
    expect(matchPatches.some((p) => p.id === "r1m4")).toBe(true);
    // Team B is untouched.
    expect(matchPatches.some((p) => p.id === "r1m1")).toBe(false);
  });

  it("removes a player dropped from the roster", () => {
    const state = seedState();
    const roster = rosterOf(state, "tA").filter((id) => id !== "nick");
    const { next } = reconcileRoster(state, "tA", roster);
    expect(rosterOf(next, "tA")).not.toContain("nick");
    expect(next.players.find((p) => p.id === "nick")!.teamId).toBe("");
  });

  it("does not mutate the input state", () => {
    const state = seedState();
    const before = rosterOf(state, "tA");
    reconcileRoster(
      state,
      "tA",
      before.filter((id) => id !== "nick"),
    );
    expect(rosterOf(state, "tA")).toEqual(before);
  });
});
