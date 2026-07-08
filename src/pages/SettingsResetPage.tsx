import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "../store/store";

const CONFIRM_WORD = "Reset";

export default function SettingsResetPage() {
  const { resetAll, syncStatus } = useStore();
  const navigate = useNavigate();
  const [typed, setTyped] = useState("");

  const scope =
    syncStatus === "local"
      ? "on this phone"
      : "for EVERYONE — every phone on the trip";
  const armed = typed.trim() === CONFIRM_WORD;

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
        <div className="card" style={{ padding: 16 }}>
          <p style={{ marginTop: 0 }}>
            This wipes all scores, round starts, and edits {scope} and restores
            the original teams, matchups and courses. This can't be undone.
          </p>
          <label
            className="reset-label"
            htmlFor="reset-confirm"
            style={{ display: "block", margin: "14px 0 6px" }}
          >
            Type <b>{CONFIRM_WORD}</b> to confirm
          </label>
          <input
            id="reset-confirm"
            className="wide"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder={CONFIRM_WORD}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
          <button
            className="btn ghost"
            style={{ marginTop: 14 }}
            disabled={!armed}
            onClick={doReset}
          >
            Reset all data
          </button>
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
