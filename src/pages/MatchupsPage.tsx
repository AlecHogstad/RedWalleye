import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { FORMAT_LABELS, type Match } from "../types";
import { useStore } from "../store/store";
import { teamRosterIds, type DraftTeam } from "../store/draft";

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
    { teamId: "tA" },
    { teamId: "tB" },
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

  const rosterFor = (teamId: string) =>
    teamRosterIds(state, teamId as DraftTeam);

  // Completeness: every seat filled (all 8 per team placed once).
  const benchA = rosterFor("tA").filter((id) => !usedBy("tA").has(id));
  const benchB = rosterFor("tB").filter((id) => !usedBy("tB").has(id));
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
    const available = rosterFor(teamId).filter(
      (id) => id === value || !used.has(id),
    );
    const team = teamMap[teamId];
    return (
      <select
        value={value}
        disabled={!editable}
        aria-label={`${team?.name} seat ${index + 1} in match ${match.id}`}
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
        <h2 style={{ marginTop: 10 }}>{round.name} matchups</h2>
        <p className="hint" style={{ padding: "0 2px 8px" }}>
          {FORMAT_LABELS[round.format]} — set who plays who. Each golfer plays
          once. {seats} per side.
        </p>
        {!editable && (
          <p className="hint" style={{ padding: "0 2px 8px", color: "var(--accent)" }}>
            This round has started, so its matchups are locked.
          </p>
        )}
      </div>

      <section className="section" style={{ paddingTop: 0 }}>
        <h2>Bench</h2>
        <div className="card">
          {teams.map(({ teamId }) => {
            const bench = teamId === "tA" ? benchA : benchB;
            const team = teamMap[teamId];
            return (
              <div className="field" key={teamId}>
                <span className="dot" style={{ background: team?.color }} />
                <span className="wide" style={{ fontWeight: 600 }}>
                  {team?.name}
                </span>
                <span className="muted" style={{ fontSize: 12.5, textAlign: "right" }}>
                  {bench.length === 0
                    ? "all slotted"
                    : bench.map((id) => playerMap[id]?.name ?? id).join(", ")}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {matches.map((m, i) => {
        const teamA = teamMap[m.sideA.teamId];
        const teamB = teamMap[m.sideB.teamId];
        return (
          <section className="section" key={m.id} style={{ paddingTop: 0 }}>
            <h2>
              Match {i + 1}
              <span className="oval muted-oval">
                {seats} v {seats}
              </span>
            </h2>
            <div className="card">
              <div className="field" style={{ fontWeight: 700, color: "var(--muted)" }}>
                <span className="dot" style={{ background: teamA?.color, opacity: 0.45 }} />
                <span className="wide">{teamA?.name}</span>
                <span className="matchup-vs">vs</span>
                <span className="dot" style={{ background: teamB?.color, opacity: 0.45 }} />
                <span className="wide">{teamB?.name}</span>
              </div>
              {Array.from({ length: seats }, (_, s) => (
                <div className="field" key={s}>
                  <span className="dot" style={{ background: teamA?.color }} />
                  {seatSelect(m, "A", s)}
                  <span className="matchup-vs">vs</span>
                  <span className="dot" style={{ background: teamB?.color }} />
                  {seatSelect(m, "B", s)}
                </div>
              ))}
            </div>
          </section>
        );
      })}

      <div className="section" style={{ paddingTop: 0 }}>
        <p className="hint center">
          {complete
            ? "✓ All golfers slotted — this round's matchups are set."
            : `${emptySeats} empty seat${emptySeats === 1 ? "" : "s"} · ` +
              `${benchA.length + benchB.length} golfer${
                benchA.length + benchB.length === 1 ? "" : "s"
              } on the bench.`}
        </p>
        <Link className="btn" to="/rounds">
          Done
        </Link>
      </div>
    </>
  );
}
