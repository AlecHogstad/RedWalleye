# Red Walleye ⛳ Golf Trip Scoring

A phone-friendly web app for scoring a team match-play golf trip where everyone
has a different handicap. Built with React + TypeScript + Vite. No login, no
backend — open the link and keep score.

**Live app:** https://alechogstad.github.io/RedWalleye/ &nbsp;_(once Pages is enabled — see below)_

---

## What it does

- **Two teams, head-to-head** — captains draft two teams of 8, and it's Team A
  vs Team B every round.
- **Nassau scoring** — every match is three bets: the front 9, the back 9, and
  the overall 18. Each bet goes to whoever wins more holes in that stretch
  (a halve splits it). Running "who's up" and a team leaderboard update live.
- **Handicaps done for you** — the hard part the group was stuck on:
  - **Best ball (Four-Ball & 4-Man):** every player gets strokes off the **low
    player in the match**, hole-by-hole by stroke index. Best net ball counts.
  - **Scramble:** each side plays one ball, scored on the **raw team score** —
    no handicap, since a four-man scramble is low enough on its own.
- **Saves automatically** on each phone (localStorage) and syncs live to every
  phone. One scorekeeper per group.

## Using it on the course

1. Open the link on your phone (add to Home Screen for an app-like feel).
2. One person per group taps a match on the **Tournament** tab.
3. Each hole: tap **+** to start everyone at par, then adjust. Handicap strokes
   (red dots) are already baked into the net score and the match result.
4. Swipe through holes with **‹ ›** or jump around with the hole grid.
5. The leaderboard on the home tab reflects finished matches automatically.

Rename teams on the **Teams** tab, edit players/handicaps on the **Players**
tab, and pars/stroke index on the **Course** tab. **Course → Reset all data**
wipes this phone back to the start.

## Formats & how points work

Every match is a Nassau (front 9 / back 9 / match). How much each bet is worth
depends on the round, so every round is worth 12 points:

| Round | Format | Matches | Per bet | Per match | Round |
| ----- | ------ | ------- | ------- | --------- | ----- |
| 1 | Four-Ball (2-man best ball) | 4 (2v2) | 1 | 3 | 12 |
| 2 | Scramble (4-man, raw score) | 2 (4v4) | 2 | 6 | 12 |
| 3 | 4-Man Best Ball | 2 (4v4) | 2 | 6 | 12 |

Each bet locks as it finishes (a segment is decided when one side is up by more
holes than remain in it). **Total pot: 36** — most points across the three
rounds wins the trip.

---

## Enable the live link (one-time, ~30 seconds)

The app auto-builds and deploys on every push via GitHub Actions. To turn it on:

1. Go to the repo on GitHub → **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Push (or re-run the **Deploy to GitHub Pages** workflow under the Actions
   tab). It'll publish to the live link above.

## Run it locally

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # scoring-engine unit tests
npm run build    # production build into dist/
```

## How it's organized

```
src/
  types.ts              # domain types
  data/seed.ts          # teams, handicaps, course, matchups
  scoring/engine.ts     # all handicap + match-play logic (pure, tested)
  scoring/engine.test.ts
  store/store.tsx       # localStorage-backed state
  pages/                # Tournament, Match scorecard, Teams, Course
```

The scoring engine is pure and unit-tested, so the handicap math can be trusted
before anyone tees off.
