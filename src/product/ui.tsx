import type { CSSProperties, ReactNode } from "react";

// Shared look for the product surface — neutral / dark (Linear-ish), distinct
// from the golf-club theme. Kept tiny; pages compose these.

export const colors = {
  bg: "#0b0d0f",
  surface: "#15181c",
  surface2: "#1b1f24",
  border: "#24282e",
  text: "#e8eaed",
  muted: "#9aa0a6",
  accent: "#3b82f6",
  danger: "#f87171",
  good: "#34d399",
};

export const inputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid ${colors.border}`,
  background: "#0f1215",
  color: colors.text,
  fontSize: 15,
  boxSizing: "border-box",
};

export const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 13,
  color: colors.muted,
  margin: "14px 0 6px",
};

export const buttonStyle: CSSProperties = {
  padding: "11px 16px",
  borderRadius: 8,
  border: "none",
  background: colors.accent,
  color: "#fff",
  fontSize: 15,
  fontWeight: 600,
  cursor: "pointer",
};

export const ghostButtonStyle: CSSProperties = {
  padding: "9px 14px",
  borderRadius: 8,
  border: `1px solid ${colors.border}`,
  background: "transparent",
  color: colors.text,
  fontSize: 14,
  cursor: "pointer",
};

/** Full-height dark page. `center` vertically centers a narrow card (auth);
 *  otherwise content is top-aligned in a max-width column (home/wizard). */
export function Page({
  children,
  center = false,
  maxWidth = 480,
}: {
  children: ReactNode;
  center?: boolean;
  maxWidth?: number;
}) {
  const wrap: CSSProperties = {
    minHeight: "100vh",
    background: colors.bg,
    color: colors.text,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    display: "flex",
    justifyContent: "center",
    alignItems: center ? "center" : "flex-start",
    padding: 24,
    boxSizing: "border-box",
  };
  return (
    <div style={wrap}>
      <div style={{ width: "100%", maxWidth, marginTop: center ? 0 : 48 }}>{children}</div>
    </div>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: 12,
        padding: 20,
      }}
    >
      {children}
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const tint: Record<string, string> = {
    draft: colors.muted,
    active: colors.accent,
    final: colors.good,
  };
  const c = tint[status] ?? colors.muted;
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        color: c,
        border: `1px solid ${c}55`,
        borderRadius: 999,
        padding: "2px 8px",
      }}
    >
      {status}
    </span>
  );
}
