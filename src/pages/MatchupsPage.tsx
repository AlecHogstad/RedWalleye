import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { FORMAT_LABELS, type Match } from "../types";
import { useStore } from "../store/store";
import { rosterOf } from "../store/roster";

function hcp(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** How many golfers sit on each side of a match. */
function seatCount(format: Match["format"]): number {
  return format === "scramble" ? 4 : 2;
}

export default function MatchupsPage() {
  const { roundId } = useParams();
  const { state, setMatchup } = useStore();

  const round = state.rounds.find((r) => r.id === roundId);
  const matches = useMemo(
    () => state.matches.filter((m) => m.roundId === roundId),
    [state.matches, roundId],
  );
  const playerMap = useMemo(
    () => Object.fromEntries(state.players.map((p) => [p.id, p])),
    [state.players],
  );
  const teamMap = useMemo(
    () => Object.fromEntries(state.teams.map((t) => [t.id, t])),
    [state.teams],
  );

  if (!round) {
    return (
      <div className="section">
        <p>Round not found.</p>
        <Link className="btn" to="/rounds">
          Back to rounds
        </Link>
      </div>
    );
  }

  const editable = round.status === "pending";
  const seats = seatCount(round.format);

  // Which golfers are already placed somewhere in this round, per team.
  const usedBy = (teamId: string): Set<string> => {
    const used = new Set<string>();
    for (const m of matches) {
      const side = m.sideA.teamId === teamId ? m.sideA : m.sideB;
      side.playerIds.forEach((id) => used.add(id));
    }
    return used;
  };

  const label = (id: string): string => {
    const p = playerMap[id];
    return p ? `${p.name} (${hcp(p.handicap)})` : id;
  };

  const teams = [
    { key: "A" as const, teamId: "tA" },
    { key: "B" as const, teamId: "tB" },
  ];

  // Set one seat on one side of a match, then persist the whole side.
  const setSeat = (
    match: Match,
    side: "A" | "B",
    index: number,
    value: string,
  ) => {
    const cur = side === "A" ? match.sideA.playerIds : match.sideB.playerIds;
    const next = [...cur];
    while (next.length < seats) next.push("");
    next[index] = value;
    const cleaned = next.filter(Boolean);
    if (side === "A") setMatchup(match.id, cleaned, match.sideB.playerIds);
    else setMatchup(match.id, match.sideA.playerIds, cleaned);
  };

  // Completeness: every seat filled (all 8 per team placed once).
  const benchA = rosterOf(state, "tA").filter((id) => !usedBy("tA").has(id));
  const benchB = rosterOf(state, "tB").filter((id) => !usedBy("tB").has(id));
  const emptySeats = matches.reduce(
    (n, m) => n + (seats - m.sideA.playerIds.length) + (seats - m.sideB.playerIds.length),
    0,
  );
  const complete = emptySeats === 0 && benchA.length === 0 && benchB.length === 0;

  const seatSelect = (match: Match, side: "A" | "B", index: number) => {
    const teamId = side === "A" ? match.sideA.teamId : match.sideB.teamId;
    const ids = side === "A" ? match.sideA.playerIds : match.sideB.playerIds;
    const value = ids[index] ?? "";
    const used = usedBy(teamId);
    const available = rosterOf(state, teamId).filter(
      (id) => id === value || !used.has(id),
    );
    return (
      <select
        key={`${match.id}-${side}-${index}`}
        className="roster-select wide"
        value={value}
        disabled={!editable}
        aria-label={`${teamMap[teamId]?.name} seat ${index + 1} in ${match.id}`}
        onChange={(e) => setSeat(match, side, index, e.target.value)}
      >
        <option value="">— empty —</option>
        {available.map((id) => (
          <option key={id} value={id}>
            {label(id)}
          </option>
        ))}
      </select>
    );
  };

  return (
    <>
      <div className="section" style={{ paddingBottom: 0 }}>
        <Link className="badge" to="/rounds">
          ← Rounds
        </Link>
        <h2 style={{ marginTop: 10 }}>
          {round.name} matchups
        </h2>
        <p className="hint" style={{ padding: "0 2px 6px" }}>
          {FORMAT_LABELS[round.format]} — set who plays who. Each golfer plays
          once. {seats} per side.
        </p>
        {!editable && (
          <p className="hint" style={{ padding: "0 2px 8px", color: "var(--accent)" }}>
            This round has started, so its matchups are locked.
          </p>
        )}

        {/* Bench: who's not slotted yet, per team */}
        <div className="card" style={{ padding: "10px 14px" }}>
          {teams.map(({ teamId }) => {
            const bench = teamId === "tA" ? benchA : benchB;
            const team = teamMap[teamId];
            return (
              <div className="field" key={teamId} style={{ alignItems: "flex-start" }}>
                <span className="dot" style={{ background: team?.color, marginTop: 4 }} />
                <span className="wide">
                  <strong>{team?.name}</strong>{" "}
                  <span className="muted" style={{ fontSize: 12.5 }}>
                    {bench.length === 0
                      ? "all slotted"
                      : `bench: ${bench.map((id) => playerMap[id]?.name ?? id).join(", ")}`}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {matches.map((m, i) => (
        <section className="section" key={m.id} style={{ paddingTop: 0 }}>
          <div className="card">
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
              <strong>Match {i + 1}</strong>
              <span className="muted" style={{ fontSize: 12.5 }}>
                {seats} v {seats}
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="hint" style={{ margin: "0 0 4px" }}>
                  {teamMap[m.sideA.teamId]?.name}
                </div>
                {Array.from({ length: seats }, (_, s) => seatSelect(m, "A", s))}
              </div>
              <div
                className="muted"
                style={{ alignSelf: "center", fontWeight: 700, fontSize: 12 }}
              >
                vs
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="hint" style={{ margin: "0 0 4px" }}>
                  {teamMap[m.sideB.teamId]?.name}
                </div>
                {Array.from({ length: seats }, (_, s) => seatSelect(m, "B", s))}
              </div>
            </div>
          </div>
        </section>
      ))}

      <div className="section" style={{ paddingTop: 0 }}>
        <p className="hint center">
          {complete
            ? "✓ All golfers slotted — this round's matchups are set."
            : `${emptySeats} empty seat${emptySeats === 1 ? "" : "s"} · ` +
              `${benchA.length + benchB.length} golfer${
                benchA.length + benchB.length === 1 ? "" : "s"
              } on the bench.`}
        </p>
        <Link className="btn ghost" to="/rounds">
          Done
        </Link>
      </div>
    </>
  );
}
