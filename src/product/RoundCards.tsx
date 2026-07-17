import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FORMAT_REGISTRY } from "../scoring/formats";
import type { Format } from "../types";
import { updateRoundMatches, type RoundWithGame } from "./api";
import type { Course, EventPlayer, Round, RoundMatch, Team } from "./types";
import {
  Card,
  colors,
  displayStyle,
  serifItalicStyle,
  StatusPill,
  buttonStyle,
  ghostButtonStyle,
  inputStyle,
} from "./ui";

// The Rounds tab, in the v1 Red Walleye shape: one card per round; inside it,
// one row per MATCH (team-color dots, side A over side B, status column) —
// and pairings render even when empty (open seats), so the shape of the round
// is visible before anyone is assigned. The organizer fills seats with the
// inline "Set matchups" editor (v1's matchup builder, embedded).

const TEAM_FALLBACK_COLORS = ["#de4f2c", "#1e4a2b"]; // side A orange, side B green (v1)

function seatsFor(format: string | null): number {
  if (!format) return 2;
  const plugin = FORMAT_REGISTRY[format as Format];
  return plugin ? plugin.seatsPerSide : 2;
}

function shortLabel(format: string): string {
  const plugin = FORMAT_REGISTRY[format as Format];
  return plugin ? plugin.labels.short : format;
}

function emptyMatches(format: string | null, playerCount: number): RoundMatch[] {
  const seats = seatsFor(format);
  const count = Math.max(1, Math.floor(playerCount / (2 * seats)));
  return Array.from({ length: count }, () => ({
    sideA: Array.from({ length: seats }, () => null),
    sideB: Array.from({ length: seats }, () => null),
  }));
}

/** The matches to display: saved pairings, else the empty shape. */
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

  const rosterOf = (team: Team | undefined) =>
    team ? players.filter((p) => p.team_id === team.id) : [];

  const openEditor = (round: Round, format: string | null) => {
    const seats = seatsFor(format);
    const current = displayMatches(round, format, playerCount).map((m) => ({
      sideA: Array.from({ length: seats }, (_, i) => m.sideA[i] ?? null),
      sideB: Array.from({ length: seats }, (_, i) => m.sideB[i] ?? null),
    }));
    setDraft(current);
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

  const sideNames = (ids: (string | null)[]) => {
    const filled = ids.map((id) => (id ? (nameById.get(id) ?? "?") : null));
    return filled;
  };

  const renderSide = (ids: (string | null)[], color: string) => {
    const names = sideNames(ids);
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: color,
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {names.map((n, i) => (
            <span key={i}>
              {i > 0 && <span style={{ color: colors.muted }}> / </span>}
              {n ? (
                n
              ) : (
                <span style={{ ...serifItalicStyle, color: colors.muted }}>open seat</span>
              )}
            </span>
          ))}
        </span>
      </div>
    );
  };

  /** One seat select for the editor. */
  const seatSelect = (
    team: Team | undefined,
    mi: number,
    side: "sideA" | "sideB",
    si: number,
  ) => {
    const roster = rosterOf(team);
    const usedElsewhere = new Set(
      draft.flatMap((m, i) =>
        m[side === "sideA" ? "sideA" : "sideB"].filter((_, j) => !(i === mi && j === si)),
      ).filter(Boolean) as string[],
    );
    const value = draft[mi]?.[side][si] ?? "";
    return (
      <select
        key={`${mi}-${side}-${si}`}
        aria-label={`Match ${mi + 1} ${side === "sideA" ? teamA?.name : teamB?.name} seat ${si + 1}`}
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
    <>
      {rounds.length === 0 && (
        <Card>
          <p style={{ color: colors.muted, fontSize: 14, margin: 0 }}>The schedule isn't set yet.</p>
        </Card>
      )}

      {rounds.map(({ round, game }, i) => {
        const format = game?.type ?? null;
        const configured = Boolean(game && round.course_id);
        const matches = displayMatches(round, format, playerCount);
        const editing = editingId === round.id;
        const colorA = teamA?.color ?? TEAM_FALLBACK_COLORS[0];
        const colorB = teamB?.color ?? TEAM_FALLBACK_COLORS[1];
        const hasAssignments =
          rosterOf(teamA).length > 0 || rosterOf(teamB).length > 0;

        return (
          <Card key={round.id}>
            {/* Head — round name, format oval, status */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ ...displayStyle, fontSize: 17 }}>Round {i + 1}</span>
              {format && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.14em",
                    color: colors.muted,
                    border: "1.5px solid currentColor",
                    borderRadius: 999,
                    padding: "3px 10px",
                  }}
                >
                  {shortLabel(format)}
                </span>
              )}
              <span style={{ flex: 1 }} />
              <StatusPill status={round.status} />
            </div>
            <p style={{ ...serifItalicStyle, color: colors.muted, fontSize: 12.5, margin: "4px 0 0" }}>
              {round.course_id
                ? (courseNameById.get(round.course_id) ?? "course TBD")
                : configured
                  ? "course TBD"
                  : "needs a course & format"}
            </p>

            {/* Match rows */}
            <div style={{ borderTop: `1px solid ${colors.border}`, marginTop: 12 }}>
              {matches.map((m, mi) => (
                <div
                  key={mi}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 0",
                    borderBottom:
                      mi < matches.length - 1 ? `1px solid ${colors.border}` : "none",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                    {renderSide(m.sideA, colorA)}
                    {renderSide(m.sideB, colorB)}
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ ...displayStyle, fontSize: 15, color: colors.muted }}>—</div>
                    <div style={{ ...serifItalicStyle, color: colors.muted, fontSize: 11.5 }}>
                      not started
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Inline matchup editor */}
            {editing && (
              <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 12 }}>
                {!hasAssignments && (
                  <p style={{ color: colors.muted, fontSize: 13, lineHeight: 1.5, margin: "0 0 10px" }}>
                    Nobody is assigned to a team yet — set team rosters first (organizer
                    dashboard → Roster), then pair the matches here.
                  </p>
                )}
                {draft.map((m, mi) => (
                  <div key={mi} style={{ marginBottom: 14 }}>
                    <div style={{ ...serifItalicStyle, color: colors.muted, fontSize: 12.5, marginBottom: 6 }}>
                      match {mi + 1}
                    </div>
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
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void save(round.id)}
                    style={{ ...buttonStyle, flex: 1, opacity: saving ? 0.6 : 1 }}
                  >
                    {saving ? "Saving…" : "Save matchups"}
                  </button>
                  <button type="button" style={ghostButtonStyle} onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Foot — v1 round-card-foot */}
            {!editing && (
              <div
                style={{
                  borderTop: `1px solid ${colors.border}`,
                  paddingTop: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                {isOrganizer && round.status === "pending" && (
                  <button
                    type="button"
                    style={{ ...ghostButtonStyle, width: "100%" }}
                    onClick={() => openEditor(round, format)}
                  >
                    Set matchups
                  </button>
                )}
                {isOrganizer && round.status === "pending" && configured && (
                  <button
                    type="button"
                    disabled={busy}
                    style={{ ...buttonStyle, width: "100%", opacity: busy ? 0.6 : 1 }}
                    onClick={() => onLifecycle(round.id, "start", `Round ${i + 1}`)}
                  >
                    Start Round {i + 1}
                  </button>
                )}
                {round.status !== "pending" && (
                  <Link to={`/e/${eventId}/r/${round.id}`} style={{ textDecoration: "none" }}>
                    <button type="button" style={{ ...ghostButtonStyle, width: "100%" }}>
                      {round.status === "active" ? "Enter scores" : "View scorecard"}
                    </button>
                  </Link>
                )}
                {isOrganizer && round.status === "active" && (
                  <button
                    type="button"
                    disabled={busy}
                    style={{ ...ghostButtonStyle, width: "100%", color: colors.good }}
                    onClick={() => onLifecycle(round.id, "finish", `Round ${i + 1}`)}
                  >
                    Finish Round {i + 1}
                  </button>
                )}
              </div>
            )}

            {error && editing && (
              <p style={{ color: colors.danger, fontSize: 13, marginTop: 10 }}>{error}</p>
            )}
          </Card>
        );
      })}
    </>
  );
}
