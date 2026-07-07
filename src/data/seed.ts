import type { Course, Match, Player, Round, Team, TournamentState } from "../types";

// Bump this when the seed shape changes so the store can migrate/reset.
export const STATE_VERSION = 1;

export const teams: Team[] = [
  { id: "t1", name: "Team 1", color: "#e63946" },
  { id: "t2", name: "Team 2", color: "#2a9d8f" },
  { id: "t3", name: "Team 3", color: "#457b9d" },
  { id: "t4", name: "Team 4", color: "#e9a13b" },
];

// Handicaps straight off the team sheet (the number in parentheses).
export const players: Player[] = [
  { id: "hunter", name: "Hunter", handicap: 27, teamId: "t1" },
  { id: "alex", name: "Alex", handicap: 13, teamId: "t1" },
  { id: "jeff", name: "Jeff", handicap: 8.7, teamId: "t1" },
  { id: "nick", name: "Nick", handicap: 3, teamId: "t1" },

  { id: "nated", name: "Nate D", handicap: 21, teamId: "t2" },
  { id: "brody", name: "Brody", handicap: 15, teamId: "t2" },
  { id: "paul", name: "Paul", handicap: 10, teamId: "t2" },
  { id: "jay", name: "Jay", handicap: 6, teamId: "t2" },

  { id: "mike", name: "Mike", handicap: 20, teamId: "t3" },
  { id: "alec", name: "Alec", handicap: 15, teamId: "t3" },
  { id: "joe", name: "Joe", handicap: 11, teamId: "t3" },
  { id: "danny", name: "Danny", handicap: 7, teamId: "t3" },

  { id: "frank", name: "Frank", handicap: 20, teamId: "t4" },
  { id: "brady", name: "Brady", handicap: 13, teamId: "t4" },
  { id: "hank", name: "Hank", handicap: 12, teamId: "t4" },
  { id: "nikk", name: "Nikk", handicap: 8, teamId: "t4" },
];

// A generic par-72 layout. Everything here is editable in the Course tab so
// you can drop in the real pars + stroke index for whatever course you play.
const pars = [4, 4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 5, 3, 4, 4, 4, 3, 5];
const strokeIndexes = [5, 11, 1, 15, 3, 13, 7, 17, 9, 6, 12, 2, 16, 4, 8, 14, 18, 10];

export const course: Course = {
  name: "Course (edit me)",
  holes: pars.map((par, i) => ({
    number: i + 1,
    par,
    strokeIndex: strokeIndexes[i],
  })),
};

export const rounds: Round[] = [
  { id: "r1", name: "Round 1", format: "fourball" },
  { id: "r2", name: "Round 2", format: "scramble" },
  { id: "r3", name: "Round 3", format: "fourman" },
];

const emptyScores = (keys: string[]): Match["scores"] =>
  Object.fromEntries(keys.map((k) => [k, {}]));

function fourball(
  id: string,
  roundId: string,
  a: [string, string, string],
  b: [string, string, string],
): Match {
  // a/b = [teamId, playerId, playerId]
  return {
    id,
    roundId,
    format: "fourball",
    sideA: { teamId: a[0], playerIds: [a[1], a[2]] },
    sideB: { teamId: b[0], playerIds: [b[1], b[2]] },
    scores: emptyScores([a[1], a[2], b[1], b[2]]),
  };
}

// Round 1 — Four-Ball, exactly the matchups from the screenshots.
const round1: Match[] = [
  fourball("r1m1", "r1", ["t1", "hunter", "nick"], ["t2", "nated", "jay"]),
  fourball("r1m2", "r1", ["t1", "alex", "jeff"], ["t2", "brody", "paul"]),
  fourball("r1m3", "r1", ["t3", "mike", "danny"], ["t4", "frank", "nikk"]),
  fourball("r1m4", "r1", ["t3", "alec", "joe"], ["t4", "brady", "hank"]),
];

// Round 2 — Scramble (chat: "scramble the 2nd round at big fish"). Same pairings,
// team plays one ball; scores are stored under the team key.
function scramble(
  id: string,
  a: { teamId: string; playerIds: string[] },
  b: { teamId: string; playerIds: string[] },
): Match {
  return {
    id,
    roundId: "r2",
    format: "scramble",
    sideA: a,
    sideB: b,
    scores: emptyScores([`team:${a.teamId}`, `team:${b.teamId}`]),
  };
}

const round2: Match[] = [
  scramble(
    "r2m1",
    { teamId: "t1", playerIds: ["hunter", "nick"] },
    { teamId: "t2", playerIds: ["nated", "jay"] },
  ),
  scramble(
    "r2m2",
    { teamId: "t1", playerIds: ["alex", "jeff"] },
    { teamId: "t2", playerIds: ["brody", "paul"] },
  ),
  scramble(
    "r2m3",
    { teamId: "t3", playerIds: ["mike", "danny"] },
    { teamId: "t4", playerIds: ["frank", "nikk"] },
  ),
  scramble(
    "r2m4",
    { teamId: "t3", playerIds: ["alec", "joe"] },
    { teamId: "t4", playerIds: ["brady", "hank"] },
  ),
];

// Round 3 — 4-Man Best Ball, full teams head to head.
function fourman(id: string, teamA: string, teamB: string): Match {
  const idsFor = (t: string) => players.filter((p) => p.teamId === t).map((p) => p.id);
  const a = idsFor(teamA);
  const b = idsFor(teamB);
  return {
    id,
    roundId: "r3",
    format: "fourman",
    sideA: { teamId: teamA, playerIds: a },
    sideB: { teamId: teamB, playerIds: b },
    scores: emptyScores([...a, ...b]),
  };
}

const round3: Match[] = [fourman("r3m1", "t1", "t2"), fourman("r3m2", "t3", "t4")];

export const seedMatches: Match[] = [...round1, ...round2, ...round3];

export function seedState(): TournamentState {
  return {
    version: STATE_VERSION,
    course: structuredClone(course),
    teams: structuredClone(teams),
    players: structuredClone(players),
    rounds: structuredClone(rounds),
    matches: structuredClone(seedMatches),
  };
}
