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

export type Format = "fourball" | "fourman" | "scramble";

export const FORMAT_LABELS: Record<Format, string> = {
  fourball: "2-man Best Ball",
  fourman: "4-man Best Ball",
  scramble: "Scramble",
};

/** Short labels that fit inside the oval badges. */
export const FORMAT_SHORT: Record<Format, string> = {
  fourball: "2-man BB",
  fourman: "4-man BB",
  scramble: "Scramble",
};

/** How each game works — shown on the start page and the scorecard. */
export const FORMAT_RULES: Record<Format, string> = {
  fourball:
    "Match play, 2-man teams. Everyone plays their own ball and the best net " +
    "score on each hole counts for your side — lower net ball wins the hole. " +
    "Strokes come off the lowest course handicap in the match, given on the " +
    "hardest holes first. Most holes wins the match: 1 point, ½ for a halve. " +
    "The lower total of those best net balls also takes a stroke-play win — " +
    "bragging rights only, no points.",
  scramble:
    "Team stroke play — all four go out as one group and play a scramble: " +
    "everyone hits, you pick the best shot and all play from there, one team " +
    "ball and one score per hole. Each team gets a scramble handicap " +
    "(25/20/15/10 of the four course handicaps) taken off the field's low so " +
    "team nets compare. Lowest net round wins: 3 points, 1 for second.",
  fourman:
    "Team stroke play — every team tees off as its own foursome, no " +
    "head-to-head. Everyone plays their own ball and the team's best net " +
    "score on each hole counts. Strokes come off the field's low handicap so " +
    "totals compare. Lowest team total to par wins the round: 2 points, " +
    "split on a tie.",
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
}
