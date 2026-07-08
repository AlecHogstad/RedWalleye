# Red Walleye ⛳ Golf Trip Scoring

A phone-friendly web app for scoring a team match-play golf trip where everyone
has a different handicap. Built with React + TypeScript + Vite. No login, no
backend — open the link and keep score.

**Live app:** https://alechogstad.github.io/RedWalleye/ &nbsp;_(once Pages is enabled — see below)_

---

## What it does

- **Live match play** — running "who's up" and a team leaderboard that update as
  scores go in (`2 UP thru 7`, closes out to `3&2`, etc.).
- **Handicaps done for you** — the hard part the group was stuck on:
  - **Four-Ball (match play):** every player gets strokes off the **low
    player in the match**, allocated hole-by-hole by each hole's stroke index.
    Best net ball on each hole counts. The lower total of those best net balls
    also takes a stroke-play win — bragging rights only.
  - **4-Man Best Ball (stroke play):** best net ball per hole, strokes off the
    **whole field's** low player. Lowest team total to par wins the round.
  - **Scramble (stroke play):** all four play one ball, so each **team** gets a
    scramble handicap (35/15 for pairs, 25/20/15/10 for foursomes) taken off the
    field's low team handicap. Lowest net round wins. Keeps lopsided teams fair
    without messing up the one-ball-per-team format.
- **Pre-loaded** with the four teams, everyone's handicaps, and the Round 1 / 2 /
  3 matchups from the group chat — all editable in the app.
- **Saves automatically** on each phone (localStorage). One scorekeeper per group.

## Using it on the course

1. Open the link on your phone (add to Home Screen for an app-like feel).
2. One person per group taps a match on the **Tournament** tab.
3. Each hole: tap **+** to start everyone at par, then adjust. Handicap strokes
   (red dots) are already baked into the net score and the match result.
4. Swipe through holes with **‹ ›** or jump around with the hole grid.
5. The leaderboard on the home tab reflects finished matches automatically.

Edit players/handicaps on the **Teams** tab and pars/stroke index on the
**Course** tab. **Course → Reset all data** wipes this phone back to the start.

## Formats & how points work

| Round | Format | Strokes | Points |
| ----- | ------ | ------- | ------ |
| 1 | Four-Ball (2-man best ball, match play) | Off low player in the match | 1 per match won, ½ for a halve (4 total) |
| 2 | Scramble (team stroke play) | Team scramble handicap off the field's low team | 3 / 1 / 0 / 0 by finish (4 total) |
| 3 | 4-Man Best Ball (team stroke play) | Off the field's low player | 2 to the low-net team, split on ties |

Match-play points lock in when a match is closed out or all 18 holes are
entered; a stroke-play round pays out once every team finishes. Total pot: 10.
Round 1 also crowns a stroke-play winner per match, but that's bragging rights
only — no points.

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
