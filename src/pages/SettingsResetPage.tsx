import { Link, useNavigate } from "react-router-dom";
import { usePrompt } from "../components/ConfirmDialog";
import { useStore } from "../store/store";

const CONFIRM_WORD = "Reset";

export default function SettingsResetPage() {
  const { resetAll, syncStatus } = useStore();
  const prompt = usePrompt();
  const navigate = useNavigate();

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
      </section>
    </>
  );
}
