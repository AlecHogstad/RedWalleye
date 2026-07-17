import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FORMAT_REGISTRY } from "../scoring/formats";
import type { Format } from "../types";
import {
  ensureSession,
  currentUserId,
  getEventById,
  listEventPlayers,
  listEventRounds,
  listRoundPlayers,
  listScores,
  upsertScore,
} from "./api";
import type { EventPlayer, EventRow, Round, RoundPlayer, Score } from "./types";
import { Page, Card, colors, ghostButtonStyle, StatusPill } from "./ui";

// The round scorecard — every player in the round with their running total;
// expand a row for hole-by-hole entry. A player edits their OWN row; the
// organizer can edit anyone's (gap-filling / corrections). Writes go straight
// to `scores` (RLS: owns_round_player / can_manage_round); reads refresh on a
// short poll so the group sees each other's numbers come in.

const POLL_MS = 15_000;

function formatLabel(id: string): string {
  const plugin = FORMAT_REGISTRY[id as Format];
  return plugin ? plugin.labels.long : id;
}

export default function ScorecardPage() {
  const { eventId = "", roundId = "" } = useParams<{ eventId: string; roundId: string }>();
  const [event, setEvent] = useState<EventRow | null | undefined>(undefined);
  const [round, setRound] = useState<Round | null>(null);
  const [formatId, setFormatId] = useState<string | null>(null);
  const [roundIndex, setRoundIndex] = useState<number>(0);
  const [players, setPlayers] = useState<EventPlayer[]>([]);
  const [roundPlayers, setRoundPlayers] = useState<RoundPlayer[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [uid, setUid] = useState<string | null>(null);
  const [openRp, setOpenRp] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshScores = useCallback(async () => {
    const s = await listScores([roundId]);
    setScores(s);
  }, [roundId]);

  useEffect(() => {
    let active = true;
    (async () => {
      await ensureSession();
      const [ev, me] = await Promise.all([getEventById(eventId), currentUserId()]);
      if (!active) return;
      setEvent(ev);
      setUid(me);
      if (!ev) return;
      const [rounds, p, rp, s] = await Promise.all([
        listEventRounds(eventId),
        listEventPlayers(eventId),
        listRoundPlayers([roundId]),
        listScores([roundId]),
      ]);
      if (!active) return;
      const idx = rounds.findIndex((r) => r.round.id === roundId);
      setRound(idx >= 0 ? rounds[idx].round : null);
      setFormatId(idx >= 0 ? (rounds[idx].game?.type ?? null) : null);
      setRoundIndex(idx);
      setPlayers(p);
      setRoundPlayers(rp);
      setScores(s);
    })().catch((err) => active && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      active = false;
    };
  }, [eventId, roundId]);

  // Keep the card fresh while the group is out playing.
  useEffect(() => {
    const t = window.setInterval(() => void refreshScores().catch(() => {}), POLL_MS);
    const onFocus = () => void refreshScores().catch(() => {});
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshScores]);

  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const myEventPlayerId = useMemo(
    () => players.find((p) => p.claimed_by != null && p.claimed_by === uid)?.id ?? null,
    [players, uid],
  );
  const isOrganizer = event != null && uid != null && uid === event.organizer_id;

  const scoreByRpHole = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const s of scores) m.set(`${s.round_player_id}:${s.hole_number}`, s.strokes);
    return m;
  }, [scores]);

  const setHole = async (rpId: string, hole: number, raw: string) => {
    const strokes = raw === "" ? null : Number(raw);
    if (strokes !== null && (!Number.isInteger(strokes) || strokes < 1 || strokes > 20)) return;
    // Optimistic: show it immediately, reconcile on the next poll.
    setScores((prev) => {
      const rest = prev.filter((s) => !(s.round_player_id === rpId && s.hole_number === hole));
      const existing = prev.find((s) => s.round_player_id === rpId && s.hole_number === hole);
      return [
        ...rest,
        {
          id: existing?.id ?? `tmp-${rpId}-${hole}`,
          round_id: roundId,
          round_player_id: rpId,
          hole_number: hole,
          strokes,
          pickup_flag: false,
          updated_by: uid,
          updated_at: new Date().toISOString(),
        },
      ];
    });
    try {
      await upsertScore({ roundId, roundPlayerId: rpId, hole, strokes });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      void refreshScores().catch(() => {});
    }
  };

  if (error && event === undefined) {
    return (
      <Page center>
        <Card>
          <p style={{ color: colors.danger, fontSize: 14 }}>{error}</p>
        </Card>
      </Page>
    );
  }
  if (event === undefined) {
    return (
      <Page center>
        <p style={{ color: colors.muted, textAlign: "center" }}>Loading…</p>
      </Page>
    );
  }
  if (event === null || round === null) {
    return (
      <Page center>
        <Card>
          <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>No access to this round</h1>
          <p style={{ color: colors.muted, fontSize: 14, lineHeight: 1.6 }}>
            Open the invite link the organizer shared to join first.
          </p>
        </Card>
      </Page>
    );
  }

  const rows = roundPlayers
    .map((rp) => {
      const player = rp.event_player_id ? playerById.get(rp.event_player_id) : undefined;
      let total = 0;
      let thru = 0;
      for (let h = 1; h <= 18; h += 1) {
        const v = scoreByRpHole.get(`${rp.id}:${h}`);
        if (v != null) {
          total += v;
          thru += 1;
        }
      }
      return { rp, name: player?.name ?? "Unknown", total, thru, mine: rp.event_player_id === myEventPlayerId };
    })
    .sort((a, b) => (b.thru - a.thru) || (a.total - b.total) || a.name.localeCompare(b.name));

  const editableRound = round.status === "active";

  return (
    <Page maxWidth={560}>
      <Link to={`/e/${eventId}`} style={{ textDecoration: "none" }}>
        <button type="button" style={{ ...ghostButtonStyle, marginBottom: 20 }}>
          ← {event.name}
        </button>
      </Link>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>
          Round {roundIndex + 1}
          {formatId ? ` · ${formatLabel(formatId)}` : ""}
        </h1>
        <StatusPill status={round.status} />
      </div>
      <p style={{ color: colors.muted, fontSize: 13, margin: "0 0 16px" }}>
        {editableRound
          ? "Tap your row to enter scores hole by hole."
          : round.status === "final"
            ? "Final — scores are locked."
            : "This round hasn't started yet."}
      </p>

      <Card>
        {rows.length === 0 && (
          <p style={{ color: colors.muted, fontSize: 14, margin: 0 }}>
            Nobody is enrolled in this round yet — the organizer starts the round to enroll
            the roster.
          </p>
        )}
        {rows.map(({ rp, name, total, thru, mine }, i) => {
          const canEdit = editableRound && (isOrganizer || mine);
          const open = openRp === rp.id;
          return (
            <div key={rp.id} style={{ borderTop: i === 0 ? "none" : `1px solid ${colors.border}` }}>
              <button
                type="button"
                onClick={() => setOpenRp(open ? null : rp.id)}
                style={{
                  display: "flex",
                  width: "100%",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  background: "none",
                  border: "none",
                  color: colors.text,
                  padding: "12px 2px",
                  fontSize: 15,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span style={{ fontWeight: mine ? 700 : 400 }}>
                  {name}
                  {mine && <span style={{ color: colors.accent }}> · you</span>}
                  {canEdit && (
                    <span style={{ color: colors.muted, fontSize: 12 }}> · tap to score</span>
                  )}
                </span>
                <span style={{ color: colors.muted, fontSize: 13 }}>
                  {thru > 0 ? (
                    <>
                      <strong style={{ color: colors.text, fontSize: 16 }}>{total}</strong> thru {thru}
                    </>
                  ) : (
                    "—"
                  )}
                </span>
              </button>

              {open && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(6, 1fr)",
                    gap: 8,
                    padding: "2px 2px 14px",
                  }}
                >
                  {Array.from({ length: 18 }, (_, h) => h + 1).map((hole) => {
                    const v = scoreByRpHole.get(`${rp.id}:${hole}`);
                    return (
                      <div key={hole}>
                        <div style={{ color: colors.muted, fontSize: 10, textAlign: "center", marginBottom: 2 }}>
                          {hole}
                        </div>
                        <input
                          aria-label={`${name} hole ${hole}`}
                          value={v ?? ""}
                          disabled={!canEdit}
                          onChange={(e) => void setHole(rp.id, hole, e.target.value.replace(/\D/g, "").slice(0, 2))}
                          inputMode="numeric"
                          style={{
                            width: "100%",
                            padding: "8px 0",
                            textAlign: "center",
                            fontSize: 15,
                            borderRadius: 6,
                            border: `1px solid ${colors.border}`,
                            background: canEdit ? "#0f1215" : "transparent",
                            color: colors.text,
                            boxSizing: "border-box",
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </Card>

      {error && <p style={{ color: colors.danger, fontSize: 13, marginTop: 12 }}>{error}</p>}
    </Page>
  );
}
