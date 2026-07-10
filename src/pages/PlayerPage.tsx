import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useRoundContexts, useStore } from "../store/store";
import {
  courseHandicap,
  formatStrokesToPar,
  strokesOnHole,
  teamScoreKey,
  type ScoringContext,
} from "../scoring/engine";
import { FORMAT_LABELS, type Hole, type Match, type Player, type Round } from "../types";

type SumSeg = "front" | "back" | "total";
type Col = { kind: "hole"; hole: Hole } | { kind: "sum"; seg: SumSeg };

function buildCols(holes: Hole[]): Col[] {
  const cols: Col[] = [];
  for (const h of holes) {
    cols.push({ kind: "hole", hole: h });
    if (h.number === 9) cols.push({ kind: "sum", seg: "front" });
    if (h.number === 18) cols.push({ kind: "sum", seg: "back" });
  }
  cols.push({ kind: "sum", seg: "total" });
  return cols;
}

function segLabel(seg: SumSeg): string {
  return seg === "front" ? "Out" : seg === "back" ? "In" : "Tot";
}

function segClass(seg: SumSeg, extra?: string): string {
  const c = ["sum-col"];
  if (seg === "front") c.push("sum-col-out");
  if (extra) c.push(extra);
  return c.join(" ");
}

function holesIn(holes: Hole[], seg: SumSeg): Hole[] {
  if (seg === "front") return holes.filter((h) => h.number <= 9);
  if (seg === "back") return holes.filter((h) => h.number >= 10);
  return holes;
}

function sumPar(holes: Hole[], seg: SumSeg): number {
  return holesIn(holes, seg).reduce((s, h) => s + h.par, 0);
}

function sumMap(map: Record<number, number | null>, holes: Hole[], seg: SumSeg): number | null {
  let sum = 0;
  let any = false;
  for (const h of holesIn(holes, seg)) {
    const v = map[h.number];
    if (v != null) {
      sum += v;
      any = true;
    }
  }
  return any ? sum : null;
}

/** One round's scorecard for a single golfer. Four-ball shows the player's own
 *  gross and net ball; a scramble shows their group's raw team ball (no net). */
function RoundScorecard({
  round,
  match,
  ctx,
  player,
}: {
  round: Round;
  match: Match;
  ctx: ScoringContext;
  player: Player;
}) {
  const holes = ctx.course.holes;
  const cols = buildCols(holes);
  const scramble = match.format === "scramble";
  const onA = match.sideA.playerIds.includes(player.id);
  const side = onA ? match.sideA : match.sideB;
  const key = scramble ? teamScoreKey(side.teamId) : player.id;
  const hcp = scramble ? 0 : courseHandicap(player.handicap, ctx);

  const grossMap: Record<number, number | null> = {};
  const netMap: Record<number, number | null> = {};
  let gross = 0;
  let net = 0;
  let par = 0;
  let thru = 0;
  for (const h of holes) {
    const g = match.scores[key]?.[h.number] ?? null;
    grossMap[h.number] = g;
    const n = g == null ? null : g - strokesOnHole(hcp, h.strokeIndex);
    netMap[h.number] = n;
    if (g != null) {
      gross += g;
      net += n!;
      par += h.par;
      thru += 1;
    }
  }

  const dataRow = (label: string, map: Record<number, number | null>, meta?: boolean) => (
    <tr className="team-row">
      <th className={`lbl${meta ? " lbl-meta" : ""}`}>{label}</th>
      {cols.map((col) => {
        if (col.kind === "hole") {
          const v = map[col.hole.number];
          return (
            <td
              key={col.hole.number}
              className={v != null ? "score-entered" : undefined}
            >
              {v ?? "–"}
            </td>
          );
        }
        const total = sumMap(map, holes, col.seg);
        return (
          <td
            key={`sum-${col.seg}`}
            className={segClass(col.seg, total != null ? "score-entered" : undefined)}
          >
            {total ?? "–"}
          </td>
        );
      })}
    </tr>
  );

  return (
    <section className="section ticker-match-section">
      <div className="card ticker-score-card">
        <Link to={`/match/${match.id}`} className="ticker-score-head">
          <div className="ticker-score-copy">
            <span className="ticker-score-slot">
              {round.name} · {FORMAT_LABELS[match.format]}
              {scramble ? " (team ball)" : ""}
            </span>
            <span className="ticker-score-players">
              {ctx.course.name}
              {ctx.tee ? ` · ${ctx.tee.name} Tees` : ""}
            </span>
          </div>
          <span className="ticker-score-value">
            {thru > 0 ? formatStrokesToPar(net - par) : "—"}
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
                    <th key={`sum-${col.seg}`} className={segClass(col.seg)}>
                      {segLabel(col.seg)}
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
                    <td key={`sum-${col.seg}`} className={segClass(col.seg)}>
                      {sumPar(holes, col.seg)}
                    </td>
                  ),
                )}
              </tr>
              {dataRow(scramble ? "Score" : "Gross", grossMap)}
              {!scramble && dataRow("Net", netMap, true)}
            </tbody>
          </table>
        </div>

        {thru > 0 && (
          <p className="ticker-score-nassau">
            {scramble ? "Team " : "Gross "}
            {gross}
            {!scramble && ` · Net ${net}`} · {formatStrokesToPar(net - par)}
            {thru < holes.length ? ` · thru ${thru}` : ""}
          </p>
        )}
      </div>
    </section>
  );
}

export default function PlayerPage() {
  const { playerId } = useParams();
  const { state } = useStore();
  const contexts = useRoundContexts();

  const player = state.players.find((p) => p.id === playerId);
  const team = player ? state.teams.find((t) => t.id === player.teamId) : undefined;

  // Every round the golfer has started (pending rounds have nothing to show).
  const rounds = useMemo(() => {
    if (!player) return [];
    const out: { round: Round; match: Match }[] = [];
    for (const round of state.rounds) {
      if (round.status === "pending") continue;
      const match = state.matches.find(
        (m) =>
          m.roundId === round.id &&
          (m.sideA.playerIds.includes(player.id) || m.sideB.playerIds.includes(player.id)),
      );
      if (match) out.push({ round, match });
    }
    return out;
  }, [player, state.rounds, state.matches]);

  if (!player) {
    return (
      <div className="section">
        <div className="card" style={{ padding: 16 }}>
          <p style={{ marginTop: 0 }}>Golfer not found.</p>
          <Link className="btn" to="/">
            Back to leaderboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <section className="section" style={{ paddingBottom: 0 }}>
        <h2 className="row" style={{ gap: 10, alignItems: "center" }}>
          <span className="dot" style={{ background: team?.color }} />
          {player.name}
        </h2>
        <p className="hint" style={{ marginTop: 2 }}>
          {team?.name ? `${team.name} · ` : ""}
          {player.handicap} hcp
        </p>
      </section>

      {rounds.length === 0 ? (
        <div className="section" style={{ paddingTop: 4 }}>
          <p className="hint center">
            No scorecards yet — they show up here once {player.name}'s rounds get
            underway.
          </p>
        </div>
      ) : (
        rounds.map(({ round, match }) => (
          <RoundScorecard
            key={round.id}
            round={round}
            match={match}
            ctx={contexts[round.id]}
            player={player}
          />
        ))
      )}
    </>
  );
}
