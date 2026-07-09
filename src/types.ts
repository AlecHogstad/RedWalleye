// ---------------------------------------------------------------------------
// Domain types for the Red Walleye golf trip scoring app.
// ---------------------------------------------------------------------------

export type Id = string;

/** A golfer with a handicap index (the number in parens on the team sheet). */
export interface Player {
  id: Id;
  name: string;
  handicap: number;
  teamId: Id;
}

export interface Team {
  id: Id;
  name: string;
  color: string;
  /** The captain who drafts and sets this team's matchups. */
  captainId?: Id;
}

/** One of the 18 holes on a course. */
export interface Hole {
  number: number; // 1..18
  par: number;
  /**
   * Stroke index (the HDCP row on the card) 1..18 — how hard the hole is
   * relative to the others. Strokes are given first on the lowest index.
   */
  strokeIndex: number;
  /** Yardage, informational only (from the longest tees on the card). */
  yards?: number;
}

/** A set of tees with the numbers that drive course handicap. */
export interface TeeSet {
  name: string;
  yardage: number;
  rating: number;
  slope: number;
}

export interface CourseDef {
  id: Id;
  name: string;
  holes: Hole[];
  tees: TeeSet[];
}

export type Format = "fourball" | "scramble";

export const FORMAT_LABELS: Record<Format, string> = {
  fourball: "2-man Best Ball",
  scramble: "Scramble",
};

/** Short labels that fit inside the oval badges. */
export const FORMAT_SHORT: Record<Format, string> = {
  fourball: "2-man BB",
  scramble: "Scramble",
};

/** One labelled block of a format's rules. */
export interface RuleSection {
  label: string;
  text: string;
}

/** How each game works, in plain language — three short sections so a casual
 *  (or a few-beers) player gets how to PLAY it, how the app SCORES it, and
 *  what's at stake. Shown in the format rules bottom sheet. */
export const FORMAT_RULE_SECTIONS: Record<Format, RuleSection[]> = {
  fourball: [
    {
      label: "How you play",
      text: "Everyone plays their own ball into the hole. On each hole your team's better score goes up against theirs — lower one wins the hole.",
    },
    {
      label: "Scoring",
      text: "Just enter every golfer's real strokes; the app handles handicaps — the lowest handicap in the match plays scratch, and everyone else gets their difference as strokes on the hardest holes.",
    },
    {
      label: "Points",
      text: "Three bets — front 9, back 9, and all 18 — worth 1 point each. Win more holes in a stretch to take it; a tie splits it. 3 points per match.",
    },
  ],
  scramble: [
    {
      label: "How you play",
      text: "The whole group tees off, you pick the best shot, and everyone plays their next from there — repeat until it's holed. One team score per hole, no handicaps.",
    },
    {
      label: "Scoring",
      text: "Enter your group's single score on each hole. All four groups — two per team — race on the same course.",
    },
    {
      label: "Points",
      text: "Lowest 18-hole total places 1st on down: 6 / 4 / 2 / 0 (ties split). Your team adds up both its groups — 12 points on the line for the round.",
    },
  ],
};

/** One side of a match — a set of player ids playing together. */
export interface Side {
  teamId: Id;
  playerIds: Id[];
}

export interface Match {
  id: Id;
  roundId: Id;
  format: Format;
  sideA: Side;
  sideB: Side;
  /**
   * Gross scores keyed by playerId, then hole number.
   * scores[playerId][holeNumber] = strokes taken (undefined = not entered).
   * For a scramble the whole team enters one score under a synthetic key
   * `team:<teamId>`.
   */
  scores: Record<string, Record<number, number | undefined>>;
}

/**
 * Round lifecycle: pending → active → final. Only one round can be active
 * at a time; while a round is active every other round is locked. Starting
 * a round is when the course + tees get chosen, which fixes the handicap
 * math for its matches.
 */
export type RoundStatus = "pending" | "active" | "final";

export interface Round {
  id: Id;
  name: string;
  format: Format;
  status: RoundStatus;
  /** Set when the round is started. */
  courseId?: Id;
  teeName?: string;
}

/**
 * Optional side games a group can opt into per match. Purely social — these
 * never touch the tournament standings. Snake just tracks who currently
 * "holds" it (last three-putt); it's a manual selector, not putt-derived.
 */
export interface MatchSideGames {
  stableford?: boolean;
  snake?: boolean;
  snakeHolder?: string; // playerId, or omitted for "nobody yet"
  /** How many times the snake has changed hands — roughly the group's
   *  three-putt count, which grows the pot. */
  snakeChanges?: number;
}

/** Optional proof photo for a mulligan (file lives in Supabase Storage). */
export interface ActivityEventMedia {
  path: string;
  mime: "image/jpeg";
  /** Present while this device is still uploading the file. */
  status?: "pending" | "ready";
}

/**
 * An entry in the activity feed. Append-only; today the only kind is a
 * scramble "booze mulligan" (a player took a shot to buy a do-over), but the
 * shape is generic so birdies / lead changes can be added later.
 */
export interface ActivityEvent {
  id: Id;
  type: "mulligan";
  matchId: Id;
  playerId: Id;
  ts: number; // Date.now() when it happened
  /** The hole being played when it happened, so the activity feed can slot it
   *  in golf-chronological order. Optional — older events predate this field. */
  hole?: number;
  media?: ActivityEventMedia;
}

/**
 * The team draft. Two captains are chosen, then players are picked in a snake
 * order until each team has eight. Picks are stored in order; a player's team
 * assignment (`Player.teamId`) is set live as they're drafted. Optional —
 * `undefined` until a draft is set up (the seed ships a placeholder split).
 */
export interface DraftState {
  status: "setup" | "active" | "done";
  captainA?: Id; // captains are pre-assigned to their team, then draft the rest
  captainB?: Id;
  firstPick?: "tA" | "tB";
  picks: Id[]; // playerIds in the order they were drafted
  /** Bumped on every pick/undo so stale sync rows can't roll back progress. */
  rev?: number;
}

export interface TournamentState {
  version: number;
  courses: CourseDef[];
  teams: Team[];
  players: Player[];
  rounds: Round[];
  matches: Match[];
  /** Side-game opt-ins + snake holder, keyed by matchId. */
  sideGames: Record<string, MatchSideGames>;
  /** Append-only activity feed (booze mulligans for now). */
  activity: ActivityEvent[];
  /** The team draft, once one has been set up. */
  draft?: DraftState;
}
