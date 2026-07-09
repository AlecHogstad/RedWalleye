# The Hayward Herald — morning-paper round recap

A 1940s sports-page front page recapping a **finished round**, generated
entirely from state that already syncs (scores + matches + side games). No new
DB rows, no new sync surface — same derived-data pattern as the activity feed.

## What the reader sees

- **Masthead**: "THE HAYWARD HERALD" in Alfa Slab, rule lines, dateline
  ("HAYWARD, WIS. — <date>"), edition gag ("Vol. V · No. <round #> · 10¢").
- **Lead headline**: the round's defining fact, all-caps slab —
  "TEAM A SEIZES ROUND 1, 8½–3½" / "TEAM B STORMS BACK AT BIG FISH".
- **Lede paragraph**: 2–3 generated sentences: round result, biggest match,
  standings after ("Team A leads the trip, 8½–3½, with 24 points still on
  the table.").
- **Column stories** (2-col newspaper layout, justified serif, drop cap):
  one short graf per big feed moment — closeouts, comebacks, front/back nine
  wins, aces/eagles, the worst blow-up ("NATE D FOUND THE WATER TWICE…").
- **Agate box score**: per-match results in tight tabular type (pairings,
  result text, points) — fourball; scramble round gets the placement table.
- **The Snake Report** + **Mulligan Ledger**: one-liners from side games.
- Footer: "All the news that's fit to shank."

## Where it lives

- Route `/herald/:roundId` (hash router), rendered by `HeraldPage`.
- Entry points: a "Read the Herald" link on each **final** round's card on the
  Rounds page, and a feed item at round completion linking to it.
- Only renders for `status === "final"` rounds; pending/active → redirect to
  `/rounds`.

## Implementation

1. **`src/scoring/herald.ts`** (pure, unit-tested like `activity.ts`):
   `buildHerald(state, contexts, roundId): Herald | null` returning
   `{ dateline, volume, lead: {headline, lede}, stories: {headline, body}[],
   boxScore, snake?, mulligans? }`.
   - Reuse `buildFeed` filtered to the round for moments; rank by the existing
     WEIGHT and take the top ~6.
   - Headline/body copy from **template banks keyed by FeedKind**, picked
     deterministically (hash of event id % bank size — no `Math.random`, so
     every phone prints the same paper).
   - Round + standings math via `computeMatchState` / `computeStandings` /
     `computeScramblePlacement` — nothing new.
2. **`src/pages/HeraldPage.tsx`** + route in `App.tsx` (no tab bar, ← back
   pill like Match/Ticker; theme-sand so the paper reads cream-on-cream).
3. **CSS** (`index.css`): masthead rules, 2-col `column-count` body with
   `column-rule`, drop cap (`::first-letter`), agate table, halftone-noise
   background via a tiny repeating SVG data-URI. Fraunces italic is already
   self-hosted; add `@fontsource/fraunces` normal 400/700 for body/heads
   (small woff2s, keeps the offline story).
4. **`src/scoring/herald.test.ts`**: finished round → lead headline names the
   winning team + score; blow-up graf appears; scramble round produces the
   placement box; active round → `null`.

## Effort / risk

~1 day. Zero sync surface (read-only derivation). The only shared-state
touch is an optional round-final feed item — skippable in v1 (Rounds-page
link is enough).
