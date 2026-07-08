import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FORMAT_LABELS, FORMAT_RULES } from "../types";
import { courseHandicap } from "../scoring/engine";
import { ROUND_DEFAULTS } from "../data/seed";
import { useStore } from "../store/store";

export default function StartRoundPage() {
  const { roundId } = useParams();
  const navigate = useNavigate();
  const { state, startRound } = useStore();

  const round = state.rounds.find((r) => r.id === roundId);
  const anyActive = state.rounds.some((r) => r.status === "active");

  // Pre-select this round's usual venue (Big Fish for R1/R2, Hayward for R3)
  // when it's a real course on this device; fall back to the first course.
  const defaults = roundId ? ROUND_DEFAULTS[roundId] : undefined;
  const defaultCourseId =
    defaults && state.courses.some((c) => c.id === defaults.courseId)
      ? defaults.courseId
      : state.courses[0]?.id ?? "";
  const [courseId, setCourseId] = useState(defaultCourseId);
  const course = state.courses.find((c) => c.id === courseId) ?? state.courses[0];
  const defaultTee =
    defaults && course?.id === defaults.courseId &&
    course.tees.some((t) => t.name === defaults.teeName)
      ? defaults.teeName
      : "";
  const [teeName, setTeeName] = useState<string>(defaultTee);
  const tee = course?.tees.find((t) => t.name === teeName);

  const preview = useMemo(() => {
    if (!course || !tee) return [];
    return state.players.map((p) => ({
      name: p.name,
      hi: p.handicap,
      ch: courseHandicap(p.handicap, { course, tee }),
    }));
  }, [course, tee, state.players]);

  if (!round || round.status !== "pending" || anyActive) {
    return (
      <div className="section">
        <div className="card" style={{ padding: 16 }}>
          <p style={{ marginTop: 0 }}>
            {anyActive
              ? "Another round is live — finish it before starting a new one."
              : "This round can't be started."}
          </p>
          <Link className="btn" to="/rounds">
            Back to rounds
          </Link>
        </div>
      </div>
    );
  }

  const confirmStart = () => {
    if (!course || !tee) return;
    if (
      window.confirm(
        `Start ${round.name} (${FORMAT_LABELS[round.format]}) at ${course.name} off the ${tee.name} tees?\n\nThis locks the other rounds until it's finished. One person starts the round — is that you?`,
      )
    ) {
      startRound(round.id, course.id, tee.name);
      navigate("/rounds");
    }
  };

  return (
    <>
      <div className="section" style={{ paddingBottom: 0 }}>
        <Link className="badge" to="/rounds">
          ← Rounds
        </Link>
        <h2 style={{ marginTop: 10 }}>Start {round.name}</h2>
        <div className="rules">
          <span className="rules-title">{FORMAT_LABELS[round.format]}</span>
          {FORMAT_RULES[round.format]}
        </div>
        <p className="hint" style={{ padding: "6px 2px" }}>
          Pick the course and tees — they set every player's course handicap for
          this round.
        </p>
      </div>

      <section className="section" style={{ paddingTop: 4 }}>
        <h2>Course</h2>
        <div className="card">
          {state.courses.map((c) => (
            <button
              key={c.id}
              className={`choice ${c.id === course?.id ? "picked" : ""}`}
              onClick={() => {
                setCourseId(c.id);
                setTeeName("");
              }}
            >
              <span className="choice-name">{c.name}</span>
              <span className="choice-meta">
                par {c.holes.reduce((s, h) => s + h.par, 0)}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>Tees</h2>
        <div className="card">
          {course?.tees.map((t) => (
            <button
              key={t.name}
              className={`choice ${t.name === teeName ? "picked" : ""}`}
              onClick={() => setTeeName(t.name)}
            >
              <span className="choice-name">{t.name}</span>
              <span className="choice-meta">
                {t.yardage.toLocaleString()} yds · {t.rating} / {t.slope}
              </span>
            </button>
          ))}
        </div>
      </section>

      {tee && (
        <section className="section">
          <h2>Course handicaps</h2>
          <div className="card" style={{ padding: "10px 16px" }}>
            <div className="ch-grid">
              {preview.map((p) => (
                <div key={p.name} className="ch-cell">
                  <span>{p.name}</span>
                  <b>{p.ch}</b>
                </div>
              ))}
            </div>
          </div>
          <p className="hint">
            Index × ({tee.slope} ÷ 113) + ({tee.rating} − par). Strokes in each
            match are given off the lowest course handicap in that match.
          </p>
        </section>
      )}

      <div className="section">
        <button className="btn" disabled={!tee} onClick={confirmStart}>
          {tee ? `Start round — ${tee.name} tees` : "Pick tees to start"}
        </button>
        <p className="hint center" style={{ paddingTop: 10 }}>
          Starting locks the other rounds until this one is finished.
        </p>
      </div>
    </>
  );
}
