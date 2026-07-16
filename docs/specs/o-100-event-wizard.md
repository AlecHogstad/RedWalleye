# O-100 — Event Creation Wizard

**Status:** Definition (moves O-100 from *Needs Definition* → buildable)
**Milestone:** A1 — Self-Service Organizer Flow (target Nov 15)
**Primary issue:** [O-100](https://linear.app/loon-studio/issue/O-100) — *Event creation wizard (<10 min to a working event)*
**Depends on (A0/S1):** O-90 schema+RLS · O-91 auth · O-92 claim flow · O-94 tenant-isolation CI · O-96 course component
**Related:** O-101 roster tools · O-102 organizer score entry · O-105 event editing/hygiene · O-108 free-tier caps

> Authority order per project CLAUDE.md: product doc → this spec/issue → ask. Anything below tagged **[NEEDS SIGN-OFF]** touches the SETTLED O-90 schema or a Hard Rule and must be confirmed before implementation.

---

## 1. Goal & non-goals

**Goal (from O-100 "done when"):** a brand-new organizer account goes from signup to a **joinable event with a share link in one sitting, no documentation**. Under 10 minutes. Works whether the organizer sets up weeks ahead or is standing on the first tee.

**Non-goals (owned elsewhere):**
- Course search / entry — reuses **O-96** (library → GolfCourseAPI prefill → manual); the wizard only *selects* a course + tee.
- Deep roster management (unbind, PIN reset, re-issue links) — **O-101**. The wizard does the minimum: set team count, optionally pre-enter names, and remove a player.
- Score entry — **O-102 / O-97**.
- Payment — the wizard is **payment-agnostic**. Free-tier caps (O-108) and Stripe (O-107) are A2 and wrap *around* creation; they are not wizard steps.

---

## 2. Decisions settled for this spec

From the design conversation, treated as settled here (still editable in the product, not re-litigated in build):

1. **Wizard collects the skeleton; roster fills over time.** The "people" step is roster-only: **number of teams** (editable) + optional pre-entered names. Actual golfers mostly arrive by opening the share link and adding themselves.
2. **Players self-add via the link** (O-92 claim flow): open link → tap your name to claim, or add yourself (name + handicap).
3. **Organizer can remove a player** — first-class, one tap, for "someone got the URL" / "two guys tapped Mike."
4. **Game types are chosen during setup**, with house rules that **lock at first tee-off** (editable while the event is in draft — reconciles "locked at creation" with advance-or-day-of setup).
5. **Team-count validation rule** governs which games are legal (see §5).
6. **Match pairing is manual *or* random** (see §7).
7. **Timing is flexible:** the event is a durable draft; setup can happen weeks ahead or day-of. Nothing forces immediate completion.

---

## 3. Event lifecycle

The event is created early and refined in stages, so no work is lost and the day-of path is fast.

```
draft ──▶ ready ──▶ active ──▶ final
  │         │          │
  │         │          └─ a round has started; house rules + games LOCKED
  │         └─ roster present, teams assigned, pairings set — shareable & playable
  └─ created by the wizard (name+dates); everything editable
```

- **draft** — exists the moment step 1 completes. Config fully editable. Share link already works (players can join and self-add).
- **ready** — enough to play: ≥1 round with course+tee+game, roster assigned to teams, pairings generated. (Soft state — mostly a UI checklist, see §9.)
- **active** — first round started. **House rules, game selection, and team structure lock** (§6). Roster edits (add/remove) still allowed with an audit trail.
- **final** — all rounds finished. Read-only + recap cards (O-111).

`events.status` carries this; `events.payment_status` is orthogonal (A2).

---

## 4. What the wizard writes (data model)

Maps onto the SETTLED O-90 tables, plus one flagged addition for team play.

| Table | Wizard writes |
|---|---|
| `events` | `organizer_id` (auth.uid), `name`, `dates`, `status='draft'`, `payment_status='unpaid'`, `join_code` |
| `rounds` | one per round: `event_id`, `course_id`, `tee_id`, `date`, `status='pending'` |
| `games` | one per event (or per round — see §6): `type`, `config_json` (= selected format + House Rules) |
| `event_players` | any pre-entered names (`name`, `handicap`); most rows created later on join |

### 4a. Team + pairing storage **[NEEDS SIGN-OFF — amends O-90]**

O-90 as written has **no `teams` and no `matches` table**, but the engine is team-based. Proposed minimal delta:

- **Teams:** new `teams` table — `id, event_id, name, color, ordinal`. `event_players` gains `team_id uuid null` (null = unassigned / individual play). A real table (vs an int + JSON) keeps team names/colors editable and RLS clean.
- **Pairings (head-to-head only):** field/individual games need **no** pairing storage — standings rank `round_players` directly. Two-team head-to-head games store pairings per round. **Recommended v1:** a `round_matches` JSON column on `rounds` (or on the round's `games` row): `[{ sideA: [playerRef…], sideB: [playerRef…] }]`. Promote to a `round_matches` table if query/RLS needs force it (fast-follow, not launch).

*Rationale:* honors "boring solutions, defer complexity" — one small table + a JSON column, no relational weight until volume justifies it. Both carry RLS scoped by `event_id` (default-deny, per Hard Rule 2).

---

## 5. Team model & the team-count rule

The wizard offers **Individual · 2 teams · N teams**. The engine today is strictly 2-team, A-vs-B head-to-head, so game legality is **validated against team count**:

| Team setting | Legal games | Standings |
|---|---|---|
| Individual (no teams) | Skins, Stableford, stroke/net | per-player leaderboard |
| **2 teams** | **all** — four-ball, singles, 4-man best ball (head-to-head Nassau) **+** scramble, Skins, Stableford | team points (existing engine) |
| N teams (>2) | field/individual only — scramble placement, Skins, Stableford, stroke/net | **cumulative** team leaderboard |

- Head-to-head games (Nassau) are inherently two-sided → **require exactly 2 teams**. The wizard blocks the illegal combo (pick a Nassau game ⇒ team count locks to 2; pick >2 teams ⇒ Nassau games disabled) rather than shipping a broken 3-team Nassau (Hard Rule 5).
- N-team **head-to-head round-robin** is a defined **fast-follow**, not a launch blocker.
- Engine work for v1: **zero** for the 2-team case; a cumulative team roll-up over field placement for the N-team case (scramble placement already ranks N groups — generalizes cleanly).

---

## 6. Games & house rules

Reuses the merged games engine directly — this is the biggest piece we get for free.

- The wizard's game step **iterates `FORMAT_REGISTRY` / `SIDEGAME_REGISTRY`** and renders the **schema-driven House Rules controls** already built (`rulesSchema` → steppers/lists). No bespoke UI per game.
- `games.config_json` **is** the `HouseRules` blob: `{ format, formatRules, sideGames: { <id>: rules } }`, resolved against each plugin's `defaultRules` at scoring time (`resolveFormatRules` / `resolveSideGameRules`).
- **Per-round vs per-event games:** each round selects one format (invariant: one format per round, kept from the engine). Side games can be per-event. Model `games` as **one row per round** (`type` = the round's format) + event-level side-game rows, or a single event `config_json` keyed by round — **[decide in build; leaning one row per round]**.
- **Lock timing:** editable while `status='draft'`; **locks when the first round starts** (`status→active`). Same `houseRulesEditable` gate we shipped, moved to the event boundary. "No mid-round reconfiguration" (product principle) holds.
- **Games ship complete or not at all** (Hard Rule 5): a game only appears in the picker when its scoring + rules tests pass. Stroke/net is the clean default so "just track scores" is never a half-game.

---

## 7. Match pairing (manual or random)

Only relevant for **2-team head-to-head** rounds (field/individual games have no pairings). Generated per round after the roster + teams exist (day-of is fine).

- **Manual** — the matchup builder (exists): assign seats per match; validated so nobody plays twice and each side has `seatsPerSide` golfers for the round's format.
- **Random** — new: shuffle each team's assigned players into the round's match slots, respecting `seatsPerSide`, filling side A from team A and side B from team B, nobody twice. Re-roll button. Pure + unit-tested (deterministic given a seed passed in — no `Math.random` in the tested core).
- Slots are auto-generated from roster size + `seatsPerSide` (e.g. 8-a-side four-ball → four 2v2 matches), then editable. Uneven rosters surface a warning (a benched golfer / short match), not a hard block.

---

## 8. Roster & moderation

- **Pre-enter (optional):** organizer types names + handicaps in the wizard. Zero required — a valid event can ship with an empty roster and fill via the link.
- **Self-add on join (O-92):** open link → claim a pre-entered name (binds anon UID) or add self (name + handicap). Frictionless — no account, no email (Hard Rule 3).
- **Remove a player (organizer only):**
  - *Before they've entered any score* → hard delete the `event_players` row (and unbind any claim).
  - *After they've scored* → **soft withdraw** (`status='withdrawn'`): scores retained, excluded from standings/pairings, reversible. Preserves the audit trail (O-105) and avoids orphaned `scores`.
  - Authz: organizer of that event only, enforced by RLS — never client-only (Hard Rule 2, O-94).
- **Rejoin PIN / re-issue** live in O-101; the wizard surfaces only add + remove.

---

## 9. Wizard flow (screens)

Create-then-refine: the `events` row is written at step 1 so a bail-out loses nothing, and every later step round-trips to the server.

1. **Basics** — name, dates. → writes `events` (draft) + `join_code`. *Share link is already live.*
2. **Rounds & courses** — add N rounds; each: date + course/tee (O-96) + **game type** (registry) + house rules (schema controls). One format per round.
3. **Teams** — Individual / 2 / N. Sets `teams` rows. Team count validates the games chosen in step 2 (§5); illegal combos are prevented inline, not error-toasted after.
4. **Roster** — optional pre-enter (name + handicap). "You can also just share the link and let people add themselves."
5. **Review & share** — checklist of what's ready vs pending (e.g. "teams unassigned", "pairings not set — do it here or day-of"), the **share link + event code**, and QR. Land on the **organizer event dashboard**.

Team **assignment** (who's on which team) and **pairing** (§7) are offered on the dashboard as **manual / random / draft** — done now or day-of once the roster is full. They are deliberately *out* of the linear wizard so an organizer can reach a share link before anyone has committed to coming.

**Day-of fast path:** Basics → one round (course+tee+game) → 2 teams → Review/share is well under 10 minutes; roster self-adds at the tee, then one tap "Random pairings" and go.

---

## 10. Engine reuse boundary

- **Keep:** the pure scoring functions (Nassau, scramble placement, Stableford, `resolveFormatRules`/`resolveSideGameRules`, `computeStandings`) and the registries. `games.config_json` is their `HouseRules` input.
- **Rebuild:** the **input adapter**. Today the engine reads `TournamentState.matches[].scores` (in-memory, kv-synced). The product reads `scores` rows from Postgres filtered by round/event, and pairings from `round_matches`. Write a thin adapter that assembles the engine's `Match`/`Side` view from `round_players` + `round_matches` + `scores`, then feed the unchanged pure functions.
- **Standings** become a **Supabase Realtime** subscription on `scores` filtered by event, recomputed client-side through the same functions (Raw / Net / Game toggle).
- The WHS/Alden index engine (O-93) is separate; the event engine does gross/net + game points only.

---

## 11. RLS / tenant isolation (must pass O-94)

Every new table ships policies in its migration (Hard Rule 2, default-deny):
- `teams`, `round_matches` (or JSON on `rounds`): read/write scoped to the event's organizer + that event's roster-bound anon UIDs; players never write team/pairing structure.
- `event_players`: organizer full; a player may edit only their own bound row; remove is organizer-only.
- Reuse the O-94 suite: a second fake event proves zero bleed on teams, pairings, and roster.

---

## 12. Open questions / deferred

- **[SIGN-OFF]** §4a — add `teams` table + `event_players.team_id` + `round_matches` (JSON v1). Amends O-90.
- **[SIGN-OFF]** §5 — confirm the team-count rule (2-team head-to-head; N-team = field/cumulative only for v1).
- Team **assignment** method set: manual + random for v1; **draft** (reuse snake-draft) as an option — confirm it's in v1 or a fast-follow.
- `games` granularity: one row per round vs one event `config_json` (§6) — decide in build.
- Per-player tees within a round — deferred (one tee per round for v1, matches the PoC).
- N-team head-to-head round-robin — deferred.

---

## 13. Acceptance criteria

1. A fresh organizer account creates a **joinable event with a share link in one sitting, no docs** (O-100 done-when).
2. Day-of path (1 round, 2 teams, self-add roster, random pairings) completes **< 10 minutes**.
3. A player opens the link and self-adds with **no account** (Hard Rule 3).
4. Organizer **removes** an errant/duplicate player; pre-score = deleted, post-score = withdrawn with scores retained.
5. Choosing a head-to-head game **forces 2 teams**; choosing >2 teams **hides** head-to-head games (no broken game shipped — Hard Rule 5).
6. Pairings generate **manually and randomly**, respecting `seatsPerSide` and no-double-play.
7. Game/house-rules edits allowed in `draft`, **blocked once a round starts**.
8. New tables pass the **O-94 tenant-isolation** suite in CI; no dollars anywhere in the flow (Hard Rule 1).
