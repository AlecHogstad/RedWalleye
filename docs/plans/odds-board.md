# The Morning Line — live bookmaker odds for the team race

Vintage odds-board card showing each team's live probability of winning the
36-point trip, with old-school fractional odds ("Team A 2–5 · Team B 9–4").
Pure math over existing state — no storage, no sync surface, and **fully
deterministic** (same numbers on every phone; no `Math.random`).

## The model

The Nassau structure makes this exact rather than hand-wavy: the pot is 36,
points lock per bet, and what's left is enumerable.

1. **Locked points** — from `computeStandings` (bets lock as they complete).
2. **Enumerate every undecided bet** with a win probability for Team A:
   - **Not-started bet**: 0.5.
   - **Live fourball bet**: logistic on the current margin vs holes left in
     that stretch — `p = clamp(0.5 + margin × (0.5 / (holesLeft + 1)))`, so a
     2-up lead with 2 to play ≈ .83, dormie ≈ certain. (Simple, monotone,
     good enough for a bar argument.)
   - **Scramble placement** (12 points across 6/4/2/0): pre-round 0.5 on the
     A-share; live, derive each foursome's expected finish from current gross
     gap per hole remaining, convert placements → expected A points, and a
     spread for the DP (three outcome buckets: A-heavy / split / B-heavy).
3. **Exact DP over the undecided bets** (each contributes its value to A or
   B with its probability) → distribution of Team A's final total →
   `P(A > 18)`, `P(tie at 18)`, `P(B > 18)`. Bet count is small (≤ 12 × 3
   segments), so the DP over half-point totals is trivially fast; memoized
   per state change.
4. **Fractional odds** for flavor: convert p → nearest classic book fraction
   from a fixed ladder (1–10, 1–5, 2–5, 4–5, EVN, 6–5, 2–1, 7–2, 5–1, 10–1),
   clamped so a clinched race prints "OFF THE BOARD".

## Surface

- **HomePage**, a card directly under the leaderboard: "THE MORNING LINE" in
  slab caps, one row per team — dot, name, big fractional odds, small
  percentage + "to win the trip". A `P(tie)` footnote when ≥ 1% ("push pays
  nobody · 3%"). Chalkboard-vintage type but on the existing cream card
  system (no new theme).
- Optional (v2): odds-swing feed event when P(A) crosses 25/50/75%.

## Implementation

1. **`src/scoring/odds.ts`** (pure): `computeOdds(state, contexts):
   { pA, pB, pTie, fracA, fracB, locked: {a, b}, remaining }` built on
   `computeMatchState` / `computeScrambleGroupTotal` / `SCRAMBLE_PLACE_POINTS`.
2. **`src/scoring/odds.test.ts`**: fresh seed → 50/50 EVN; A mathematically
   clinched (> 18 locked) → pA = 1, "OFF THE BOARD"; dormie bet ≈ certain
   that bet; probabilities sum to 1; scramble-only remainder splits sanely.
3. **`src/pages/HomePage.tsx`**: render the card (memoized on state).
4. **CSS**: `.oddsboard` block — rules, tabular numerals, big fractions.

## Effort / risk

~Half a day, most of it in the scramble bucket heuristic and the tests.
Zero sync surface; display-only.
