import { Link } from "react-router-dom";
import type { RuleField } from "../types";
import { useStore } from "../store/store";
import {
  FORMAT_REGISTRY,
  listRule,
  numRule,
  resolveFormatRules,
} from "../scoring/formats";

// Round to the field's step so 0.5-step knobs don't drift into float noise.
function snap(value: number, step: number): number {
  const snapped = Math.round(value / step) * step;
  return Math.round(snapped * 100) / 100;
}
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function Stepper({
  value,
  field,
  disabled,
  onChange,
}: {
  value: number;
  field: RuleField;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  const min = field.min ?? 0;
  const max = field.max ?? 999;
  const step = field.step ?? 1;
  const set = (v: number) => onChange(Math.min(max, Math.max(min, snap(v, step))));
  const btn: React.CSSProperties = {
    width: 38,
    height: 38,
    borderRadius: 10,
    border: "1px solid var(--line)",
    background: "var(--cream-card)",
    color: "var(--ink)",
    fontSize: 22,
    lineHeight: 1,
    fontFamily: "var(--font-display)",
    touchAction: "manipulation",
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <button
        type="button"
        style={{ ...btn, opacity: disabled || value <= min ? 0.4 : 1 }}
        disabled={disabled || value <= min}
        onClick={() => set(value - step)}
        aria-label="Decrease"
      >
        −
      </button>
      <span
        style={{
          minWidth: 58,
          textAlign: "center",
          fontFamily: "var(--font-display)",
          fontSize: 18,
          color: "var(--accent)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {fmt(value)}
        {field.unit ? <span style={{ fontSize: 12, marginLeft: 2 }}>{field.unit}</span> : null}
      </span>
      <button
        type="button"
        style={{ ...btn, opacity: disabled || value >= max ? 0.4 : 1 }}
        disabled={disabled || value >= max}
        onClick={() => set(value + step)}
        aria-label="Increase"
      >
        +
      </button>
    </div>
  );
}

const PLACE_LABELS = ["1st", "2nd", "3rd", "4th", "5th", "6th"];

export default function SettingsHouseRulesPage() {
  const { state, houseRulesEditable, setFormatRules, resetHouseRules } = useStore();
  const hasOverrides = Object.values(state.houseRules?.formats ?? {}).some(
    (r) => Object.keys(r).length > 0,
  );

  return (
    <>
      <div className="section" style={{ paddingBottom: 0 }}>
        <Link className="badge" to="/settings">
          ← Settings
        </Link>
        <h2 style={{ marginTop: 10 }}>House Rules</h2>
      </div>

      <section className="section" style={{ paddingTop: 8 }}>
        <div className="card" style={{ padding: "14px 16px" }}>
          <p className="hint" style={{ margin: 0, padding: 0 }}>
            Your group&rsquo;s scoring, your way. These apply to every round of the
            trip and <strong>lock the moment the first round starts</strong> — set
            them before you tee off. Leave them alone to play it exactly as the app
            ships.
          </p>
        </div>

        {!houseRulesEditable && (
          <div
            className="card"
            style={{ marginTop: 12, padding: "12px 16px", borderColor: "var(--sand-deep)" }}
          >
            <p className="hint" style={{ margin: 0, padding: 0 }}>
              <strong>Locked.</strong> The tournament is underway, so the rules are
              frozen for fairness. They unlock again after a full reset.
            </p>
          </div>
        )}

        {Object.values(FORMAT_REGISTRY).map((plugin) => {
          const rules = resolveFormatRules(plugin.id, state.houseRules);
          return (
            <div key={plugin.id} className="card" style={{ marginTop: 12, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
                <strong style={{ fontFamily: "var(--font-display)", fontWeight: 400, letterSpacing: ".01em" }}>
                  {plugin.labels.long}
                </strong>
              </div>
              {plugin.rulesSchema.map((field) => (
                <div
                  key={field.key}
                  style={{ padding: "13px 16px", borderBottom: "1px solid var(--line)" }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: 14,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14.5 }}>{field.label}</div>
                      {field.help && (
                        <div className="hint" style={{ padding: 0, marginTop: 3 }}>
                          {field.help}
                        </div>
                      )}
                    </div>
                    {field.kind === "number" && (
                      <Stepper
                        value={numRule(rules, field.key, plugin.defaultRules[field.key] as number)}
                        field={field}
                        disabled={!houseRulesEditable}
                        onChange={(v) => setFormatRules(plugin.id, { [field.key]: v })}
                      />
                    )}
                  </div>

                  {field.kind === "list" && (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: `repeat(${field.length ?? 4}, 1fr)`,
                        gap: 10,
                        marginTop: 12,
                      }}
                    >
                      {(() => {
                        const arr = listRule(
                          rules,
                          field.key,
                          plugin.defaultRules[field.key] as number[],
                        );
                        return Array.from({ length: field.length ?? arr.length }, (_, i) => (
                          <div key={i} style={{ textAlign: "center" }}>
                            <div
                              className="hint"
                              style={{ padding: 0, marginBottom: 5, fontStyle: "italic" }}
                            >
                              {PLACE_LABELS[i] ?? `#${i + 1}`}
                            </div>
                            <Stepper
                              value={arr[i] ?? 0}
                              field={field}
                              disabled={!houseRulesEditable}
                              onChange={(v) => {
                                const next = [...arr];
                                next[i] = v;
                                setFormatRules(plugin.id, { [field.key]: next });
                              }}
                            />
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })}

        {houseRulesEditable && hasOverrides && (
          <div className="section" style={{ padding: "16px 0 0" }}>
            <button className="btn ghost" onClick={resetHouseRules}>
              Reset to default rules
            </button>
          </div>
        )}
      </section>
    </>
  );
}
