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
  it("returns the four-man entry order for a team", () => {
    const state = seedState();
    expect(rosterOf(state, "t1")).toEqual(["hunter", "alex", "jeff", "nick"]);
  });
});

describe("reconcileRoster", () => {
  it("swaps a player across every match and flips team tags", () => {
    const state = withPoolPlayer("ringer");
    // Replace nick with the pool player on team t1.
    const roster = rosterOf(state, "t1").map((id) => (id === "nick" ? "ringer" : id));
    const { next, matchPatches, playerTeamChanges } = reconcileRoster(
      state,
      "t1",
      roster,
    );

    // nick gone from t1, ringer in — everywhere t1 appears.
    expect(rosterOf(next, "t1")).toContain("ringer");
    expect(rosterOf(next, "t1")).not.toContain("nick");

    // nick was paired with hunter in the four-ball match r1m1; ringer takes the slot.
    const r1m1 = next.matches.find((m) => m.id === "r1m1")!;
    expect(r1m1.sideA.playerIds).toContain("ringer");
    expect(r1m1.sideA.playerIds).not.toContain("nick");

    // scramble side (names only) updated too.
    const r2m1 = next.matches.find((m) => m.id === "r2m1")!;
    expect(r2m1.sideA.playerIds).toContain("ringer");

    // Team tags flipped both ways.
    expect(next.players.find((p) => p.id === "ringer")!.teamId).toBe("t1");
    expect(next.players.find((p) => p.id === "nick")!.teamId).toBe("");

    // Change bookkeeping for sync.
    expect(playerTeamChanges).toContainEqual({ id: "nick", teamId: "" });
    expect(playerTeamChanges).toContainEqual({ id: "ringer", teamId: "t1" });
    expect(matchPatches.some((p) => p.id === "r1m1")).toBe(true);
    // Untouched teams/matches aren't patched.
    expect(matchPatches.some((p) => p.id === "r1m3")).toBe(false);
  });

  it("removes a player when dropped from the roster", () => {
    const state = seedState();
    const roster = rosterOf(state, "t1").filter((id) => id !== "nick");
    const { next } = reconcileRoster(state, "t1", roster);

    expect(rosterOf(next, "t1")).toEqual(["hunter", "alex", "jeff"]);
    expect(next.players.find((p) => p.id === "nick")!.teamId).toBe("");
    const r3t1 = next.matches.find((m) => m.id === "r3t1")!;
    expect(r3t1.sideA.playerIds).not.toContain("nick");
  });

  it("adds a pool player into an open slot", () => {
    // Start from a t1 that has an open slot (nick removed).
    const base = seedState();
    const opened = reconcileRoster(
      base,
      "t1",
      rosterOf(base, "t1").filter((id) => id !== "nick"),
    ).next;
    opened.players.push({ id: "ringer", name: "Ringer", handicap: 5, teamId: "" });

    const roster = [...rosterOf(opened, "t1"), "ringer"];
    const { next } = reconcileRoster(opened, "t1", roster);

    expect(rosterOf(next, "t1")).toContain("ringer");
    expect(next.players.find((p) => p.id === "ringer")!.teamId).toBe("t1");
    // Lands in the four-ball pair that had the open slot (r1m1, where nick was).
    const r1m1 = next.matches.find((m) => m.id === "r1m1")!;
    expect(r1m1.sideA.playerIds).toContain("ringer");
    expect(r1m1.sideA.playerIds.length).toBe(2);
  });

  it("does not mutate the input state", () => {
    const state = seedState();
    reconcileRoster(state, "t1", ["hunter", "alex", "jeff"]);
    expect(rosterOf(state, "t1")).toEqual(["hunter", "alex", "jeff", "nick"]);
  });
});
