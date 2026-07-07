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
- **Four-Ball / 4-Man Best Ball**: every player gets match strokes equal to
  their course handicap minus the LOWEST course handicap in the match. Best
  net ball per side wins the hole.
- **Scramble**: individual strokes are impossible (one team ball), so each
  team gets a scramble handicap — 35%/15% of low/high for 2-man,
  25/20/15/10 for 4-man — and the higher team receives the difference as
  match strokes. Scramble scores are stored under the key `team:<teamId>`.
- **Match play**: running status ("2 UP thru 7"), early closeout ("3&2" when
  margin > holes remaining), halves. 1 point per win, ½ per halved match;
  points lock when a match completes. Standings roll up in
  `computeStandings`.

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

## Decisions already made (don't relitigate without asking Alec)

- Local-first, no backend/auth — chosen over Firebase live-sync for
  zero-setup reliability on the course. Live sync is a possible future add.
- Formats: Four-Ball, Scramble, 4-Man Best Ball. Alternate Shot was
  deliberately dropped (group chat vetoed it).
- Hosting: GitHub Pages (repo is public to allow it on the free plan).

## Ideas parked for later

- Optional live score sync (Firebase/Supabase) — would also make the round
  start gate truly one-person-locks-everyone
- Per-player tee selection within a round (currently one tee set per round)
- Editable team names in the Teams tab
- Stack long 4-man team names on match cards (they truncate on narrow phones)
