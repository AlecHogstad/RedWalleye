import type { FeedItem } from "./activity";

/** Points read nicely with a ½ instead of ".5". */
export function fmtFeedPoints(n: number): string {
  const whole = Math.floor(n);
  const half = n - whole >= 0.5;
  if (whole === 0 && half) return "½";
  return `${whole}${half ? "½" : ""}`;
}

/** The score-highlight labels ("net eagle", "net double", …) from net-to-par. */
export function scoreLabel(netToPar: number): string {
  if (netToPar <= -3) return "net albatross";
  if (netToPar === -2) return "net eagle";
  if (netToPar === -1) return "net birdie";
  if (netToPar === 2) return "net double bogey";
  if (netToPar === 3) return "net triple bogey";
  if (netToPar >= 4) return `net +${netToPar}`;
  return "net par";
}

export interface FeedCopyContext {
  playerName: (id?: string) => string;
  teamName: (id?: string) => string;
  scrambleGroupLabel?: (matchId?: string) => string | null;
}

/** Team (+ scramble group) + hole context for ticker / feed sub-lines. */
export function feedSubline(e: FeedItem, ctx: FeedCopyContext): string {
  const parts: string[] = [];
  if (e.teamId) {
    parts.push(ctx.teamName(e.teamId));
    const group = ctx.scrambleGroupLabel?.(e.matchId);
    if (group) parts.push(group);
  }
  if (e.hole) parts.push(`Hole ${e.hole}`);
  return parts.join(" · ");
}

/** One-line headline for a feed item (ticker + feed list). */
export function feedHeadline(e: FeedItem, ctx: FeedCopyContext): string {
  const who = ctx.playerName(e.playerId);
  const team = ctx.teamName(e.teamId);
  const other = ctx.teamName(e.otherTeamId);
  const subject = e.playerId ? who : team;
  switch (e.kind) {
    case "ace":
      return `${subject} ACED hole ${e.hole}!`;
    case "eagle":
      return `${subject} carded a ${scoreLabel(e.value ?? -2)} on ${e.hole}`;
    case "birdie":
      return `${subject} rolled in a net birdie on ${e.hole}`;
    case "blowup":
      return `${subject} blew up to a ${scoreLabel(e.value ?? 2)} on ${e.hole}`;
    case "matchLead":
      return `${team} took the lead on ${other} — ${e.value} up thru ${e.hole}`;
    case "comeback":
      return `${team} clawed back from ${e.value} down to lead ${other}`;
    case "matchFinal":
      return e.text === "Halved (AS)"
        ? `${team} and ${other} halved their match`
        : `${team} closed out ${other}, ${e.text}`;
    case "segment": {
      const nine = e.segment === "front" ? "front nine" : "back nine";
      return e.text === "halved"
        ? `${team} and ${other} split the ${nine}`
        : `${team} won the ${nine} — ${e.text}`;
    }
    case "overallLead":
      return `${team} grabbed the overall lead — ${fmtFeedPoints(e.value ?? 0)} pts`;
    case "snake":
      return `${who} is stuck with the snake — ${e.value} in the pot`;
    case "mulligan":
      return `${who} took a booze mulligan`;
  }
}
