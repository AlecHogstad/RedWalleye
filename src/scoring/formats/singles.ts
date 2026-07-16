// Singles — 1-on-1 head-to-head match play. One golfer a side; "best net of the
// side" is simply that golfer's net. Same Nassau bets as best ball.

import { FORMAT_LABELS, FORMAT_RULE_SECTIONS, FORMAT_SHORT } from "../../types";
import { makeNassauFormat } from "./nassau";

export const singles = makeNassauFormat({
  id: "singles",
  labels: { long: FORMAT_LABELS.singles, short: FORMAT_SHORT.singles },
  ruleSections: FORMAT_RULE_SECTIONS.singles,
  seatsPerSide: 1,
});
