import assert from "node:assert/strict";
import {
  buildExecutionSummary,
  playbackProgress,
} from "../src/utils/stageFeedback.ts";
import type { ExecutionEvent, ExecutionResult, StageState } from "../src/types/index.ts";
import { inactivityThresholdForStage, P_STEP_DWELL_MS } from "../src/utils/agentSupport.ts";

assert.equal(P_STEP_DWELL_MS, 7000);
assert.equal(inactivityThresholdForStage("P"), null);
assert.equal(inactivityThresholdForStage("A"), 20000);
assert.equal(inactivityThresholdForStage("C"), 20000);
assert.equal(inactivityThresholdForStage("I"), 60000);

function state(x: number, collected: string[] = []): StageState {
  return {
    scene: "apple_map",
    width: 5,
    height: 5,
    actor: { x, y: 0, direction: "right" },
    speech: "",
    equipment: "",
    paid: 0,
    left_items: [],
    right_items: [],
    collected,
    objects: [{ id: "apple-1", kind: "apple", x: 2, y: 0, collected: collected.includes("apple-1") }],
    out_of_bounds: false,
  };
}

const mapEvents: ExecutionEvent[] = [
  { seq: 1, type: "stage", action: "move", line: 4, payload: { from_x: 0, from_y: 0, to_x: 2, to_y: 0, delta_x: 2, delta_y: 0 }, stage_state: state(2) },
  { seq: 2, type: "stage", action: "tile_pause", line: 4, stage_state: state(2) },
  { seq: 3, type: "stage", action: "collect", line: 4, payload: { item_kind: "apple", item_id: "apple-1" }, stage_state: state(2, ["apple-1"]) },
];
const mapResult = {
  status: "target_met",
  started: true,
  code: "x = x + 2",
  line_block_map: {},
  diagnostics: [],
  stdout: "",
  stderr: "",
  line: null,
  events: mapEvents,
  expected_output: "",
  stage_state: state(2, ["apple-1"]),
} satisfies ExecutionResult;

assert.deepEqual(playbackProgress(mapEvents, 1), { current: 2, total: 3 });
const mapSummary = buildExecutionSummary({ events: mapEvents, result: mapResult, initial: state(0), collectionTarget: 1 });
assert.equal(mapSummary?.lastMovement, "x：0 → 2，因此小明向右移动2格。");
assert.deepEqual(mapSummary?.finalPosition, { x: 2, y: 0 });
assert.equal(mapSummary?.collectedCount, 1);
assert.equal(mapSummary?.remainingCount, 0);
assert.equal(mapSummary?.lastCollection, "苹果");

const outputState = { ...state(0), objects: [], collected: [], speech: "第二句" };
const outputEvents: ExecutionEvent[] = [
  { seq: 1, type: "stage", action: "speak", payload: { text: "第一句" }, stage_state: { ...outputState, speech: "第一句" } },
  { seq: 2, type: "stage", action: "speak", payload: { text: "第二句" }, stage_state: outputState },
];
const outputResult = { ...mapResult, events: outputEvents, stage_state: outputState };
const outputSummary = buildExecutionSummary({ events: outputEvents, result: outputResult, initial: outputState });
assert.equal(outputSummary?.kind, "output");
assert.deepEqual(outputSummary?.outputLines, ["第一句", "第二句"]);
assert.equal(outputSummary?.finalPosition, undefined);

console.log("Stage feedback validation passed.");
