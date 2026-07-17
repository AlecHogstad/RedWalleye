import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FORMAT_REGISTRY } from "../scoring/formats";
import type { Format } from "../types";
import { updateRoundMatches, type RoundWithGame } from "./api";
import type { Course, EventPlayer, Round, RoundMatch, Team } from "./types";
import { inputStyle, serifItalicStyle, colors } from "./ui";

// The Rounds tab — the SAME page as v1's RoundsPage: identical markup and the
// global index.css classes (round-card / round-matches / match / sides / oval
// / btn), so a player who gets a link sees the app they'd see in Red Walleye.
// Pairings render even when empty (open seats). The one product addition is
// the inline "Set matchups" editor for the organizer.

const TEAM_FALLBACK_COLORS = ["#de4f2c", "#1e4a2b"]; // side A orange, side B green

function plugin(format: string | null) {
  return format ? (FORMAT_REGISTRY[format as Format] ?? null) : null;
}

function emptyMatches(format: string | null, playerCount: number): RoundMatch[] {
  const seats = plugin(format)?.seatsPerSide ?? 2;
  const count = Math.max(1, Math.floor(playerCount / (2 * seats)));
  return Array.from({ length: count }, () => ({
    sideA: Array.from({ length: seats }, () => null),
    sideB: Array.from({ length: seats }, () => null),
  }));
}

function displayMatches(round: Round, format: string | null, playerCount: number): RoundMatch[] {
  if (round.matches_json && round.matches_json.length > 0) return round.matches_json;
  return emptyMatches(format, playerCount);
}

export default function RoundCards({
  eventId,
  expectedPlayers,
  rounds,
  teams,
  players,
  courses,
  isOrganizer,
  busy,
  onLifecycle,
  onRoundUpdated,
}: {
  eventId: string;
  expectedPlayers: number | null;
  rounds: RoundWithGame[];
  teams: Team[];
  players: EventPlayer[]; // active roster
  courses: Course[];
  isOrganizer: boolean;
  busy: boolean;
  onLifecycle: (roundId: string, action: "start" | "finish", label: string) => void;
  onRoundUpdated: (round: Round) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<RoundMatch[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameById = useMemo(() => new Map(players.map((p) => [p.id, p.name])), [players]);
  const courseNameById = useMemo(() => new Map(courses.map((c) => [c.id, c.name])), [courses]);
  const teamA = teams[0];
  const teamB = teams[1];
  const playerCount = expectedPlayers ?? players.length;
  const anyActive = rounds.some(({ round }) => round.status === "active");

  const rosterOf = (team: Team | undefined) =>
    team ? players.filter((p) => p.team_id === team.id) : [];

  const openEditor = (round: Round, format: string | null) => {
    const seats = plugin(format)?.seatsPerSide ?? 2;
    setDraft(
      displayMatches(round, format, playerCount).map((m) => ({
        sideA: Array.from({ length: seats }, (_, i) => m.sideA[i] ?? null),
        sideB: Array.from({ length: seats }, (_, i) => m.sideB[i] ?? null),
      })),
    );
    setEditingId(round.id);
    setError(null);
  };

  const setSeat = (mi: number, side: "sideA" | "sideB", si: number, value: string) => {
    setDraft((prev) =>
      prev.map((m, i) =>
        i === mi ? { ...m, [side]: m[side].map((s, j) => (j === si ? value || null : s)) } : m,
      ),
    );
  };

  const save = async (roundId: string) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateRoundMatches(roundId, draft);
      onRoundUpdated(updated);
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  /** " / "-joined names, v1 style; open seats in the italic accent voice. */
  const sideNames = (ids: (string | null)[]) => (
    <>
      {ids.map((id, i) => (
        <span key={i}>
          {i > 0 && " / "}
          {id ? (
            (nameById.get(id) ?? "?")
          ) : (
            <em style={{ ...serifItalicStyle, color: colors.muted }}>open</em>
          )}
        </span>
      ))}
    </>
  );

  const seatSelect = (team: Team | undefined, mi: number, side: "sideA" | "sideB", si: number) => {
    const roster = rosterOf(team);
    const usedElsewhere = new Set(
      draft
        .flatMap((m, i) => m[side].filter((_, j) => !(i === mi && j === si)))
        .filter(Boolean) as string[],
    );
    const value = draft[mi]?.[side][si] ?? "";
    return (
      <select
        key={`${mi}-${side}-${si}`}
        aria-label={`Match ${mi + 1} ${side === "sideA" ? (teamA?.name ?? "A") : (teamB?.name ?? "B")} seat ${si + 1}`}
        style={{ ...inputStyle, padding: "8px 10px", fontSize: 13 }}
        value={value ?? ""}
        onChange={(e) => setSeat(mi, side, si, e.target.value)}
      >
        <option value="">— open seat —</option>
        {roster
          .filter((p) => p.id === value || !usedElsewhere.has(p.id))
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
      </select>
    );
  };

  return (
    <div className="rounds-page">
      {rounds.map(({ round, game }, i) => {
        const format = game?.type ?? null;
        const pg = plugin(format);
        const configured = Boolean(game && round.course_id);
        const matches = displayMatches(round, format, playerCount);
        const editing = editingId === round.id;
        const colorA = teamA?.color ?? TEAM_FALLBACK_COLORS[0];
        const colorB = teamB?.color ?? TEAM_FALLBACK_COLORS[1];
        const locked = round.status === "pending" && anyActive;
        const startable =
          isOrganizer && round.status === "pending" && configured && !anyActive;

        const matchBody = (m: RoundMatch) => (
          <div className="sides">
            <div className="side a">
              <div className="row" style={{ gap: 6 }}>
                <span className="dot" style={{ background: colorA }} />
                <span className="names">{sideNames(m.sideA)}</span>
              </div>
            </div>
            <div className="status">
              <div className="result">—</div>
              <div className="lead">{round.status === "pending" ? "not started" : "no scores yet"}</div>
            </div>
            <div className="side b">
              <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                <span className="names">{sideNames(m.sideB)}</span>
                <span className="dot" style={{ background: colorB }} />
              </div>
            </div>
          </div>
        );

        return (
          <section className="section" key={round.id}>
            <div className={`round-card card ${round.status === "pending" ? "dimmed" : ""}`}>
              <div className="round-card-head">
                <h2>
                  Round {i + 1}
                  {pg ? `: ${pg.labels.long}` : ""}
                  {round.status === "active" && <span className="oval live">In-Progress</span>}
                  {round.status === "final" && <span className="oval">Final</span>}
                  {locked && <span className="oval muted-oval">Locked</span>}
                </h2>
                <p className="round-where round-meta-row">
                  <span>
                    {round.course_id
                      ? (courseNameById.get(round.course_id) ?? "")
                      : configured
                        ? ""
                        : "Course & format not set yet"}
                  </span>
                </p>
              </div>

              <div className="round-matches">
                {matches.map((m, mi) =>
                  round.status === "pending" ? (
                    <div className="match" key={mi}>
                      {matchBody(m)}
                    </div>
                  ) : (
                    <Link className="match" key={mi} to={`/e/${eventId}/r/${round.id}`}>
                      {matchBody(m)}
                    </Link>
                  ),
                )}
              </div>

              {editing && (
                <div style={{ borderTop: "1px solid var(--line)", padding: "12px 16px 14px" }}>
                  {rosterOf(teamA).length === 0 && rosterOf(teamB).length === 0 && (
                    <p className="hint" style={{ padding: "0 0 10px" }}>
                      Nobody is assigned to a team yet — set team rosters on the organizer
                      dashboard first.
                    </p>
                  )}
                  {draft.map((m, mi) => (
                    <div key={mi} style={{ marginBottom: 14 }}>
                      <p className="hint" style={{ padding: "0 0 6px" }}>
                        match {mi + 1}
                      </p>
                      <div style={{ display: "flex", gap: 10 }}>
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                          {m.sideA.map((_, si) => seatSelect(teamA, mi, "sideA", si))}
                        </div>
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                          {m.sideB.map((_, si) => seatSelect(teamB, mi, "sideB", si))}
                        </div>
                      </div>
                    </div>
                  ))}
                  {error && (
                    <p style={{ color: "var(--orange)", fontSize: 13, margin: "0 0 10px" }}>{error}</p>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <button
                      className="btn start"
                      disabled={saving}
                      onClick={() => void save(round.id)}
                    >
                      {saving ? "Saving…" : "Save matchups"}
                    </button>
                    <button className="btn ghost start" onClick={() => setEditingId(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {!editing &&
                (isOrganizer || round.status !== "pending") && (
                  <div className="round-card-foot">
                    {isOrganizer && round.status === "pending" && (
                      <button className="btn ghost start" onClick={() => openEditor(round, format)}>
                        Set matchups
                      </button>
                    )}
                    {startable && (
                      <button
                        className="btn start"
                        disabled={busy}
                        onClick={() => onLifecycle(round.id, "start", `Round ${i + 1}`)}
                      >
                        Start Round {i + 1}
                      </button>
                    )}
                    {round.status !== "pending" && (
                      <Link className="btn ghost start" to={`/e/${eventId}/r/${round.id}`}>
                        {round.status === "active" ? "Enter scores" : "View scorecard"}
                      </Link>
                    )}
                    {isOrganizer && round.status === "active" && (
                      <button
                        className="btn ghost start"
                        disabled={busy}
                        onClick={() => onLifecycle(round.id, "finish", `Round ${i + 1}`)}
                      >
                        Finish Round {i + 1}
                      </button>
                    )}
                  </div>
                )}
            </div>
          </section>
        );
      })}
      {rounds.length === 0 && <p className="hint center">The schedule isn't set yet.</p>}
    </div>
  );
}
