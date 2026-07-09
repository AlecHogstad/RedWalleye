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

Distances are easy; **knowing where each green is** is the real problem — and
walking off 36 greens by hand isn't realistic, so we need real course data.

**Key reframe: this is a one-time data fetch, not a runtime API.** Courses don't
move. We only need coordinates for **two fixed courses**, once — pull them,
verify them, and **bake them into `src/data/seed.ts`** shipped statically. That
keeps the app offline-first, exposes no API key in the public bundle, and makes
cost/rate-limits almost irrelevant (a single free-tier month, or one export,
covers it). The one hard constraint is **licensing: the repo is public, so
whatever coordinates we commit must be redistributable.**

Source options (ranked for our constraints):

| Source | Green GPS? | Cost | Public-repo redistribution |
| --- | --- | --- | --- |
| golfcourseapi.com (free) | No — scorecard only (par/yds/HDCP, which we already have) | Free | n/a |
| **OpenStreetMap / Overpass** | Yes — `golf=green`/`golf=tee` polygons → centroids | Free | **Yes — ODbL, with attribution** |
| golfapi.io | Yes — green + POI coords, REST or CSV export | Paid (quote only) | Must confirm — likely restricted |
| OpenGolfAPI (courses.opengolfapi.org) | Likely | ? | "Open" — check its terms |
| iGolf / Golf Intelligence / Golfbert | Yes — front/center/back + hazards | Commercial | Overkill |

**Recommended: OpenStreetMap first.** It's the only source that's both free and
redistributable into a public repo. Extract each hole's `golf=green` (and
`golf=tee`) with Overpass `out center` to get a centroid, bake into seed. If our
two small-town courses aren't well mapped, fall back to a **one-time** paid pull
from golfapi.io / OpenGolfAPI — but only after confirming we may store the
coordinates in a public repo (or keep that one data file private).

**Self-calibrating pins** (walk to a green, tap "Mark the pin," sync it) stay as
a nice *gap-filler* — good for a moved pin position on the day, or a hole OSM
missed — but not the primary way to get data. The prototype on this branch
demonstrates that capture-and-measure loop end-to-end with zero course data.

### Must verify before picking a source

1. **Coverage of our actual courses** — Big Fish GC and Hayward GC (Hayward, WI).
   Small courses aren't always mapped in OSM. Two-minute check on
   [overpass turbo](https://overpass-turbo.eu) with a `golf=green` query in the
   Hayward bounding box.
2. **Redistribution license** for any paid source, given the public repo.

(Both checks need outbound network access that the build sandbox blocks, so
they're the immediate human/next-session step.)

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

0. **Phase 0 — data.** Confirm coverage + license for our two courses, pull
   green (and tee) coordinates once from OSM (or a paid source if needed), and
   bake them into `seed.ts`. A one-time `scripts/` extractor can do the OSM pull
   and emit seed-ready `HoleGeo`. Nothing ships until this exists.
1. **Phase 1** — rangefinder to the green off the seeded coordinates, plus
   self-calibrating pins as a gap-filler (synced via `rw_kv`). On-device,
   offline, no runtime API. (This branch is the measure-and-display nucleus.)
2. **Phase 2** — tees and hazard/layup carries; front/center/back green.
3. **Phase 3 (optional)** — a precached per-course map view, only if the group
   wants a visual a number can't give.

## Open questions for Alec

- Is a **clean yardage number** enough, or do you specifically want to _see_ a
  map of the hole? (Changes the whole cost/complexity picture.)
- OK to depend on **OpenStreetMap** data (free, redistributable) if our two
  courses are mapped well enough — or should we pay for a one-time pull from a
  provider like golfapi.io and keep that data file private if its license
  forbids public redistribution?
- Where should it live — its own tab, or a strip on the match scorecard?

## Sources

- [golfcourseapi.com](https://golfcourseapi.com/) — free, ~30k courses, scorecard-oriented.
- [golfapi.io](https://www.golfapi.io/) — 42k courses, green + POI coordinates, REST/CSV, paid (contact for quote).
- [OpenGolfAPI](https://courses.opengolfapi.org/legal/terms) — "open" course database (check terms).
- [OpenStreetMap `golf=hole`](https://wiki.openstreetmap.org/wiki/Tag:golf%3Dhole) / [`Key:golf`](https://wiki.openstreetmap.org/wiki/Key:golf) — free, ODbL, `golf=green`/`golf=tee` features via [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API).
- Commercial GPS providers: [iGolf](https://igolf.com/solutions/golf-course-data/), [Golf Intelligence](https://golfintelligence.com/api-pricing/), [Golfbert](https://www.golfbert.com/), [SportsFirst](https://www.sportsfirst.net/sportsapi/golf-course-api).

## What's on this branch

- `src/gps/geo.ts` (+ `geo.test.ts`) — pure, tested distance/bearing math.
- `src/gps/useGeolocation.ts` — the Geolocation watch hook.
- `src/pages/GpsDemoPage.tsx` — the runnable `/gps` prototype.
- Route + Settings link + sand theme wiring in `App.tsx` / `SettingsHubPage.tsx`.
- This doc.

Try it: run the app, open **Settings → Course GPS**, tap **Start GPS**, and mark
a spot. On a phone outdoors you'll see it count yards as you walk.
