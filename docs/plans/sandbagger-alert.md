# Sandbagger Alert — 🚨 feed item when net scoring runs ahead of handicap

Trash-talk detector: a player whose **net** score is far under par is, by
definition, beating the handicap they claimed. Pure derivation inside the
existing activity feed — no new storage, no sync surface.

## Trigger (v1)

- Per player, per **fourball** round (the scramble is one team ball — no
  individual scores, always skipped).
- Walk the player's scored holes in order, accumulating
  `net-to-par = Σ (gross − strokesOnHole(courseHandicap, si) − par)` — the
  same per-hole math `activity.ts` already uses for birdie/blow-up detection.
- Fire when the running total first reaches **−4 or better with ≥ 9 holes
  played**. Deep-enough to be an outlier (net par is the handicap's own
  expectation), late enough to not cry wolf on a hot front three.
- **Once per player per round** — stable id `sandbag:<roundId>:<playerId>`,
  anchored at the triggering hole so it sorts into golf chronology.

## Surface

- New `FeedKind` `"sandbag"`, WEIGHT 5 (matchLead tier — juicy but below
  closeouts).
- Title copy in `TickerPage.title()`:
  "🚨 SANDBAGGER WATCH: Danny is 5 under net thru 12 — check that handicap."
  (value = |net-to-par|, hole = thru).
- Icon in `Icons.tsx`: a golf bag with a warning "!" (or siren) glyph,
  consistent stroke style with the existing set.

## Implementation

1. `src/scoring/activity.ts`:
   - add `"sandbag"` to `FeedKind`, `WEIGHT`, and the emit pass — a
     `sandbagEvents(match, players, ctx, roundIndex)` helper mirroring
     `matchProgressEvents`, guarded by `isScrambleFieldMatch` and
     `format === "scramble"`.
2. `src/pages/TickerPage.tsx`: `case "sandbag"` in `title()` (sub-line free —
   round · hole comes from the shared `sub()`).
3. `src/components/Icons.tsx`: `case "sandbag"` glyph.
4. `src/scoring/activity.test.ts`:
   - net −4 through 9 → exactly one event, right player/team/hole;
   - net −3 through 18 → no event;
   - fires once even if the player goes −4 → −6;
   - scramble round → never fires.

## Tuning knobs (constants at top of the helper)

`SANDBAG_NET = -4`, `SANDBAG_MIN_HOLES = 9`. If the group wants it spicier,
−3 is the "accusatory" setting.

## Effort / risk

2–3 hours. Derived-only; zero sync surface.
