import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { usePrompt } from "../components/ConfirmDialog";
import { useStore } from "../store/store";

const CONFIRM_WORD = "Reset";

export default function SettingsResetPage() {
  const { resetAll, resyncDevice, syncStatus } = useStore();
  const prompt = usePrompt();
  const navigate = useNavigate();
  const [resynced, setResynced] = useState(false);

  const scope =
    syncStatus === "local"
      ? "on this phone"
      : "for EVERYONE — every phone on the trip";

  const askReset = async () => {
    const typed = await prompt({
      title: "Reset all data?",
      message: `This wipes all scores, round starts, and edits ${scope} and restores the original teams, matchups and courses. This can't be undone.`,
      detail: `Type ${CONFIRM_WORD} to confirm.`,
      inputPlaceholder: CONFIRM_WORD,
      match: CONFIRM_WORD,
      confirmLabel: "Reset everything",
      cancelLabel: "Cancel",
    });
    if (typed != null) {
      resetAll();
      navigate("/");
    }
  };

  const refresh = () => {
    resyncDevice();
    setResynced(true);
    setTimeout(() => setResynced(false), 2500);
  };

  return (
    <>
      <div className="section" style={{ paddingBottom: 0 }}>
        <Link className="badge" to="/settings">
          ← Settings
        </Link>
        <h2 style={{ marginTop: 10 }}>Reset app data</h2>
      </div>

      {syncStatus !== "local" && (
        <section className="section" style={{ paddingTop: 8, paddingBottom: 0 }}>
          <div className="card">
            <p className="hint" style={{ margin: 0, padding: "14px 16px 0" }}>
              <strong>This phone looks out of sync?</strong> Pull the latest from
              the other phones. This only refreshes <em>this</em> device — it
              doesn't change anyone else's scores, so it's safe to tap mid-round.
            </p>
            <div style={{ padding: "14px 16px 16px" }}>
              <button className="btn" onClick={refresh}>
                {resynced ? "Refreshed ✓" : "Refresh from server"}
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="section" style={{ paddingTop: 12 }}>
        <div className="card">
          <p className="hint" style={{ margin: 0, padding: "14px 16px 0" }}>
            This wipes all scores, round starts, and edits {scope} and restores
            the original teams, matchups and courses. This can't be undone.
          </p>
          <div style={{ padding: "14px 16px 16px" }}>
            <button className="btn ghost danger" onClick={askReset}>
              Reset all data
            </button>
          </div>
        </div>
        <p className="hint" style={{ paddingTop: 10 }}>
          {syncStatus === "local"
            ? "Local mode — this only affects this phone."
            : "Synced mode — this clears the shared tournament for every phone."}
        </p>
        <p className="hint center" style={{ paddingTop: 14, opacity: 0.7 }}>
          build {__BUILD_ID__}
        </p>
      </section>
    </>
  );
}
