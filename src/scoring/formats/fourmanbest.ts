// 4-Man Best Ball — best ball with all four teammates a side. Same head-to-head
// Nassau as four-ball; only the seat count differs (the engine already takes the
// best net of however many balls a side has).

import { FORMAT_LABELS, FORMAT_RULE_SECTIONS, FORMAT_SHORT } from "../../types";
import { makeNassauFormat } from "./nassau";

export const fourmanbest = makeNassauFormat({
  id: "fourmanbest",
  labels: { long: FORMAT_LABELS.fourmanbest, short: FORMAT_SHORT.fourmanbest },
  ruleSections: FORMAT_RULE_SECTIONS.fourmanbest,
  seatsPerSide: 4,
});
