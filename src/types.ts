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

/** One of the 18 holes on the course being played. */
export interface Hole {
  number: number; // 1..18
  par: number;
  /**
   * Stroke index (a.k.a. handicap ranking) 1..18 — how hard the hole is
   * relative to the others. Strokes are given first on the lowest index.
   */
  strokeIndex: number;
}

export interface Course {
  name: string;
  holes: Hole[];
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

export interface Round {
  id: Id;
  name: string;
  format: Format;
}

export interface TournamentState {
  version: number;
  course: Course;
  teams: Team[];
  players: Player[];
  rounds: Round[];
  matches: Match[];
}
