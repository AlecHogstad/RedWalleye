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
  fourball: "Four-Ball (2-man Best Ball)",
  fourman: "4-Man Best Ball",
  scramble: "Scramble",
};

/** Short labels that fit inside the oval badges. */
export const FORMAT_SHORT: Record<Format, string> = {
  fourball: "Four-Ball",
  fourman: "4-Man BB",
  scramble: "Scramble",
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

export interface TournamentState {
  version: number;
  courses: CourseDef[];
  teams: Team[];
  players: Player[];
  rounds: Round[];
  matches: Match[];
}
