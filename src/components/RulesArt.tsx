import type { Format } from "../types";

/**
 * Vintage line-art header illustration for the format rules sheets — the same
 * forest-green woodcut feel as the RWGC lockup and feed icons. Both scenes
 * share a checkered flag on the green with dotted shot tracers, so they read
 * as a matched pair; the arrangement of balls tells the two formats apart.
 *
 * - Four-ball: two independent balls on their own tees, the better one badged
 *   with a check — "everyone plays their own ball, best net counts."
 * - Scramble: four tracers converging on a single team ball — "all tee off,
 *   play the best shot from there."
 *
 * Strokes use currentColor (set to brand green by the wrapper), ball bodies
 * are filled with the sheet's paper so tracers pass behind them.
 */
export function RulesArt({
  format,
  className,
}: {
  format: Format;
  className?: string;
}) {
  return format === "scramble" ? (
    <ScrambleArt className={className} />
  ) : (
    <BestBallArt className={className} />
  );
}

/** Shared frame — brand-green ink, rounded joins, a wide banner viewBox. */
function Scene({
  children,
  className,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 280 150"
      fill="none"
      role="img"
      aria-label={label}
      style={{ color: "var(--green)" }}
    >
      <g
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </g>
    </svg>
  );
}

/** The green contour + checkered flagstick shared by both scenes. */
function GreenAndFlag() {
  return (
    <>
      {/* rolling ground */}
      <path d="M16 124 Q 92 112 150 118 T 264 120" />
      <path d="M40 132 Q 120 124 232 130" strokeWidth={1.1} opacity={0.5} />
      {/* flagstick + cup */}
      <line x1="228" y1="46" x2="228" y2="120" strokeWidth={2.1} />
      <ellipse cx="228" cy="120" rx="10" ry="3.2" strokeWidth={1.3} />
      {/* checkered pennant (RWGC motif) */}
      <g fill="currentColor" stroke="none">
        <rect x="230" y="46" width="9" height="7" />
        <rect x="248" y="46" width="9" height="7" />
        <rect x="239" y="53" width="9" height="7" />
        <rect x="230" y="60" width="9" height="7" />
        <rect x="248" y="60" width="9" height="7" />
      </g>
      <rect x="230" y="46" width="27" height="21" strokeWidth={1.3} />
    </>
  );
}

/** A dimpled golf ball whose body masks the tracers behind it. */
function Ball({ cx, cy, r = 11 }: { cx: number; cy: number; r?: number }) {
  const d = [
    [-4, -4],
    [1, -5],
    [5, -1],
    [-3, 2],
    [2, 4],
  ] as const;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="var(--cream-card)" />
      {d.map(([dx, dy], i) => (
        <circle
          key={i}
          cx={cx + dx}
          cy={cy + dy}
          r={1}
          fill="currentColor"
          stroke="none"
        />
      ))}
    </g>
  );
}

/** A little tee under a ball. */
function Tee({ cx, top }: { cx: number; top: number }) {
  return <path d={`M${cx - 5} ${top} h10 M${cx} ${top} v7`} strokeWidth={1.5} />;
}

function BestBallArt({ className }: { className?: string }) {
  return (
    <Scene
      className={className}
      label="Two golfers each play their own ball toward the pin; the better ball counts."
    >
      <GreenAndFlag />
      {/* two independent shot tracers */}
      <path
        d="M30 116 Q 70 40 108 100"
        strokeWidth={1.3}
        strokeDasharray="1.5 6"
        opacity={0.65}
      />
      <path
        d="M64 118 Q 118 44 158 104"
        strokeWidth={1.3}
        strokeDasharray="1.5 6"
        opacity={0.65}
      />
      <Ball cx={108} cy={104} />
      <Tee cx={108} top={116} />
      <Ball cx={158} cy={108} />
      <Tee cx={158} top={120} />
      {/* "best counts" badge over the better ball */}
      <circle cx="158" cy="84" r="9" strokeWidth={1.5} fill="var(--cream-card)" />
      <path d="M154 84 l3 3 5-6" strokeWidth={1.8} />
    </Scene>
  );
}

function ScrambleArt({ className }: { className?: string }) {
  return (
    <Scene
      className={className}
      label="The group's four shots converge on one team ball by the pin."
    >
      <GreenAndFlag />
      {/* four tracers converging on the single team ball */}
      <path
        d="M24 118 Q 70 36 150 104"
        strokeWidth={1.3}
        strokeDasharray="1.5 6"
        opacity={0.6}
      />
      <path
        d="M52 128 Q 96 44 150 104"
        strokeWidth={1.3}
        strokeDasharray="1.5 6"
        opacity={0.6}
      />
      <path
        d="M92 132 Q 120 60 150 104"
        strokeWidth={1.3}
        strokeDasharray="1.5 6"
        opacity={0.6}
      />
      <path
        d="M132 134 Q 146 70 150 104"
        strokeWidth={1.3}
        strokeDasharray="1.5 6"
        opacity={0.6}
      />
      <Ball cx={150} cy={104} r={12} />
      <Tee cx={150} top={117} />
    </Scene>
  );
}
