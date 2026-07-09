# Course GPS — where am I on the course?

_Exploration for a future iteration. Status: prototype on `claude/course-gps`.
Not wired into scoring, not merged._

## Goal

Let a player open the app on the tee or in the fairway and see **how far they
are from the pin** (and eventually hazards / layups), the way a $300 golf GPS
watch does — but inside the app everyone already has open for scoring.

## What makes this app-specific

Any GPS feature has to survive the same constraints the rest of the app was
built around:

- **Offline-first PWA.** The course has dead zones. Whatever we build has to
  work with zero bars, like scoring already does.
- **No real backend.** State syncs through one Supabase key/value table
  (`rw_kv`); there's no server to call a golf-data API from.
- **GitHub Pages + free tier.** No place to proxy a paid tiles/data provider,
  and API keys in a public repo are exposed.
- **Minimalist vintage brand.** A busy satellite map fights the whole look; a
  single clean yardage number fits it.
- **Battery.** Continuous high-accuracy GPS drains phones; a 5-hour round can't
  flatten everyone's battery before the turn.

These push hard toward the **rangefinder** direction below, not a live map.

## Two directions

### A. Rangefinder distances — _recommended_

Show the number a golfer actually wants: **"147 to the center of the green."**
Optionally front / center / back, and later hazard carries.

- Device position comes from the browser **Geolocation API** (on-device, works
  offline, HTTPS-only — which GitHub Pages already is).
- Distance is a local **haversine** calc against the hole's green coordinate.
- No tiles, no API key, no network. Tiny footprint. Reads as one big number
  that suits the brand.

This is Phase 1. The prototype on this branch implements exactly this.

### B. Live map — _later, maybe_

A "you are here" dot on a satellite/vector map of the hole.

- Needs a tile provider (Mapbox/Google/Esri): API key (exposed in a public
  repo), usage cost, and a **network dependency that dies in the exact dead
  zones** where you need it. Tiles can be precached per course, but that's a
  lot of MB in the service worker for a marginal win over a clean number.
- Heavier bundle (Mapbox GL is ~200KB+), and a busy map clashes with the
  design system.

Verdict: not worth it for Phase 1. Revisit only if the group specifically wants
a visual of hazards/doglegs a number can't convey.

## The hard part: where do the green coordinates come from?

Distances are easy; **knowing where each green is** is the real problem. Options:

1. **External golf-course data / APIs.** Providers exist (e.g. course-mapping
   datasets) but are mostly paid/licensed, and we'd have no server to call them
   from. Rejected for now.
2. **Digitize from satellite imagery.** Open a course in a map tool, click each
   green (and tee), and paste the lat/lng into seed data. Accurate and free, but
   manual per course and per hole (18 × 2 courses = tedious, and greens are big
   so "center" is a judgment call).
3. **Self-calibrating pins — _recommended._** The first person to reach each
   green taps **"Mark the pin"**; the app captures their current GPS coordinate
   and syncs it. Every phone after that reads live yards to it. This:
   - needs **no external data and no API** — perfect for the constraints,
   - fits the app's **local-first, crowd-sourced** ethos (like the way scores
     and mulligans already flow),
   - is accurate to where the pin actually is _today_ (pins move!),
   - and doubles as tee/hazard capture with the same gesture.

   The trade-off: the first group on a hole gets no distance until someone
   marks it. Mitigations: pre-seed greens once by walking the course before the
   trip (or digitize option 2 as a starting point), and captured pins persist
   across rounds so it's a one-time cost.

The prototype demonstrates option 3 end-to-end (mark a spot, get live yards to
it) with zero course data.

## Data model (when it graduates from prototype)

Add an optional geo block per hole — optional so nothing breaks and no
immediate `STATE_VERSION` bump is forced:

```ts
interface HoleGeo {
  green?: LatLng;              // center (or front/center/back later)
  tee?: Record<string, LatLng>; // by tee name, optional
}
```

Captured pins would sync as their own `rw_kv` entity (e.g. `rw|coursegeo|<courseId>`),
following the existing `RemoteData` / `kvToRemote` / `applyRemote` / `remoteWrite`
pattern. Only **course coordinates** are ever synced — never a player's live
position (see Privacy). Bump `STATE_VERSION` when the seed gains a geo shape.

## Device location details

- **API:** `navigator.geolocation.watchPosition(...)` with
  `enableHighAccuracy: true` (asks for GPS, not wifi/cell). Returns lat/lng +
  `accuracy` (meters). Wrapped in `src/gps/useGeolocation.ts`.
- **Permissions:** must be triggered from a user gesture (iOS Safari
  requirement) — hence the explicit "Start GPS" tap. Handle denied / unavailable
  / timeout states gracefully (the prototype does).
- **Accuracy:** phone GPS is typically good to a few yards in the open, worse
  under tree cover. Always show the accuracy so the number is honest.
- **Battery:** stop the watch when the tab is backgrounded / a hole isn't being
  viewed; consider a lower-power mode between shots. A real feature should not
  hold a high-accuracy watch for the whole round.

## Distance math

`src/gps/geo.ts` (pure, unit-tested in `geo.test.ts`):

- `metersBetween(a, b)` — haversine great-circle distance.
- `yardsBetween(a, b)` / `metersToYards(m)` — golf's native unit, whole yards.
- `bearingBetween(a, b)` — for a "pin is NE" hint or pointing an arrow later.

"Plays like" adjustments (elevation, wind) are out of scope — a straight-line
yardage is what a basic GPS gives and is plenty.

## UI

- **Prototype (this branch):** a standalone `/gps` screen (linked from Settings)
  that turns on GPS, shows position + accuracy, lets you mark a pin, and reads
  live yards to it. Kept out of the scoring flow on purpose.
- **Real feature:** a compact yardage strip on the match/hole scoring page — a
  big "147" with a small "to center" and a "Mark pin" affordance the first time
  a hole has no coordinate. Front/center/back as a secondary line.

## Privacy

Player positions never leave the phone. The Geolocation reading is used locally
to compute a distance and is discarded. The only thing that ever syncs is a
**captured pin/tee coordinate** — a fact about the course, not about a person.
Worth stating plainly in the UI when we ask for location permission.

## Suggested phasing

1. **Phase 1** — rangefinder to the green + self-calibrating pins, synced via
   `rw_kv`. On-device, offline, no API. (This branch is the nucleus.)
2. **Phase 2** — tees and hazard/layup carries via the same mark gesture;
   front/center/back green.
3. **Phase 3 (optional)** — a precached per-course map view, only if the group
   wants a visual a number can't give.

## Open questions for Alec

- Is a **clean yardage number** enough, or do you specifically want to _see_ a
  map of the hole? (Changes the whole cost/complexity picture.)
- Happy to **crowd-source pins** (first-to-the-green marks it), or should we
  pre-map both courses from satellite before the trip so distances exist on
  hole 1?
- Where should it live — its own tab, or a strip on the match scorecard?

## What's on this branch

- `src/gps/geo.ts` (+ `geo.test.ts`) — pure, tested distance/bearing math.
- `src/gps/useGeolocation.ts` — the Geolocation watch hook.
- `src/pages/GpsDemoPage.tsx` — the runnable `/gps` prototype.
- Route + Settings link + sand theme wiring in `App.tsx` / `SettingsHubPage.tsx`.
- This doc.

Try it: run the app, open **Settings → Course GPS**, tap **Start GPS**, and mark
a spot. On a phone outdoors you'll see it count yards as you walk.
