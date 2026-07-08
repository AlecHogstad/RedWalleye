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

/** How each game works — shown on the start page and the scorecard. Every
 *  match is a Nassau: the front 9, back 9, and overall 18 are three separate
 *  bets, each won by whoever wins more holes in that stretch (halve = split). */
export const FORMAT_RULES: Record<Format, string> = {
  fourball:
    "2-man best-ball match play, A vs B. Everyone plays their own ball and " +
    "your side's best net score on each hole counts. Strokes come off the " +
    "lowest course handicap in the match. It's a Nassau — front 9, back 9, and " +
    "the match are worth 1 point each (3 per match).",
  scramble:
    "4-man scramble stroke play. Each team fields two foursomes; all four " +
    "groups play the course and the lowest gross total wins placement points " +
    "(1st = 6, 2nd = 4, 3rd = 2, 4th = 0). Team points are the sum of both " +
    "groups — 12 points on the line for the round.",
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
