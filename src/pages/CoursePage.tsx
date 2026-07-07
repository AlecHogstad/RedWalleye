import { useStore } from "../store/store";

export default function CoursePage() {
  const { state, updateHole, setCourseName, resetAll } = useStore();
  const totalPar = state.course.holes.reduce((s, h) => s + h.par, 0);

  const confirmReset = () => {
    if (
      window.confirm(
        "Reset everything — all scores, edited handicaps and course info — back to the starting setup?",
      )
    ) {
      resetAll();
    }
  };

  return (
    <>
      <div className="section">
        <h2>Course</h2>
        <div className="card">
          <div className="field">
            <label>Name</label>
            <input
              className="wide"
              value={state.course.name}
              onChange={(e) => setCourseName(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Total par</label>
            <span className="muted">{totalPar}</span>
          </div>
        </div>
        <p className="hint" style={{ padding: "8px 2px" }}>
          Set each hole's <b>par</b> and <b>stroke index</b> (1 = hardest hole, where
          strokes are given first). Handicap strokes across every format follow these.
        </p>
      </div>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="card">
          <div className="field" style={{ fontWeight: 700, color: "var(--muted)" }}>
            <span style={{ width: 52 }}>Hole</span>
            <span className="spacer" />
            <span style={{ width: 84, textAlign: "center" }}>Par</span>
            <span style={{ width: 84, textAlign: "center" }}>SI</span>
          </div>
          {state.course.holes.map((h) => (
            <div className="field" key={h.number}>
              <label style={{ flex: "none", width: 52 }}>{h.number}</label>
              <span className="spacer" />
              <input
                type="number"
                inputMode="numeric"
                min={3}
                max={6}
                value={h.par}
                onChange={(e) => updateHole(h.number, { par: Number(e.target.value) })}
              />
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={18}
                value={h.strokeIndex}
                onChange={(e) =>
                  updateHole(h.number, { strokeIndex: Number(e.target.value) })
                }
              />
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>Danger zone</h2>
        <div className="card" style={{ padding: 16 }}>
          <button className="btn ghost" onClick={confirmReset}>
            Reset all data
          </button>
          <p className="hint" style={{ padding: "10px 0 0" }}>
            Wipes scores and edits on this phone and restores the original teams,
            matchups and course.
          </p>
        </div>
      </section>
    </>
  );
}
