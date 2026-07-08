import type {
  CourseDef,
  Hole,
  Match,
  Player,
  Round,
  Team,
  TournamentState,
} from "../types";

// Bump this when the seed shape changes so the store can migrate/reset.
export const STATE_VERSION = 12;

// Two captain-drafted teams of 8, playing head-to-head every round.
export const teams: Team[] = [
  { id: "tA", name: "Team A", color: "#de4f2c", captainId: "hunter" },
  { id: "tB", name: "Team B", color: "#2e6b3e", captainId: "mike" },
];

// Handicaps straight off the team sheet (the number in parentheses). The
// split below is a placeholder balance — the draft (a later phase) sets the
// real rosters; until then these let every round score end to end.
export const players: Player[] = [
  // Team A
  { id: "hunter", name: "Hunter", handicap: 27, teamId: "tA" },
  { id: "frank", name: "Frank", handicap: 20, teamId: "tA" },
  { id: "brody", name: "Brody", handicap: 15, teamId: "tA" },
  { id: "alex", name: "Alex", handicap: 13, teamId: "tA" },
  { id: "hank", name: "Hank", handicap: 12, teamId: "tA" },
  { id: "jeff", name: "Jeff", handicap: 8.7, teamId: "tA" },
  { id: "nikk", name: "Nikk", handicap: 8, teamId: "tA" },
  { id: "nick", name: "Nick", handicap: 3, teamId: "tA" },

  // Team B
  { id: "nated", name: "Nate D", handicap: 21, teamId: "tB" },
  { id: "mike", name: "Mike", handicap: 20, teamId: "tB" },
  { id: "alec", name: "Alec", handicap: 15, teamId: "tB" },
  { id: "brady", name: "Brady", handicap: 13, teamId: "tB" },
  { id: "joe", name: "Joe", handicap: 11, teamId: "tB" },
  { id: "paul", name: "Paul", handicap: 10, teamId: "tB" },
  { id: "danny", name: "Danny", handicap: 7, teamId: "tB" },
  { id: "jay", name: "Jay", handicap: 6, teamId: "tB" },
];

function holes(rows: [par: number, yards: number, strokeIndex: number][]): Hole[] {
  return rows.map(([par, yards, strokeIndex], i) => ({
    number: i + 1,
    par,
    yards,
    strokeIndex,
  }));
}

// Big Fish Golf Club — pars, yardages, tee ratings, and HDCP (stroke index)
// ranks all from the real scorecard.
const bigFish: CourseDef = {
  id: "bigfish",
  name: "Big Fish Golf Club",
  holes: holes([
    // [par, yards, HDCP]
    [4, 412, 18],
    [5, 555, 8],
    [3, 166, 10],
    [4, 517, 2],
    [4, 375, 14],
    [4, 458, 6],
    [5, 560, 4],
    [4, 434, 16],
    [3, 129, 12],
    [4, 389, 15],
    [4, 380, 17],
    [3, 215, 13],
    [5, 525, 9],
    [4, 440, 3],
    [4, 490, 1],
    [3, 191, 11],
    [5, 555, 5],
    [4, 440, 7],
  ]),
  tees: [
    { name: "Tournament", yardage: 7231, rating: 74.1, slope: 134 },
    { name: "Championship", yardage: 6608, rating: 71.7, slope: 126 },
    { name: "Member", yardage: 6084, rating: 68.6, slope: 122 },
    { name: "Gold", yardage: 5646, rating: 66.8, slope: 115 },
    { name: "Red", yardage: 4940, rating: 68.4, slope: 115 },
  ],
};

// Hayward Golf Club — pars, yardages (Black tees), HCP ranks, and tee
// ratings all from the real scorecard.
const hayward: CourseDef = {
  id: "hayward",
  name: "Hayward Golf Club",
  holes: holes([
    // [par, yards, HCP]
    [4, 382, 7],
    [4, 336, 15],
    [3, 176, 17],
    [5, 512, 13],
    [4, 377, 9],
    [4, 441, 1],
    [4, 414, 3],
    [3, 186, 11],
    [5, 533, 5],
    [4, 451, 2],
    [4, 395, 10],
    [3, 209, 12],
    [5, 494, 14],
    [3, 195, 16],
    [5, 511, 8],
    [4, 285, 18],
    [4, 395, 6],
    [4, 386, 4],
  ]),
  tees: [
    { name: "Black", yardage: 6678, rating: 72.4, slope: 126 },
    { name: "Blue", yardage: 6469, rating: 71.3, slope: 125 },
    { name: "White", yardage: 6071, rating: 69.2, slope: 121 },
    { name: "Gold", yardage: 5271, rating: 65.5, slope: 110 },
    { name: "Red", yardage: 5156, rating: 69.8, slope: 118 },
  ],
};

export const courses: CourseDef[] = [bigFish, hayward];

export const rounds: Round[] = [
  { id: "r1", name: "Round 1", format: "fourball", status: "pending" },
  { id: "r2", name: "Round 2", format: "scramble", status: "pending" },
  { id: "r3", name: "Round 3", format: "fourball", status: "pending" },
];

// Where each round is played on the trip. Rounds 1 & 2 are at Big Fish,
// Round 3 is at Hayward. These pre-select the course + tees on the Start
// Round screen (still changeable before confirming) and let the Rounds
// page show the venue before a round has been started. UI-only — not part
// of persisted state, so no STATE_VERSION bump.
export const ROUND_DEFAULTS: Record<string, { courseId: string; teeName: string }> = {
  r1: { courseId: "bigfish", teeName: "Tournament" },
  r2: { courseId: "bigfish", teeName: "Tournament" },
  r3: { courseId: "hayward", teeName: "Black" },
};

const emptyScores = (keys: string[]): Match["scores"] =>
  Object.fromEntries(keys.map((k) => [k, {}]));

// --- Match slots (A vs B, head-to-head) -------------------------------------
// Every match is Team A vs Team B. Rosters/matchups are placeholders here so
// scoring runs end to end; the matchup builder (a later phase) rewrites the
// player ids in each slot. Score keys: a playerId per golfer for best-ball
// rounds, a `team:<teamId>` key per side for the scramble team ball.

/** 2-man best-ball match: two A players vs two B players. */
function fourball(
  id: string,
  roundId: string,
  a: [string, string],
  b: [string, string],
): Match {
  return {
    id,
    roundId,
    format: "fourball",
    sideA: { teamId: "tA", playerIds: a },
    sideB: { teamId: "tB", playerIds: b },
    scores: emptyScores([...a, ...b]),
  };
}

/** 4-man scramble match: one team ball per side (raw score). */
function scramble(id: string, a: string[], b: string[]): Match {
  return {
    id,
    roundId: "r2",
    format: "scramble",
    sideA: { teamId: "tA", playerIds: a },
    sideB: { teamId: "tB", playerIds: b },
    scores: emptyScores([`team:tA`, `team:tB`]),
  };
}

// Placeholder scramble groupings (draft/matchups replace these later).
const A1 = ["hunter", "frank", "brody", "alex"];
const A2 = ["hank", "jeff", "nikk", "nick"];
const B1 = ["nated", "mike", "alec", "brady"];
const B2 = ["joe", "paul", "danny", "jay"];

// Round 1 — four 2-man best-ball matches (Nassau, 3 pts each = 12).
const round1: Match[] = [
  fourball("r1m1", "r1", ["hunter", "frank"], ["nated", "mike"]),
  fourball("r1m2", "r1", ["brody", "alex"], ["alec", "brady"]),
  fourball("r1m3", "r1", ["hank", "jeff"], ["joe", "paul"]),
  fourball("r1m4", "r1", ["nikk", "nick"], ["danny", "jay"]),
];

// Round 2 — two 4-man scramble matches (Nassau, 6 pts each = 12).
const round2: Match[] = [
  scramble("r2m1", A1, B1),
  scramble("r2m2", A2, B2),
];

// Round 3 — four 2-man best-ball matches, same format as Round 1 but different
// pairings (Nassau, 3 pts each = 12).
const round3: Match[] = [
  fourball("r3m1", "r3", ["hunter", "nick"], ["nated", "jay"]),
  fourball("r3m2", "r3", ["frank", "nikk"], ["mike", "danny"]),
  fourball("r3m3", "r3", ["brody", "jeff"], ["alec", "paul"]),
  fourball("r3m4", "r3", ["alex", "hank"], ["brady", "joe"]),
];

export const seedMatches: Match[] = [...round1, ...round2, ...round3];

export function seedState(): TournamentState {
  return {
    version: STATE_VERSION,
    courses: structuredClone(courses),
    teams: structuredClone(teams),
    players: structuredClone(players),
    rounds: structuredClone(rounds),
    matches: structuredClone(seedMatches),
    sideGames: {},
    activity: [],
  };
}
