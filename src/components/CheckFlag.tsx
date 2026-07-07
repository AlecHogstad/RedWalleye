/**
 * Checkered-flag motifs used across the retro theme.
 * Drawn with currentColor only, so they inherit whatever ink they sit in.
 */

/** Small inline checkered pennant (for FINAL markers, leaderboard leader). */
export function CheckFlag({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      style={{ display: "inline-block", verticalAlign: "-1px" }}
    >
      <rect x="2" y="1" width="1.7" height="14" rx="0.85" fill="currentColor" />
      {/* 3x2 checker, alternating cells */}
      <rect x="4.4" y="1.6" width="3.4" height="2.9" fill="currentColor" />
      <rect x="11.2" y="1.6" width="3.4" height="2.9" fill="currentColor" />
      <rect x="7.8" y="4.5" width="3.4" height="2.9" fill="currentColor" />
    </svg>
  );
}

/** Tall pole + pennant that runs behind the RWGC lockup letters. */
export function PoleFlag() {
  return (
    <svg viewBox="0 0 26 64" fill="none" aria-hidden>
      <rect x="11.8" y="0" width="2.4" height="64" rx="1.2" fill="currentColor" />
      {/* 3x2 checker pennant off the top of the pole */}
      <rect x="14.2" y="2" width="3.6" height="5.6" fill="currentColor" />
      <rect x="21.4" y="2" width="3.6" height="5.6" fill="currentColor" />
      <rect x="17.8" y="7.6" width="3.6" height="5.6" fill="currentColor" />
    </svg>
  );
}
