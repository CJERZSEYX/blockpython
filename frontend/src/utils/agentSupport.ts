import type { Stage } from "../types";

export const P_STEP_DWELL_MS = 7000;

export function inactivityThresholdForStage(stage: Stage): number | null {
  if (stage === "A" || stage === "C") return 20000;
  if (stage === "I") return 60000;
  return null;
}
