import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useRoundContexts, useStore } from "../store/store";
import { buildFeed, type FeedItem } from "../scoring/activity";
import { computeMatchState } from "../scoring/engine";
import { FeedIcon } from "../components/Icons";
import { CheckFlag } from "../components/CheckFlag";
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

/** Points read nicely with a ½ instead of ".5". */
function fmtPoints(n: number): string {
  const whole = Math.floor(n);
  const half = n - whole >= 0.5;
  if (whole === 0 && half) return "½";
  return `${whole}${half ? "½" : ""}`;
}

/** The score-highlight labels ("net eagle", "net double", …) from net-to-par. */
function scoreLabel(netToPar: number): string {
  if (netToPar <= -3) return "net albatross";
  if (netToPar === -2) return "net eagle";
  if (netToPar === -1) return "net birdie";
  if (netToPar === 2) return "net double bogey";
  if (netToPar === 3) return "net triple bogey";
  if (netToPar >= 4) return `net +${netToPar}`;
  return "net par";
}

export default function TickerPage() {
  const navigate = useNavigate();
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

  // Live board for the round in play (or the most recent finished round).
  const board = useMemo(() => {
    const round =
      state.rounds.find((r) => r.status === "active") ??
      [...state.rounds].reverse().find((r) => r.status === "final");
    if (!round) return null;
    const ctx = contexts[round.id];
    const matches = state.matches
      .filter((m) => m.roundId === round.id)
      .map((m) => ({ m, st: computeMatchState(m, state.players, ctx) }));
    const a = matches.reduce((s, x) => s + x.st.points.a, 0);
    const b = matches.reduce((s, x) => s + x.st.points.b, 0);
    return { round, matches, a, b };
  }, [state.rounds, state.matches, state.players, contexts]);

  const sideNames = (side: Side) =>
    side.playerIds.map((id) => playerMap[id]?.name ?? "?").join(" / ");

  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/");
  };

  const playerName = (id?: string) => (id ? playerMap[id]?.name ?? "Someone" : "Someone");
  const teamName = (id?: string) => (id ? teamMap[id]?.name ?? "A team" : "A team");

  /** Headline for one feed item. */
  const title = (e: FeedItem): string => {
    const who = playerName(e.playerId);
    const team = teamName(e.teamId);
    const other = teamName(e.otherTeamId);
    const subject = e.playerId ? who : team; // scramble items are team-level
    switch (e.kind) {
      case "ace":
        return `${subject} ACED hole ${e.hole}!`;
      case "eagle":
        return `${subject} carded a ${scoreLabel(e.value ?? -2)} on ${e.hole}`;
      case "birdie":
        return `${subject} rolled in a net birdie on ${e.hole}`;
      case "blowup":
        return `${subject} blew up to a ${scoreLabel(e.value ?? 2)} on ${e.hole}`;
      case "matchLead":
        return `${team} took the lead on ${other} — ${e.value} up thru ${e.hole}`;
      case "comeback":
        return `${team} clawed back from ${e.value} down to lead ${other}`;
      case "matchFinal":
        return e.text === "Halved (AS)"
          ? `${team} and ${other} halved their match`
          : `${team} closed out ${other}, ${e.text}`;
      case "overallLead":
        return `${team} grabbed the overall lead — ${fmtPoints(e.value ?? 0)} pts`;
      case "snake":
        return `${who} is stuck with the snake — ${e.value} in the pot`;
      case "mulligan":
        return `${who} took a booze mulligan`;
    }
  };

  /** Sub-line: where it happened + (for timed events) how long ago. */
  const sub = (e: FeedItem): string => {
    const round = roundMap[e.roundId]?.name;
    const parts = [round, e.hole ? `Hole ${e.hole}` : ""].filter(Boolean);
    if (e.kind === "mulligan" && e.ts) parts.push(timeAgo(e.ts, now));
    return parts.join(" · ");
  };

  return (
    <>
      <div className="section" style={{ paddingBottom: 0 }}>
        <button className="badge" onClick={goBack}>
          ← Back
        </button>
        <h2 style={{ marginTop: 10 }}>Activity</h2>
        <p className="hint" style={{ padding: "0 2px 8px" }}>
          Birdies, blow-ups, lead changes and general chaos from around the
          course.
        </p>
      </div>

      {board && (
        <section className="section" style={{ paddingTop: 0 }}>
          <h2>
            {board.round.name}
            {board.round.status === "active" ? (
              <span className="oval live">Live</span>
            ) : (
              <span className="oval">
                <CheckFlag size={9} /> Final
              </span>
            )}
          </h2>
          <div className="card">
            {/* Running team total for the round */}
            <div
              className="row"
              style={{ justifyContent: "center", gap: 10, padding: "4px 0 8px" }}
            >
              <span className="row" style={{ gap: 6 }}>
                <span className="dot" style={{ background: teamMap.tA?.color }} />
                <strong>{teamMap.tA?.name}</strong>
              </span>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 18 }}>
                {fmtPoints(board.a)}–{fmtPoints(board.b)}
              </span>
              <span className="row" style={{ gap: 6 }}>
                <strong>{teamMap.tB?.name}</strong>
                <span className="dot" style={{ background: teamMap.tB?.color }} />
              </span>
            </div>

            {board.matches.map(({ m, st }) => {
              const leadColor =
                st.leader === "A"
                  ? teamMap[m.sideA.teamId]?.color
                  : st.leader === "B"
                    ? teamMap[m.sideB.teamId]?.color
                    : undefined;
              return (
                <Link className="match" key={m.id} to={`/match/${m.id}`}>
                  <div className="sides">
                    <div className="side a">
                      <span className="names">{sideNames(m.sideA)}</span>
                    </div>
                    <div className="status">
                      <div className="result" style={{ color: leadColor }}>
                        {st.thru === 0 ? "—" : st.overall.resultText.replace(/ thru.*/, "")}
                      </div>
                      <div className="lead">
                        {st.thru === 0
                          ? "not started"
                          : `${fmtPoints(st.points.a)}–${fmtPoints(st.points.b)} · ${
                              st.complete ? "final" : `thru ${st.thru}`
                            }`}
                      </div>
                    </div>
                    <div className="side b">
                      <span className="names">{sideNames(m.sideB)}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section className="section" style={{ paddingTop: 0 }}>
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
                    <span className="feed-title">{title(e)}</span>
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
