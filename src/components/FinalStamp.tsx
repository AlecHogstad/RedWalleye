import { useId } from "react";

/**
 * Rubber-stamp seal for a finished round — inked in the winning team's color
 * and overprinted on the round card like a processed piece of mail. Pure SVG:
 * curved trip name around a double ring, "final" + winner + score in the
 * middle, and an feTurbulence erosion filter so it reads as stamped ink, not
 * a rendered badge. All ids are namespaced per instance so several stamps can
 * live on one page.
 */
export function FinalStamp({
  roundLabel,
  courseLabel,
  teamName,
  color,
  scoreText,
  size = 148,
  seed = 7,
  className,
}: {
  roundLabel: string; // "ROUND 1"
  courseLabel: string; // "BIG FISH G.C."
  teamName: string; // "TEAM A" (or "SPLIT" on a tied round)
  color: string; // ink color — winning team's color
  scoreText: string; // "8½–3½"
  size?: number;
  seed?: number;
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const inkId = `ink${uid}`;
  const topId = `arcTop${uid}`;
  const botId = `arcBot${uid}`;
  const name = teamName.toUpperCase();
  const ring = `★ ${roundLabel} · ${courseLabel} ★`.toUpperCase();

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 220 220"
      role="img"
      aria-label={`${roundLabel} final — ${teamName} ${scoreText}`}
    >
      <defs>
        <filter id={inkId} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" seed={seed} result="n" />
          <feComponentTransfer in="n" result="nn">
            <feFuncA type="discrete" tableValues="0 1 1 1 1 1 1 1" />
          </feComponentTransfer>
          <feComposite in="SourceGraphic" in2="nn" operator="in" />
        </filter>
        <path id={topId} d="M 32 146 A 82 82 0 1 1 188 146" fill="none" />
        <path id={botId} d="M 26 84 A 86 86 0 1 0 194 84" fill="none" />
      </defs>
      <g filter={`url(#${inkId})`} fill={color} stroke={color}>
        <circle cx="110" cy="110" r="100" fill="none" strokeWidth="5" />
        <circle cx="110" cy="110" r="93" fill="none" strokeWidth="1.6" />
        <circle cx="110" cy="110" r="64" fill="none" strokeWidth="1.6" />
        <text fontFamily="Alfa Slab One" fontSize="16" letterSpacing="3" stroke="none">
          <textPath href={`#${topId}`} startOffset="50%" textAnchor="middle">
            HAYWARD INVITATIONAL
          </textPath>
        </text>
        <text
          fontFamily="Fraunces"
          fontStyle="italic"
          fontWeight="600"
          fontSize="13"
          letterSpacing="4"
          stroke="none"
        >
          <textPath href={`#${botId}`} startOffset="50%" textAnchor="middle">
            {ring}
          </textPath>
        </text>
        <text
          x="110"
          y="92"
          textAnchor="middle"
          fontFamily="Fraunces"
          fontStyle="italic"
          fontWeight="600"
          fontSize="14"
          stroke="none"
        >
          final
        </text>
        <text
          x="110"
          y="120"
          textAnchor="middle"
          fontFamily="Alfa Slab One"
          fontSize="26"
          stroke="none"
          {...(name.length > 7
            ? { textLength: 118, lengthAdjust: "spacingAndGlyphs" as const }
            : {})}
        >
          {name}
        </text>
        <text
          x="110"
          y="146"
          textAnchor="middle"
          fontFamily="Alfa Slab One"
          fontSize="19"
          stroke="none"
        >
          {scoreText}
        </text>
      </g>
    </svg>
  );
}
