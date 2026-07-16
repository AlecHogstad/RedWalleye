// Snake — a manual side game. Whoever three-putts last "holds the snake"; each
// pass grows the pot. The holder + pass count live in state (MatchSideGames);
// this plugin only carries the label and the configurable pot size, so the
// scorecard can show what the current holder owes.
//
// House Rules:
//   potPerChange  units added to the pot each time the snake changes hands
//                 (default 1)

import type { SideGamePlugin } from "./contract";

export const snake: SideGamePlugin = {
  id: "snake",
  label: "Snake",
  kind: "manual",
  appliesTo: () => true, // any format — it's about three-putts, not the ball

  defaultRules: { potPerChange: 1 },
  rulesSchema: [
    {
      key: "potPerChange",
      label: "Pot per pass",
      help: "How much the snake pot grows each time it changes hands (a three-putt).",
      kind: "number",
      min: 0,
      max: 100,
      step: 1,
      unit: "",
    },
  ],
};
