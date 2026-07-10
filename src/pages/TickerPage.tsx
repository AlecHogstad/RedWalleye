import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useRoundContexts, useStore } from "../store/store";
import { buildFeed, type FeedItem } from "../scoring/activity";
import { feedHeadline, feedSubline, fmtFeedPoints, type FeedCopyContext } from "../scoring/feedCopy";
import {
  allocateStrokes,
  computeMatchState,
  computeScrambleGroupTotal,
  computeScramblePlacement,
  formatScrambleGroup,
  formatStrokesToPar,
  isScrambleFieldMatch,
  scrambleGroupNum,
  strokesOnHole,
  teamScoreKey,
} from "../scoring/engine";
import { FeedIcon } from "../components/Icons";
import { resolveMediaUrl } from "../sync/media";
import type { ActivityEvent, Hole, Side } from "../types";

type SumSegment = "front" | "back" | "total";

type ScorecardCol =
  | { kind: "hole"; hole: Hole }
  | { kind: "sum"; segment: SumSegment };

function buildScorecardCols(holes: Hole[]): ScorecardCol[] {
  const cols: ScorecardCol[] = [];
  for (const h of holes) {
    cols.push({ kind: "hole", hole: h });
    if (h.number === 9) cols.push({ kind: "sum", segment: "front" });
    if (h.number === 18) cols.push({ kind: "sum", segment: "back" });
  }
  cols.push({ kind: "sum", segment: "total" });
  return cols;
}

function sumColLabel(segment: SumSegment): string {
  if (segment === "front") return "Out";
  if (segment === "back") return "In";
  return "Tot";
}

function sumColClass(segment: SumSegment, extra?: string): string {
  const classes = ["sum-col"];
  if (segment === "front") classes.push("sum-col-out");
  if (extra) classes.push(extra);
  return classes.join(" ");
}

function holesInSegment(holes: Hole[], segment: SumSegment): Hole[] {
  if (segment === "front") return holes.filter((h) => h.number <= 9);
  if (segment === "back") return holes.filter((h) => h.number >= 10);
  return holes;
}

function sumPar(holes: Hole[], segment: SumSegment): number {
  return holesInSegment(holes, segment).reduce((s, h) => s + h.par, 0);
}

function sumScores(
  byHole: Record<number, number | undefined>,
  holes: Hole[],
  segment: SumSegment,
): number | null {
  let sum = 0;
  let any = false;
  for (const h of holesInSegment(holes, segment)) {
    const s = byHole[h.number];
    if (s != null) {
      sum += s;
      any = true;
    }
  }
  return any ? sum : null;
}

function sumMulligans(
  matchId: string,
  holes: Hole[],
  segment: SumSegment,
  activity: ActivityEvent[],
): string {
  let sum = 0;
  for (const h of holesInSegment(holes, segment)) {
    sum += activity.filter(
      (e) => e.type === "mulligan" && e.matchId === matchId && e.hole === h.number,
    ).length;
  }
  return sum > 0 ? String(sum) : "–";
}

/** Sum one player's net scores across a segment (four-ball scorecard). */
function sumPlayerNet(
  netByHole: Record<number, number | null>,
  holes: Hole[],
  segment: SumSegment,
): number | null {
  let sum = 0;
  let any = false;
  for (const h of holesInSegment(holes, segment)) {
    const v = netByHole[h.number];
    if (v != null) {
      sum += v;
      any = true;
    }
  }
  return any ? sum : null;
}

/** Mulligans taken on a hole (scramble scorecard). */
function mulliganCountOnHole(
  matchId: string,
  hole: number,
  activity: ActivityEvent[],
): string {
  const count = activity.filter(
    (e) => e.type === "mulligan" && e.matchId === matchId && e.hole === hole,
  ).length;
  return count > 0 ? String(count) : "–";
}

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

/** How many feed moments to show at first, and how many more each "show
 *  earlier" tap reveals — so a multi-day trip doesn't render an endless
 *  scroll of every birdie. */
const FEED_INITIAL = 100;
const FEED_STEP = 50;

export default function TickerPage() {
  const { state } = useStore();
  const contexts = useRoundContexts();
  const now = Date.now();
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [feedShown, setFeedShown] = useState(FEED_INITIAL);

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
              {!board.scramble && (
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
              )}
            </section>

            {board.matches.map(({ m, st, group }) => {
              const colorA = teamMap[m.sideA.teamId]?.color;
              const cols = buildScorecardCols(board.holes);

              // Scramble foursome: one gross row vs the field (no head-to-head).
              if (board.scramble) {
                const key = teamScoreKey(m.sideA.teamId);
                const grossByHole = m.scores[key] ?? {};
                const roundMatches = state.matches.filter((rm) => rm.roundId === m.roundId);
                const groupNum = scrambleGroupNum(m.id, roundMatches);
                const groupLabel = groupNum ? formatScrambleGroup(groupNum) : null;
                const teamName = teamMap[m.sideA.teamId]?.name;
                return (
                  <section className="section ticker-match-section" key={m.id}>
                    <div className="card ticker-score-card">
                      <Link to={`/match/${m.id}`} className="ticker-score-head">
                        <div className="ticker-score-copy">
                          {(teamName || groupLabel) && (
                            <span className="ticker-score-slot">
                              {teamName && (
                                <span style={{ color: colorA }}>{teamName}</span>
                              )}
                              {teamName && groupLabel && " · "}
                              {groupLabel}
                            </span>
                          )}
                          <span className="ticker-score-players">{sideNames(m.sideA)}</span>
                        </div>
                        <span
                          className="ticker-score-value"
                          style={{ color: colorA }}
                        >
                          {group && group.thru > 0 ? formatStrokesToPar(group.toPar) : "—"}
                        </span>
                      </Link>

                      <div className="scorecard-wrap ticker-score-table">
                        <table className="scorecard">
                          <thead>
                            <tr>
                              <th className="lbl">Hole</th>
                              {cols.map((col) =>
                                col.kind === "hole" ? (
                                  <th key={col.hole.number}>{col.hole.number}</th>
                                ) : (
                                  <th key={`sum-${col.segment}`} className={sumColClass(col.segment)}>
                                    {sumColLabel(col.segment)}
                                  </th>
                                ),
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="par-row">
                              <th className="lbl">Par</th>
                              {cols.map((col) =>
                                col.kind === "hole" ? (
                                  <td key={col.hole.number}>{col.hole.par}</td>
                                ) : (
                                  <td key={`sum-${col.segment}`} className={sumColClass(col.segment)}>
                                    {sumPar(board.holes, col.segment)}
                                  </td>
                                ),
                              )}
                            </tr>
                            <tr className="team-row">
                              <th className="lbl lbl-meta">Score</th>
                              {cols.map((col) => {
                                if (col.kind === "hole") {
                                  const score = grossByHole[col.hole.number];
                                  return (
                                    <td
                                      key={col.hole.number}
                                      className={score != null ? "score-entered" : undefined}
                                    >
                                      {score ?? "–"}
                                    </td>
                                  );
                                }
                                const total = sumScores(grossByHole, board.holes, col.segment);
                                return (
                                  <td
                                    key={`sum-${col.segment}`}
                                    className={sumColClass(
                                      col.segment,
                                      total != null ? "score-entered" : undefined,
                                    )}
                                  >
                                    {total ?? "–"}
                                  </td>
                                );
                              })}
                            </tr>
                            <tr className="mulligan-row">
                              <th className="lbl">Mulligan</th>
                              {cols.map((col) =>
                                col.kind === "hole" ? (
                                  <td key={col.hole.number}>
                                    {mulliganCountOnHole(m.id, col.hole.number, state.activity)}
                                  </td>
                                ) : (
                                  <td key={`sum-${col.segment}`} className={sumColClass(col.segment)}>
                                    {sumMulligans(m.id, board.holes, col.segment, state.activity)}
                                  </td>
                                ),
                              )}
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

              // Per-player net scores (best net still counts for the side, but
              // every golfer's ball shows on its own row). Strokes come off the
              // same match-relative allocation the team rows use.
              const roundCtx = contexts[m.roundId];
              const alloc = allocateStrokes(m, state.players, roundCtx);
              const playerNet = (pid: string): Record<number, number | null> => {
                const strokes = alloc.byPlayer[pid] ?? 0;
                const out: Record<number, number | null> = {};
                for (const h of board.holes) {
                  const g = m.scores[pid]?.[h.number];
                  out[h.number] =
                    g == null ? null : g - strokesOnHole(strokes, h.strokeIndex);
                }
                return out;
              };
              const playerRows = [
                ...m.sideA.playerIds.map((pid) => ({
                  side: "A" as const,
                  pid,
                  color: colorA,
                  net: playerNet(pid),
                })),
                ...m.sideB.playerIds.map((pid) => ({
                  side: "B" as const,
                  pid,
                  color: colorB,
                  net: playerNet(pid),
                })),
              ];
              return (
                <section className="section ticker-match-section" key={m.id}>
                  <div className="card ticker-score-card">
                    <Link to={`/match/${m.id}`} className="ticker-score-head ticker-score-head--match">
                      <span className="ticker-score-players">{sideNames(m.sideA)}</span>
                      <span
                        className="ticker-score-value ticker-score-value--match"
                        style={{ color: leadColor }}
                      >
                        {st.thru === 0 ? "—" : st.overall.resultText.replace(/ thru.*/, "")}
                      </span>
                      <span className="ticker-score-players ticker-score-players--right">
                        {sideNames(m.sideB)}
                      </span>
                    </Link>
                    <p className="ticker-score-nassau">
                      F {segText(st.front)} · B {segText(st.back)} · M {segText(st.overall)} ·{" "}
                      {fmtFeedPoints(st.points.a)}–{fmtFeedPoints(st.points.b)} pts
                    </p>

                    <div className="scorecard-wrap ticker-score-table">
                      <table className="scorecard">
                        <thead>
                          <tr>
                            <th className="lbl">Hole</th>
                            {cols.map((col) =>
                              col.kind === "hole" ? (
                                <th key={col.hole.number}>{col.hole.number}</th>
                              ) : (
                                <th key={`sum-${col.segment}`} className={sumColClass(col.segment)}>
                                  {sumColLabel(col.segment)}
                                </th>
                              ),
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="par-row">
                            <th className="lbl">Par</th>
                            {cols.map((col) =>
                              col.kind === "hole" ? (
                                <td key={col.hole.number}>{col.hole.par}</td>
                              ) : (
                                <td key={`sum-${col.segment}`} className={sumColClass(col.segment)}>
                                  {sumPar(board.holes, col.segment)}
                                </td>
                              ),
                            )}
                          </tr>
                          {playerRows.map((row) => (
                            <tr className="team-row" key={`${row.side}:${row.pid}`}>
                              <th className="lbl" style={{ color: row.color }}>
                                {playerMap[row.pid]?.name ?? "?"}
                              </th>
                              {cols.map((col) => {
                                if (col.kind === "hole") {
                                  const net = row.net[col.hole.number];
                                  const p = byHole.get(col.hole.number);
                                  // Highlight the ball that won the hole for its side.
                                  const counting =
                                    net != null &&
                                    ((row.side === "A" &&
                                      p?.winner === "A" &&
                                      net === p?.netA) ||
                                      (row.side === "B" &&
                                        p?.winner === "B" &&
                                        net === p?.netB));
                                  return (
                                    <td
                                      key={col.hole.number}
                                      className={net != null ? "score-entered" : undefined}
                                      style={
                                        counting
                                          ? { background: `${row.color}22` }
                                          : undefined
                                      }
                                    >
                                      {net ?? "–"}
                                    </td>
                                  );
                                }
                                const total = sumPlayerNet(row.net, board.holes, col.segment);
                                return (
                                  <td
                                    key={`sum-${col.segment}`}
                                    className={sumColClass(
                                      col.segment,
                                      total != null ? "score-entered" : undefined,
                                    )}
                                  >
                                    {total ?? "–"}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
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
              {feed.slice(0, feedShown).map((e) => {
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
            {feed.length > feedShown && (
              <button
                type="button"
                className="feed-more"
                onClick={() => setFeedShown((n) => n + FEED_STEP)}
              >
                Show earlier moments ({feed.length - feedShown} more)
              </button>
            )}
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
