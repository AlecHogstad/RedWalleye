import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useRoundContexts, useStore } from "../store/store";
import { buildFeed, type FeedItem } from "../scoring/activity";
import { feedHeadline, feedSubline, fmtFeedPoints, type FeedCopyContext } from "../scoring/feedCopy";
import {
  computeMatchState,
  computeScrambleGroupTotal,
  computeScramblePlacement,
  formatScrambleGroup,
  isScrambleFieldMatch,
  scrambleGroupNum,
  scrambleGroupPlacementPoints,
  teamScoreKey,
} from "../scoring/engine";
import { FeedIcon } from "../components/Icons";
import { resolveMediaUrl } from "../sync/media";
import type { Side } from "../types";

/** Compact relative time for the few events that carry a real clock. */
function timeAgo(ts: number, now: number): string {
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Compact Nassau-segment result: "AS", "A 2", "B 1", or "–" before it starts. */
function segText(seg: {
  thru: number;
  winner: "A" | "B" | "halve" | null;
  leader: "A" | "B" | null;
  margin: number;
}): string {
  if (seg.thru === 0) return "–";
  if (seg.winner === "halve") return "AS";
  if (!seg.leader) return "AS";
  return `${seg.leader} ${seg.margin}`;
}

export default function TickerPage() {
  const { state } = useStore();
  const contexts = useRoundContexts();
  const now = Date.now();
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const playerMap = useMemo(
    () => Object.fromEntries(state.players.map((p) => [p.id, p])),
    [state.players],
  );
  const teamMap = useMemo(
    () => Object.fromEntries(state.teams.map((t) => [t.id, t])),
    [state.teams],
  );
  const roundMap = useMemo(
    () => Object.fromEntries(state.rounds.map((r) => [r.id, r])),
    [state.rounds],
  );

  const feed = useMemo(
    () => buildFeed(state, contexts),
    [state, contexts],
  );

  // Live scorecard for the round currently being played — nothing when none is
  // active (finished rounds live on the Rounds tab).
  const board = useMemo(() => {
    const round = state.rounds.find((r) => r.status === "active");
    if (!round) return null;
    const ctx = contexts[round.id];
    const roundMatches = state.matches.filter((m) => m.roundId === round.id);
    const scramble = roundMatches.some(isScrambleFieldMatch);
    const matches = roundMatches.map((m) => ({
      m,
      st: computeMatchState(m, state.players, ctx),
      group: scramble ? computeScrambleGroupTotal(m, ctx) : null,
      placement: scramble ? scrambleGroupPlacementPoints(m, roundMatches, ctx) : null,
    }));

    let a = 0;
    let b = 0;
    if (scramble) {
      // Placement points accrue to each foursome's team (resolves once all four
      // groups finish; 0–0 while the round is still in progress).
      const placement = computeScramblePlacement(roundMatches, ctx);
      for (const m of roundMatches) {
        const pts = placement.get(m.id) ?? 0;
        if (m.sideA.teamId === "tA") a += pts;
        else b += pts;
      }
    } else {
      a = matches.reduce((s, x) => s + x.st.points.a, 0);
      b = matches.reduce((s, x) => s + x.st.points.b, 0);
    }
    return { round, matches, a, b, holes: ctx.course.holes, scramble };
  }, [state.rounds, state.matches, state.players, contexts]);

  const [tab, setTab] = useState<"scorecard" | "feed">(() =>
    state.rounds.some((r) => r.status === "active") ? "scorecard" : "feed",
  );

  const sideNames = (side: Side) =>
    side.playerIds.map((id) => playerMap[id]?.name ?? "?").join(" / ");

  const feedCopy = useMemo(
    (): FeedCopyContext => ({
      playerName: (id?: string) => (id ? playerMap[id]?.name ?? "Someone" : "Someone"),
      teamName: (id?: string) => (id ? teamMap[id]?.name ?? "A team" : "A team"),
      scrambleGroupLabel: (matchId?: string) => {
        if (!matchId) return null;
        const m = state.matches.find((x) => x.id === matchId);
        if (!m) return null;
        const roundMatches = state.matches.filter((rm) => rm.roundId === m.roundId);
        const n = scrambleGroupNum(matchId, roundMatches);
        return n ? formatScrambleGroup(n) : null;
      },
    }),
    [state.matches, playerMap, teamMap],
  );

  /** Sub-line: round, team/group/hole, and mulligan timing. */
  const sub = (e: FeedItem): string => {
    const parts = [roundMap[e.roundId]?.name, feedSubline(e, feedCopy)].filter(Boolean);
    if (e.kind === "mulligan" && e.ts) parts.push(timeAgo(e.ts, now));
    return parts.join(" · ");
  };

  return (
    <>
      <div className="section" style={{ paddingBottom: 0 }}>
        <div className="segmented">
          <button
            className={`seg ${tab === "scorecard" ? "active" : ""}`}
            onClick={() => setTab("scorecard")}
          >
            Scorecard
          </button>
          <button
            className={`seg ${tab === "feed" ? "active" : ""}`}
            onClick={() => setTab("feed")}
          >
            Feed
          </button>
        </div>
      </div>

      {tab === "scorecard" &&
        (board ? (
          <>
            <section className="section" style={{ paddingTop: 4 }}>
              <h2>
                {board.round.name}
                <span className="oval live">Live</span>
              </h2>
              <div className="card">
                <div
                  className="row"
                  style={{ justifyContent: "center", gap: 10, padding: "4px 0" }}
                >
                  <span className="row" style={{ gap: 6 }}>
                    <span className="dot" style={{ background: teamMap.tA?.color }} />
                    <strong>{teamMap.tA?.name}</strong>
                  </span>
                  <span style={{ fontFamily: "var(--font-display)", fontSize: 18 }}>
                    {fmtFeedPoints(board.a)}–{fmtFeedPoints(board.b)}
                  </span>
                  <span className="row" style={{ gap: 6 }}>
                    <strong>{teamMap.tB?.name}</strong>
                    <span className="dot" style={{ background: teamMap.tB?.color }} />
                  </span>
                </div>
              </div>
            </section>

            {board.matches.map(({ m, st, group, placement }) => {
              const colorA = teamMap[m.sideA.teamId]?.color;

              // Scramble foursome: one gross row vs the field (no head-to-head).
              if (board.scramble) {
                const key = teamScoreKey(m.sideA.teamId);
                const grossByHole = m.scores[key] ?? {};
                return (
                  <section className="section" style={{ paddingTop: 0 }} key={m.id}>
                    <div className="card" style={{ padding: "12px 0" }}>
                      <Link
                        to={`/match/${m.id}`}
                        className="row"
                        style={{
                          justifyContent: "space-between",
                          alignItems: "baseline",
                          gap: 8,
                          padding: "0 14px 6px",
                        }}
                      >
                        <span className="names" style={{ flex: 1, minWidth: 0 }}>
                          {sideNames(m.sideA)}
                        </span>
                        <span
                          style={{
                            fontFamily: "var(--font-display)",
                            fontSize: 14,
                            color: colorA,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {group && group.thru > 0 ? group.gross : "—"}
                        </span>
                      </Link>
                      <div className="hint" style={{ textAlign: "center", margin: "0 0 8px" }}>
                        {group && group.thru > 0
                          ? group.complete
                            ? `Gross ${group.gross} · 18 holes`
                            : `Gross ${group.gross} · thru ${group.thru}`
                          : "not started"}
                        {placement != null && ` · ${fmtFeedPoints(placement)} pts`}
                      </div>

                      <div className="scorecard-wrap">
                        <table className="scorecard">
                          <thead>
                            <tr>
                              <th className="lbl">Hole</th>
                              {board.holes.map((h) => (
                                <th key={h.number}>{h.number}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="par-row">
                              <th className="lbl">Par</th>
                              {board.holes.map((h) => (
                                <td key={h.number}>{h.par}</td>
                              ))}
                            </tr>
                            <tr>
                              <th className="lbl">
                                <span className="dot" style={{ background: colorA }} />
                                {teamMap[m.sideA.teamId]?.name}
                              </th>
                              {board.holes.map((h) => (
                                <td key={h.number}>{grossByHole[h.number] ?? "–"}</td>
                              ))}
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </section>
                );
              }

              // Four-ball: head-to-head net counting ball per hole.
              const colorB = teamMap[m.sideB.teamId]?.color;
              const leadColor =
                st.leader === "A" ? colorA : st.leader === "B" ? colorB : undefined;
              const byHole = new Map(st.perHole.map((p) => [p.hole, p]));
              return (
                <section className="section" style={{ paddingTop: 0 }} key={m.id}>
                  <div className="card" style={{ padding: "12px 0" }}>
                    <Link
                      to={`/match/${m.id}`}
                      className="row"
                      style={{
                        justifyContent: "space-between",
                        alignItems: "baseline",
                        gap: 8,
                        padding: "0 14px 6px",
                      }}
                    >
                      <span className="names" style={{ flex: 1, minWidth: 0 }}>
                        {sideNames(m.sideA)}
                      </span>
                      <span
                        style={{
                          fontFamily: "var(--font-display)",
                          fontSize: 14,
                          color: leadColor,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {st.thru === 0 ? "—" : st.overall.resultText.replace(/ thru.*/, "")}
                      </span>
                      <span
                        className="names"
                        style={{ flex: 1, minWidth: 0, textAlign: "right" }}
                      >
                        {sideNames(m.sideB)}
                      </span>
                    </Link>
                    <div className="hint" style={{ textAlign: "center", margin: "0 0 8px" }}>
                      F {segText(st.front)} · B {segText(st.back)} · M {segText(st.overall)} ·{" "}
                      {fmtFeedPoints(st.points.a)}–{fmtFeedPoints(st.points.b)} pts
                    </div>

                    <div className="scorecard-wrap">
                      <table className="scorecard">
                        <thead>
                          <tr>
                            <th className="lbl">Hole</th>
                            {board.holes.map((h) => (
                              <th key={h.number}>{h.number}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="par-row">
                            <th className="lbl">Par</th>
                            {board.holes.map((h) => (
                              <td key={h.number}>{h.par}</td>
                            ))}
                          </tr>
                          <tr>
                            <th className="lbl">
                              <span className="dot" style={{ background: colorA }} />
                              {teamMap[m.sideA.teamId]?.name}
                            </th>
                            {board.holes.map((h) => {
                              const p = byHole.get(h.number);
                              return (
                                <td
                                  key={h.number}
                                  style={p?.winner === "A" ? { background: `${colorA}33` } : undefined}
                                >
                                  {p?.netA ?? "–"}
                                </td>
                              );
                            })}
                          </tr>
                          <tr>
                            <th className="lbl">
                              <span className="dot" style={{ background: colorB }} />
                              {teamMap[m.sideB.teamId]?.name}
                            </th>
                            {board.holes.map((h) => {
                              const p = byHole.get(h.number);
                              return (
                                <td
                                  key={h.number}
                                  style={p?.winner === "B" ? { background: `${colorB}33` } : undefined}
                                >
                                  {p?.netB ?? "–"}
                                </td>
                              );
                            })}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </section>
              );
            })}
          </>
        ) : (
          <div className="section">
            <p className="hint center">
              No round is live right now — the scorecard shows up while a round
              is being played.
            </p>
          </div>
        ))}

      {tab === "feed" && (
        <section className="section" style={{ paddingTop: 4 }}>
          <div className="card">
            <ul className="ticker-feed">
              {feed.length === 0 && (
                <li className="ticker-feed-empty">
                  Nothing yet — once scores start rolling in, the action shows up
                  here.
                </li>
              )}
              {feed.map((e) => {
                const team = teamMap[e.teamId ?? ""];
                const mediaUrl =
                  e.kind === "mulligan" && e.mediaPath
                    ? resolveMediaUrl(e.mediaPath)
                    : null;
                return (
                  <li className="feed-item" key={e.id}>
                    <span className="feed-icon">
                      <FeedIcon kind={e.kind} />
                    </span>
                    <span className="feed-text">
                      <span className="feed-title">{feedHeadline(e, feedCopy)}</span>
                      <span className="feed-sub">
                        {team && (
                          <span
                            className="feed-dot"
                            style={{ background: team.color }}
                          />
                        )}
                        {sub(e)}
                      </span>
                      {e.kind === "mulligan" && e.mediaStatus === "pending" && !mediaUrl && (
                        <span className="feed-media-pending">Uploading photo…</span>
                      )}
                      {mediaUrl && (
                        <button
                          type="button"
                          className="feed-mulligan-photo-btn"
                          onClick={() => setLightboxUrl(mediaUrl)}
                        >
                          <img
                            src={mediaUrl}
                            alt=""
                            className="feed-mulligan-photo"
                          />
                        </button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      {lightboxUrl && (
        <div
          className="media-lightbox"
          role="dialog"
          aria-label="Mulligan photo"
          onClick={() => setLightboxUrl(null)}
        >
          <img src={lightboxUrl} alt="Mulligan proof" className="media-lightbox-img" />
        </div>
      )}
    </>
  );
}
