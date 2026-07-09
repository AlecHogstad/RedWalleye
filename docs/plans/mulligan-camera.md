# Evidence Camera — in-app mulligan photo capture

Replace the OS camera sheet with an on-brand, full-screen viewfinder for
mulligan proof photos. Only the *capture* step changes — the existing
compress → offline-queue → Supabase Storage pipeline is blob-in/blob-out and
stays untouched. Zero sync surface.

## Experience

- Tapping "add proof" opens a full-screen overlay: dark-green backdrop, the
  live camera feed in a cream polaroid frame, "EVIDENCE" plate in slab caps,
  a big shutter ring, flip-camera, and ✕ cancel.
- Shutter freezes the frame → **Retake / Use photo** confirm step.
- **The stamp** (the reason to build this): the JPEG itself gets a baked-in
  cream strip — `BOOZE MULLIGAN · HOLE 7 · HUNTER · HAYWARD INVITATIONAL` —
  so every shared photo is unmistakably a trip artifact. Stamping happens in
  the shared media pipeline, so photos from the **native-picker fallback get
  stamped too**.

## Implementation

1. `src/components/MulliganCamera.tsx` — overlay component:
   `{ open, onCapture(file), onError(), onClose }`. `getUserMedia` with
   `facingMode` state (environment default), `<video playsInline muted>`;
   shutter draws the current frame to a canvas capped at 1200px (mirrored
   capture for the front camera so it matches the preview) → JPEG File →
   `onCapture`. Tracks stopped on close/unmount/flip.
2. `src/sync/media.ts` — `compressPhoto(file, stamp?)` gains an optional
   stamp label drawn in the same canvas pass that already resizes (cream
   band, slab text, auto-sized to width). Pure `stampLabel(event, players,
   state)` helper exported for tests.
3. `src/store/store.tsx` — `attachMulliganPhoto` builds the label from the
   event (player name, hole, trip name) and passes it through.
4. `src/pages/MatchPage.tsx` — "add proof" opens the camera when
   `navigator.mediaDevices` exists; `onError` (denied/unsupported) falls back
   to the existing hidden `<input capture>` so photo capture can never break.
5. CSS — `.evcam-*` block (overlay, frame, shutter, confirm bar), reduced-
   motion friendly.

## Verification

- Unit: `stampLabel` cases in `media.test.ts` (player + hole, missing hole,
  unknown player).
- Browser smoke with Chromium's fake camera
  (`--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`):
  open camera → shutter → confirm → mulligan event carries a media path and
  the feed shows the thumbnail; screenshot the overlay + stamped output.

## Effort / risk

~1 day. Client-only; native input kept as the fallback path. Quality note:
`getUserMedia` frames skip HDR — fine for proof shots.
