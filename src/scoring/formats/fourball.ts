// Four-ball (2-man best ball) — a head-to-head Nassau per match. Each golfer
// holes their own ball; the side's better net counts on each hole; front / back
// / overall bets pay `segmentValue` points each. See ./nassau for the shared
// scoring these head-to-head formats reuse.

import { FORMAT_LABELS, FORMAT_RULE_SECTIONS, FORMAT_SHORT } from "../../types";
import { makeNassauFormat } from "./nassau";

export const fourball = makeNassauFormat({
  id: "fourball",
  labels: { long: FORMAT_LABELS.fourball, short: FORMAT_SHORT.fourball },
  ruleSections: FORMAT_RULE_SECTIONS.fourball,
  seatsPerSide: 2,
});
