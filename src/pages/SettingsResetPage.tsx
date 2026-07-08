import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "../store/store";

const CONFIRM_WORD = "Reset";

export default function SettingsResetPage() {
  const { resetAll, syncStatus } = useStore();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");

  const scope =
    syncStatus === "local"
      ? "on this phone"
      : "for EVERYONE — every phone on the trip";
  const armed = typed.trim().toLowerCase() === CONFIRM_WORD.toLowerCase();

  const cancel = () => {
    setConfirming(false);
    setTyped("");
  };

  const doReset = () => {
    if (!armed) return;
    resetAll();
    navigate("/");
  };

  return (
    <>
      <div className="section" style={{ paddingBottom: 0 }}>
        <Link className="badge" to="/settings">
          ← Settings
        </Link>
        <h2 style={{ marginTop: 10 }}>Reset app data</h2>
      </div>

      <section className="section" style={{ paddingTop: 8 }}>
        <div className="card">
          <p className="hint" style={{ margin: 0, padding: "14px 16px 0" }}>
            This wipes all scores, round starts, and edits {scope} and restores
            the original teams, matchups and courses. This can't be undone.
          </p>

          {!confirming ? (
            <div style={{ padding: "14px 16px 16px" }}>
              <button className="btn ghost" onClick={() => setConfirming(true)}>
                Reset all data
              </button>
            </div>
          ) : (
            <>
              <p className="hint" style={{ margin: 0, padding: "14px 16px 0" }}>
                Still sure? Type <b>{CONFIRM_WORD}</b> to confirm.
              </p>
              <div className="field">
                <input
                  id="reset-confirm"
                  className="wide"
                  autoFocus
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder={CONFIRM_WORD}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") doReset();
                  }}
                />
              </div>
              <div className="row" style={{ gap: 10, padding: "14px 16px 16px" }}>
                <button
                  className="btn ghost"
                  style={{ flex: 1 }}
                  onClick={cancel}
                >
                  Cancel
                </button>
                <button
                  className="btn"
                  style={{ flex: 1 }}
                  disabled={!armed}
                  onClick={doReset}
                >
                  Reset everything
                </button>
              </div>
            </>
          )}
        </div>
        <p className="hint" style={{ paddingTop: 10 }}>
          {syncStatus === "local"
            ? "Local mode — this only affects this phone."
            : "Synced mode — this clears the shared tournament for every phone."}
        </p>
      </section>
    </>
  );
}
