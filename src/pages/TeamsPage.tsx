import { useStore } from "../store/store";

export default function TeamsPage() {
  const { state, updatePlayer } = useStore();

  return (
    <>
      <div className="section">
        <h2>Teams &amp; Handicaps</h2>
        <p className="hint" style={{ padding: "0 2px 8px" }}>
          Edit names and handicaps here — the strokes given in every match update
          automatically.
        </p>
      </div>

      {state.teams.map((team) => {
        const roster = state.players.filter((p) => p.teamId === team.id);
        const total = roster.reduce((s, p) => s + p.handicap, 0);
        return (
          <section className="section" key={team.id} style={{ paddingTop: 0 }}>
            <h2 className="row" style={{ gap: 8 }}>
              <span className="dot" style={{ background: team.color }} />
              {team.name}
              <span className="spacer" />
              <span className="muted" style={{ textTransform: "none" }}>
                Σ {Number.isInteger(total) ? total : total.toFixed(1)}
              </span>
            </h2>
            <div className="card">
              {roster.map((p) => (
                <div className="field" key={p.id}>
                  <input
                    className="wide"
                    value={p.name}
                    onChange={(e) => updatePlayer(p.id, { name: e.target.value })}
                  />
                  <span className="spacer" />
                  <span className="muted" style={{ fontSize: 12 }}>
                    hcp
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={p.handicap}
                    onChange={(e) =>
                      updatePlayer(p.id, {
                        handicap: e.target.value === "" ? 0 : Number(e.target.value),
                      })
                    }
                  />
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
