// Small inline SVG icons — stroke uses currentColor so they inherit the
// nav / header tint. Sized via the `size` prop (defaults tuned for the tab bar).

import type { ReactNode } from "react";
import type { FeedKind } from "../scoring/activity";

interface IconProps {
  size?: number;
}

/** Shared frame for the line-art feed icons — same stroke language as the nav. */
function Glyph({ size = 20, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/**
 * One line-art icon per activity-feed event. Golf scorecard conventions where
 * they read cleanly — circle = birdie, double circle = eagle, square = a
 * blow-up — and simple marks otherwise. All monochrome, inheriting the feed
 * ink like the nav icons and the RWGC lockup.
 */
export function FeedIcon({ kind, size = 22 }: { kind: FeedKind; size?: number }) {
  switch (kind) {
    case "ace": // flagstick in the cup with a ball alongside — a hole-in-one
      return (
        <Glyph size={size}>
          <path d="M8 20h10" />
          <path d="M12 20V5" />
          <path d="M12 5l6 2-6 2" />
          <circle cx="7" cy="19" r="1.4" />
        </Glyph>
      );
    case "birdie": // scorecard birdie mark — a circle
      return (
        <Glyph size={size}>
          <circle cx="12" cy="12" r="7" />
        </Glyph>
      );
    case "eagle": // scorecard eagle mark — a double circle
      return (
        <Glyph size={size}>
          <circle cx="12" cy="12" r="7.5" />
          <circle cx="12" cy="12" r="3.5" />
        </Glyph>
      );
    case "blowup": // trouble — a square
      return (
        <Glyph size={size}>
          <rect x="5" y="5" width="14" height="14" rx="1.5" />
        </Glyph>
      );
    case "matchLead": // took the lead — a rising trend
      return (
        <Glyph size={size}>
          <path d="M4 16l5-4 3 2 6-7" />
          <path d="M15 7h4v4" />
        </Glyph>
      );
    case "comeback": // clawed back — a fast double chevron up
      return (
        <Glyph size={size}>
          <path d="M6 13l6-5 6 5" />
          <path d="M6 18l6-5 6 5" />
        </Glyph>
      );
    case "matchFinal": // closed out — a checkered finish flag
      return (
        <Glyph size={size}>
          <path d="M6 3v18" />
          <rect x="6" y="5" width="13" height="9" />
          <rect x="6" y="5" width="6.5" height="4.5" fill="currentColor" stroke="none" />
          <rect x="12.5" y="9.5" width="6.5" height="4.5" fill="currentColor" stroke="none" />
        </Glyph>
      );
    case "segment": // won a nine — a pennant flag
      return (
        <Glyph size={size}>
          <path d="M7 4v16" />
          <path d="M7 5h11l-3.5 3.5L18 12H7" />
        </Glyph>
      );
    case "overallLead": // the trip lead — the leaderboard trophy
      return <TrophyIcon size={size} />;
    case "snake": // holding the snake — a squiggle with a head
      return (
        <Glyph size={size}>
          <path d="M4 15c3 0 3-6 6-6s3 6 6 6" />
          <circle cx="18" cy="15" r="1.1" fill="currentColor" stroke="none" />
          <path d="M19 14.4l1.6-1" />
        </Glyph>
      );
    case "mulligan": // booze mulligan — a rocks glass
      return (
        <Glyph size={size}>
          <path d="M7 6h10l-1 12.2a1 1 0 0 1-1 .8H9a1 1 0 0 1-1-.8L7 6Z" />
          <path d="M7.6 11h8.8" />
        </Glyph>
      );
  }
}

/** Leaderboard tab — a trophy. */
export function TrophyIcon({ size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M7 6H4v1a3 3 0 0 0 3 3" />
      <path d="M17 6h3v1a3 3 0 0 1-3 3" />
      <path d="M12 14v3" />
      <path d="M9 20h6" />
      <path d="M10 17h4l-.5 3h-3L10 17Z" />
    </svg>
  );
}

/** Rounds tab — a flag on the green. */
export function FlagIcon({ size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 21V4" />
      <path d="M6 4h11l-2.5 3.5L17 11H6" />
    </svg>
  );
}

/** Header ticker entry — a live-activity pulse. */
export function TickerIcon({ size = 22 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 12h4l2 6 4-14 2 8h6" />
    </svg>
  );
}

/** Header settings entry — a gear. */
export function GearIcon({ size = 22 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}
