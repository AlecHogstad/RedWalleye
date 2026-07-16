import { Link } from "react-router-dom";
import type { RuleField, Rules } from "../types";
import { useStore } from "../store/store";
import { FORMAT_REGISTRY, listRule, numRule, resolveFormatRules } from "../scoring/formats";
import { SIDEGAME_REGISTRY, resolveSideGameRules } from "../scoring/sidegames";

// Round to the field's step so 0.5-step knobs don't drift into float noise.
function snap(value: number, step: number): number {
  return Math.round((Math.round(value / step) * step) * 100) / 100;
}
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

// Slot labels for `list` knobs, by field key.
const SLOT_LABELS: Record<string, string[]> = {
  placementPoints: ["1st", "2nd", "3rd", "4th", "5th", "6th"],
  points: ["Albatross+", "Eagle", "Birdie", "Par", "Bogey", "Double+"],
};

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
    flex: "none",
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
          minWidth: 56,
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

function FieldRow({
  field,
  rules,
  defaults,
  disabled,
  onChange,
}: {
  field: RuleField;
  rules: Rules;
  defaults: Rules;
  disabled: boolean;
  onChange: (patch: Rules) => void;
}) {
  const labels = SLOT_LABELS[field.key] ?? [];
  return (
    <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--line)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }}>
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
            value={numRule(rules, field.key, defaults[field.key] as number)}
            field={field}
            disabled={disabled}
            onChange={(v) => onChange({ [field.key]: v })}
          />
        )}
      </div>

      {field.kind === "list" && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {(() => {
            const arr = listRule(rules, field.key, defaults[field.key] as number[]);
            return Array.from({ length: field.length ?? arr.length }, (_, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontSize: 13.5, color: "var(--muted)" }}>{labels[i] ?? `#${i + 1}`}</span>
                <Stepper
                  value={arr[i] ?? 0}
                  field={field}
                  disabled={disabled}
                  onChange={(v) => {
                    const next = [...arr];
                    next[i] = v;
                    onChange({ [field.key]: next });
                  }}
                />
              </div>
            ));
          })()}
        </div>
      )}
    </div>
  );
}

function RuleCard({
  title,
  schema,
  rules,
  defaults,
  disabled,
  onChange,
}: {
  title: string;
  schema: RuleField[];
  rules: Rules;
  defaults: Rules;
  disabled: boolean;
  onChange: (patch: Rules) => void;
}) {
  return (
    <div className="card" style={{ marginTop: 12, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
        <strong style={{ fontFamily: "var(--font-display)", fontWeight: 400, letterSpacing: ".01em" }}>
          {title}
        </strong>
      </div>
      {schema.map((field) => (
        <FieldRow
          key={field.key}
          field={field}
          rules={rules}
          defaults={defaults}
          disabled={disabled}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

export default function SettingsHouseRulesPage() {
  const { state, houseRulesEditable, setFormatRules, setSideGameRules, resetHouseRules } = useStore();
  const hr = state.houseRules;
  const hasOverrides =
    Object.values(hr?.formats ?? {}).some((r) => Object.keys(r).length > 0) ||
    Object.values(hr?.sideGames ?? {}).some((r) => Object.keys(r).length > 0);

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
          <div className="card" style={{ marginTop: 12, padding: "12px 16px", borderColor: "var(--sand-deep)" }}>
            <p className="hint" style={{ margin: 0, padding: 0 }}>
              <strong>Locked.</strong> The tournament is underway, so the rules are
              frozen for fairness. They unlock again after a full reset.
            </p>
          </div>
        )}

        <p className="hint" style={{ padding: "16px 2px 0", fontStyle: "italic" }}>Formats</p>
        {Object.values(FORMAT_REGISTRY).map((plugin) => (
          <RuleCard
            key={plugin.id}
            title={plugin.labels.long}
            schema={plugin.rulesSchema}
            rules={resolveFormatRules(plugin.id, hr)}
            defaults={plugin.defaultRules}
            disabled={!houseRulesEditable}
            onChange={(patch) => setFormatRules(plugin.id, patch)}
          />
        ))}

        <p className="hint" style={{ padding: "18px 2px 0", fontStyle: "italic" }}>Side games</p>
        {Object.values(SIDEGAME_REGISTRY).map((plugin) => (
          <RuleCard
            key={plugin.id}
            title={plugin.label}
            schema={plugin.rulesSchema}
            rules={resolveSideGameRules(plugin.id, hr)}
            defaults={plugin.defaultRules}
            disabled={!houseRulesEditable}
            onChange={(patch) => setSideGameRules(plugin.id, patch)}
          />
        ))}

        {houseRulesEditable && hasOverrides && (
          <div className="section" style={{ padding: "18px 0 0" }}>
            <button className="btn ghost" onClick={resetHouseRules}>
              Reset to default rules
            </button>
          </div>
        )}
      </section>
    </>
  );
}
