import type { CSSProperties, ReactNode } from "react";

// Product surface styling — the Red Walleye vintage country-club language
// (same tokens as src/index.css): cream paper, ink, forest green + burnt
// orange, oval outline badges, pill buttons, Alfa Slab One display type.
// The fonts are already self-hosted app-wide via @fontsource (main.tsx).

export const colors = {
  bg: "#f4eddb", // cream paper
  surface: "#fbf7ea", // cream card
  surface2: "#f4eddb",
  border: "#ddd3b8", // line
  text: "#26301f", // ink
  muted: "#635d47",
  accent: "#1e4a2b", // forest green — primary actions
  orange: "#de4f2c", // burnt orange — live / danger / emphasis
  danger: "#de4f2c",
  good: "#2e6b3e", // bright green
};

/** Display face for headings, scores, hole numbers (Alfa Slab One). */
export const displayStyle: CSSProperties = {
  fontFamily: '"Alfa Slab One", "Rockwell", "Courier New", serif',
  fontWeight: 400,
  letterSpacing: "0.01em",
};

/** Fraunces italic — the "thru 7" / hint accent voice. */
export const serifItalicStyle: CSSProperties = {
  fontFamily: '"Fraunces", Georgia, serif',
  fontStyle: "italic",
};

export const inputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: `1.5px solid ${colors.border}`,
  background: "#fff",
  color: colors.text,
  fontSize: 15,
  boxSizing: "border-box",
};

export const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  color: colors.muted,
  margin: "14px 0 6px",
};

export const buttonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "12px 18px",
  borderRadius: 999,
  border: "none",
  background: colors.accent,
  color: colors.surface,
  fontSize: 13,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  cursor: "pointer",
};

export const ghostButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "9px 14px",
  borderRadius: 999,
  border: "1.5px solid currentColor",
  background: "transparent",
  color: colors.accent,
  fontSize: 12,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  cursor: "pointer",
};

/** Full-height cream page. `center` vertically centers a narrow card (auth /
 *  join states); otherwise content is top-aligned in a max-width column. */
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
    padding: 20,
    boxSizing: "border-box",
  };
  return (
    <div style={wrap}>
      <div style={{ width: "100%", maxWidth, marginTop: center ? 0 : 28 }}>{children}</div>
    </div>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: 14,
        boxShadow: "0 1px 2px rgba(38, 48, 31, 0.05), 0 4px 14px rgba(38, 48, 31, 0.07)",
        padding: 18,
      }}
    >
      {children}
    </div>
  );
}

/** Oval outline badge, straight from the v1 design language. */
export function StatusPill({ status }: { status: string }) {
  const tint: Record<string, string> = {
    draft: colors.muted,
    pending: colors.muted,
    active: colors.orange,
    final: colors.good,
  };
  const c = tint[status] ?? colors.muted;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 10,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.14em",
        color: c,
        border: "1.5px solid currentColor",
        borderRadius: 999,
        padding: "4px 12px",
        whiteSpace: "nowrap",
      }}
    >
      {status === "active" ? "● live" : status}
    </span>
  );
}
