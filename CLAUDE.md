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
**Two captain-drafted teams (A vs B) play head-to-head every round.** Every
match is a NASSAU — three separate bets: the front nine (holes 1–9), the back
nine (holes 10–18), and the overall 18. Each bet goes to whoever wins more holes
in that stretch; a halved bet splits 50/50. `computeMatchState` returns the
per-hole winners plus a `SegmentResult` for `front`, `back`, and `overall`
(headline fields alias the overall bet). Bets lock as they complete, so
`computeStandings` just sums `MatchState.points` for live standings.

- **How many holes count per side**: best net ball for the best-ball rounds
  (Rounds 1 & 3), the single raw team ball for the scramble (Round 2).
- **Stroke allocation** (`allocateStrokes`): best-ball rounds give strokes off
  the LOWEST course handicap in that match, hole-by-hole by stroke index. The
  scramble gives **no** strokes — both team balls are raw.
- **Segment value varies by format** so every round totals 12 points
  (`nassauSegmentValue`): four-ball = 1 pt/bet (4 matches × 3 = 12); scramble =
  2 pts/bet (2 matches × 6 = 12). **Total pot: 36** (12 per round).
- **Match structure**: Round 1 = four 2-man best-ball matches; Round 2 = two
  4-man scramble matches (score keys `team:tA` / `team:tB`); Round 3 = four
  2-man best-ball matches (same format as Round 1, different pairings). Only two
  formats exist — `fourball` and `scramble`. All matches are Team A vs Team B —
  `sideA.teamId` is always `tA`, `sideB.teamId` always `tB`. Match slots are
  seeded with placeholder rosters until the matchup builder / draft (later
  phases) fill them.

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

## Matchups (who plays who)

Match slots are seeded (A vs B, correct team on each side) but their **players
are filled in per round** by the matchup builder — `src/pages/MatchupsPage.tsx`
at `/matchups/:roundId`, reached from a "Set matchups" button on each pending
round. Each match shows a seat select per golfer (2 per side for best ball, 4
for the scramble); options are that team's roster minus anyone already slotted
elsewhere **in that round**, so nobody plays twice. It writes through
`store.setMatchup(matchId, sideAIds, sideBIds)`, which patches just the two
sides (via `remoteWrite.match` when synced) and is allowed only while **that
round is still `pending`** (independent of the other rounds). A completeness
banner tracks empty seats / benched golfers. (Team rosters themselves — which 8
players are on each team — come from the draft below; the seed ships a
placeholder split so everything works before a draft is run.)

## Draft (who's on each team)

`src/pages/DraftPage.tsx` at `/draft` (linked from Settings). Two captains are
chosen, then the rest are drafted to eight a side. Pure order logic lives in
`src/store/draft.ts` (unit-tested in `draft.test.ts`): captains are pre-assigned,
so **14 players** are drafted 7-per-side **alternating every other pick**
(A, B, A, B, …) (`pickTeam`, `currentPickTeam`, `picksLeftFor`).
State is a `DraftState` on `TournamentState.draft` (`status: setup|active|done`,
captains, `firstPick`, `picks[]`), synced as a **singleton row** `rw|draft|state`
(the one new sync entity — added to `RemoteData`/`kvToRemote`/`applyRemote`/
`remoteWrite.draft`). Store actions `startDraft` / `draftPick` / `undoLastPick` /
`resetDraft` set each `Player.teamId` **live** as picks happen. **Starting a
draft re-pools every non-captain and clears all match slots**, so matchups are
rebuilt afterward. Guarded on `rostersEditable` (pre-tournament only).

## Rounds: start gate

Rounds are `pending → active → final` (`Round.status`). One person taps
Start Round and picks the **course + tees** — that fixes every player's
course handicap for the round. While a round is active, all other rounds are
locked (matches untappable). Finish Round unlocks; a final round is
view-only, with a Reopen escape hatch. Because the app is local-first the
gate is per-phone: each scorekeeper's phone starts the round with the same
course/tees.

## Data

`src/data/seed.ts` holds the two teams (A / B, each with a `captainId`), all 16
players with real handicaps from the trip sheet, the head-to-head match slots
for Round 1 (Four-Ball ×4), Round 2 (Scramble ×2), Round 3 (Four-Ball ×4),
and the courses. Rosters/matchups are placeholders until the draft/matchup
builder fill them. **Both courses are real
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

## Offline & install (PWA)

`vite-plugin-pwa` (config in `vite.config.ts`) makes the app installable and
**cold-start offline** — a Workbox service worker precaches the whole app shell
(JS, CSS, the self-hosted `@fontsource` woff2 fonts, icons, manifest) so it opens
with zero bars at the tee box. This is separate from and complements the sync
write-queue: the SW gets the app *loaded* offline; the queue keeps *scores*
flowing once loaded. The SW never touches Supabase requests, so live sync still
goes straight to the network when there's signal. `registerType: "autoUpdate"`
means a new deploy refreshes every phone on its next load. Brand icons live in
`public/` (`pwa-192`/`pwa-512`/`pwa-maskable-512`/`apple-touch-icon` — the
checkered-flag motif in cream + burnt orange on forest green); regenerate them
with `node scripts/gen-icons.mjs` if the mark changes. Nothing to precache by hand:
Workbox reads the built asset list, so new hashed files are covered automatically.

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
