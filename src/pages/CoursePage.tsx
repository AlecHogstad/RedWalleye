import { useState } from "react";
import { useStore } from "../store/store";

export default function CoursePage() {
  const { state, updateHole, resetAll } = useStore();
  const [courseId, setCourseId] = useState(state.courses[0]?.id ?? "");
  const course = state.courses.find((c) => c.id === courseId) ?? state.courses[0];
  const totalPar = course.holes.reduce((s, h) => s + h.par, 0);

  const confirmReset = () => {
    if (
      window.confirm(
        "Reset everything — all scores, round starts, edited handicaps and course info — back to the starting setup?",
      )
    ) {
      resetAll();
    }
  };

  return (
    <>
      <div className="section">
        <h2>Courses</h2>
        <div className="card">
          {state.courses.map((c) => (
            <button
              key={c.id}
              className={`choice ${c.id === course.id ? "picked" : ""}`}
              onClick={() => setCourseId(c.id)}
            >
              <span className="choice-name">{c.name}</span>
              <span className="choice-meta">
                par {c.holes.reduce((s, h) => s + h.par, 0)}
              </span>
            </button>
          ))}
        </div>
      </div>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="card">
          <div className="field">
            <label>Total par</label>
            <span className="muted">{totalPar}</span>
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <h2>Tees</h2>
        <div className="card">
          <div className="field" style={{ fontWeight: 700, color: "var(--muted)" }}>
            <span style={{ flex: 1 }}>Tee</span>
            <span style={{ width: 74, textAlign: "right" }}>Yards</span>
            <span style={{ width: 60, textAlign: "right" }}>Rating</span>
            <span style={{ width: 52, textAlign: "right" }}>Slope</span>
          </div>
          {course.tees.map((t) => (
            <div className="field" key={t.name}>
              <label>{t.name}</label>
              <span style={{ width: 74, textAlign: "right" }}>
                {t.yardage.toLocaleString()}
              </span>
              <span style={{ width: 60, textAlign: "right" }}>{t.rating}</span>
              <span style={{ width: 52, textAlign: "right" }}>{t.slope}</span>
            </div>
          ))}
        </div>
        <p className="hint">
          Rating and slope set each player's course handicap when a round is
          started off these tees.
        </p>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <h2>Holes</h2>
        <div className="card">
          <div className="field" style={{ fontWeight: 700, color: "var(--muted)" }}>
            <span style={{ width: 52 }}>Hole</span>
            <span className="spacer" />
            <span style={{ width: 84, textAlign: "center" }}>Par</span>
            <span style={{ width: 84, textAlign: "center" }}>HDCP</span>
          </div>
          {course.holes.map((h) => (
            <div className="field" key={h.number}>
              <label style={{ flex: "none", width: 52 }}>
                {h.number}
                {h.yards ? <span className="yards"> {h.yards}y</span> : null}
              </label>
              <span className="spacer" />
              <input
                type="number"
                inputMode="numeric"
                min={3}
                max={6}
                value={h.par}
                onChange={(e) =>
                  updateHole(course.id, h.number, { par: Number(e.target.value) })
                }
              />
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={18}
                value={h.strokeIndex}
                onChange={(e) =>
                  updateHole(course.id, h.number, {
                    strokeIndex: Number(e.target.value),
                  })
                }
              />
            </div>
          ))}
        </div>
        <p className="hint">
          HDCP = the hole's handicap rank (1 = hardest, gets a stroke first).
        </p>
      </section>

      <section className="section">
        <h2>Danger zone</h2>
        <div className="card" style={{ padding: 16 }}>
          <button className="btn ghost" onClick={confirmReset}>
            Reset all data
          </button>
          <p className="hint" style={{ padding: "10px 0 0" }}>
            Wipes scores, round starts, and edits on this phone and restores the
            original teams, matchups and courses.
          </p>
        </div>
      </section>
    </>
  );
}
