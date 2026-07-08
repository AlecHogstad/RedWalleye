# Red Walleye Golf Club ⛳

**Personal project — a for-fun golf trip scoring app for the "Red Walleye" friend
group. Not client work. No relation to any other repository or client project.**

Live app: https://alechogstad.github.io/RedWalleye/

## What this is

A mobile-first web app the whole golf trip opens from one link. It handles the
thing the group chat was stuck on: playing team match-play formats fairly when
everyone has a different handicap. One scorekeeper per group enters scores
hole-by-hole; match status and the team leaderboard update live.

## Stack & commands

React 18 + TypeScript + Vite. No backend — state lives in localStorage per
phone. Hash routing (`react-router-dom`) because GitHub Pages has no server
rewrites. Fonts are self-hosted via `@fontsource` so they render offline on
the course.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # vitest — scoring engine unit tests
npm run build    # tsc -b && vite build → dist/
```

Deploys automatically: `.github/workflows/deploy.yml` builds, tests, and
publishes to GitHub Pages on every push to `main`. The `github-pages`
environment only allows deploys from `main`, so work merges before it ships.
`vite.config.ts` sets `base: "/RedWalleye/"` for production builds.

## How scoring works (the important domain logic)

All of it lives in `src/scoring/engine.ts` — pure functions, unit-tested in
`engine.test.ts`. Don't change scoring behavior without updating tests.

- **Course handicap**: when a round has tees selected, the USGA formula —
  `index × (slope ÷ 113) + (rating − par)`, rounded. Without a tee (round not
  started) it falls back to the rounded index. See `courseHandicap(hi, ctx)`.
- **Stroke allocation**: strokes are given hole-by-hole using each hole's
  stroke index (HDCP 1 = hardest). `strokesOnHole(total, si)` handles totals
  over 18 (second stroke rolls onto hardest holes).
- **Four-Ball (Round 1) is MATCH PLAY**: every player gets match strokes equal
  to their course handicap minus the LOWEST course handicap in the match. Best
  net ball per side wins the hole. It *also* carries a stroke-play sub-result
  (`MatchState.strokePlay`): the lower total of those same best net balls wins
  on strokes — bragging rights only, no tournament points. A side can win the
  match yet lose on strokes.
- **Scramble (Round 2) is TEAM STROKE PLAY, not match play**: all four of a
  team play one scramble ball (one Match entry per team, sideB empty, score
  under `team:<teamId>`). Each team gets a scramble handicap — 35%/15% of
  low/high for 2-man, 25/20/15/10 for 4-man — taken off the WHOLE FIELD's low
  team handicap so nets compare. Once all teams finish 18, points are placement
  based: **3 / 1 / 0 / 0** by finish (ties pool the positions' points and
  split). See the scramble branch in `allocateStrokes`/`computeStrokePlay` and
  `awardStrokePlayPoints`.
- **4-Man Best Ball (Round 3) is TEAM STROKE PLAY, not match play**: every
  team tees off as its own foursome (one Match entry per team, sideB
  empty). Best net ball per hole, cumulative to par; strokes are given off
  the WHOLE FIELD's low course handicap so team totals compare. Once all
  teams finish 18, the low-net team gets 2 points (split on ties). See
  `computeStrokePlay` + the fourman branch in `computeStandings`.
- **Match play** (four-ball only): running status ("2 UP thru 7"), early
  closeout ("3&2" when margin > holes remaining), halves. 1 point per win,
  ½ per halved match; points lock when a match completes. Stroke-play rounds
  award their prize (see above) once every team finishes. Standings roll up in
  `computeStandings`. Total pot: 4 (R1) + 4 (R2: 3+1) + 2 (R3) = 10 points.
  `isStrokePlay(format)` distinguishes the two families throughout the code.

## Activity feed (derived, not stored)

`src/scoring/activity.ts` (pure, unit-tested in `activity.test.ts`) builds the
Activity tab feed as a **function of tournament state** — birdies/eagles/aces,
net blow-ups, match-lead changes, comebacks, closeouts, and the overall trip
lead are all replayed from the scores that already sync, so no new DB rows and
no cross-phone races. Only genuinely discrete actions (booze mulligans) are
stored `ActivityEvent`s. Scores carry no wall-clock, so the feed is ordered by
golf chronology (later round → higher hole → bigger moment), not "5m ago".
Overall-lead changes settle per finished round (exact), not per hole. Rendered
in `src/pages/TickerPage.tsx`.

## Rounds: start gate

Rounds are `pending → active → final` (`Round.status`). One person taps
Start Round and picks the **course + tees** — that fixes every player's
course handicap for the round. While a round is active, all other rounds are
locked (matches untappable). Finish Round unlocks; a final round is
view-only, with a Reopen escape hatch. Because the app is local-first the
gate is per-phone: each scorekeeper's phone starts the round with the same
course/tees.

## Data

`src/data/seed.ts` holds the four teams (Team 01–04), all 16 players with
real handicaps from the trip sheet, Round 1 (Four-Ball), Round 2 (Scramble),
Round 3 (4-Man Best Ball) matchups, and the courses. **Both courses are real
data from their scorecards** — Big Fish Golf Club (5 tees, Tournament
74.1/134) and Hayward Golf Club (5 tees, Black 72.4/126) — pars, yardages,
tee ratings/slopes, and actual HDCP ranks.
**Bump `STATE_VERSION` whenever seed shape/content changes** — it invalidates
stored localStorage state on users' phones (fine before the trip, destructive
during it).

## Design system (vintage country-club theme)

Inspired by retro golf-club branding (LWGC logo package / "FOUR!" social
posts). Defined in `src/index.css`:

- **Palette**: cream `#f4eddb` paper, burnt orange `#de4f2c`, forest green
  `#1e4a2b`, sky blue `#bfe2ef`, sand `#e2c77e`, ink `#26301f`.
- **Per-screen block colors** (like the inspo phones): Tournament = orange,
  Match scorecard = green, Teams = sky blue, Course = sand. Theme class is set
  on `.app` by route in `App.tsx`.
- **Type**: Alfa Slab One for display (headings, results, hole numbers,
  scores); Fraunces italic for accents ("thru 7", hints, meta). System sans
  for body/UI.
- **Motifs**: RWGC stacked lockup with checkered flag through it (header),
  oval outline badges for statuses/round formats/active tab, checkered flag
  markers (`src/components/CheckFlag.tsx`) on finished matches and the
  leaderboard leader.

## Live sync (Supabase)

`src/sync/sync.ts` syncs the tournament delta (scores, round statuses,
player/hole edits) across every phone via one Supabase key/value table
(`rw_kv`), namespaced by `STATE_VERSION`. Writes are fine-grained rows
(one score = one row) applied optimistically to a local mirror and queued
in localStorage, flushing whenever there's signal — dead zones on the
course lose nothing. The round start gate becomes global in this mode:
one person starting/finishing a round locks/unlocks every phone. A
live/offline indicator replaces "est. 2026" in the header.

Sync activates when `src/sync/supabaseConfig.ts` has the project URL +
anon key (public identifiers, safe to commit; access is governed by RLS
policies). While it's `null` the app is local-only per phone. The table
DDL to run in the Supabase SQL editor is in the header comment of
`sync.ts`. Reset in synced mode wipes the shared table for everyone.

## Decisions already made (don't relitigate without asking Alec)

- Started local-first; live sync added via Alec's existing Supabase
  account (chosen over Firebase because the account already existed).
- Formats: Four-Ball, Scramble, 4-Man Best Ball. Alternate Shot was
  deliberately dropped (group chat vetoed it).
- Hosting: GitHub Pages (repo is public to allow it on the free plan).

## Ideas parked for later

- Per-player tee selection within a round (currently one tee set per round)
- Editable team names in the Teams tab
- Stack long 4-man team names on match cards (they truncate on narrow phones)
