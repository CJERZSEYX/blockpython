import type { ExecutionEvent, ExecutionResult, StageState } from "../types";

const learnerActions = new Set(["move", "arrive", "tile_pause", "speak", "collect"]);

function payloadNumber(event: ExecutionEvent | undefined, key: string): number | null {
  const value = event?.payload?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function movementFeedback(event: ExecutionEvent | undefined): string {
  if (!event) return "运行后会在这里解释变量变化和移动方向。";
  if (event.action === "speak") return "本行执行print()，只更新小明的气泡，不改变位置。";
  if (event.action === "tile_pause") return "小明已到达当前地格，停留1秒后继续执行。";
  if (event.action === "collect") {
    return `小明已经到达目标地格，正在拾取${event.payload?.item_kind === "pear" ? "梨" : "苹果"}。`;
  }
  const fromX = payloadNumber(event, "from_x");
  const fromY = payloadNumber(event, "from_y");
  const toX = payloadNumber(event, "to_x");
  const toY = payloadNumber(event, "to_y");
  const dx = payloadNumber(event, "delta_x") || 0;
  const dy = payloadNumber(event, "delta_y") || 0;
  if (fromX === null || fromY === null || toX === null || toY === null) {
    return "本行执行后，观察变量值和小明位置是否发生变化。";
  }
  if (dx === 0 && dy === 0) {
    return `第${event.line || "本"}行执行后，x、y没有变化，小明的位置不变。`;
  }
  const axis = dx !== 0 ? "x" : "y";
  const from = dx !== 0 ? fromX : fromY;
  const to = dx !== 0 ? toX : toY;
  const distance = Math.abs(dx || dy);
  const direction = dx > 0 ? "向右" : dx < 0 ? "向左" : dy > 0 ? "向下" : "向上";
  return `${axis}：${from} → ${to}，因此小明${direction}移动${distance}格。`;
}

export function playbackProgress(events: ExecutionEvent[], cursor: number) {
  const stepIndexes = events
    .map((event, index) => learnerActions.has(String(event.action || "")) ? index : -1)
    .filter((index) => index >= 0);
  return {
    current: stepIndexes.filter((index) => index <= cursor).length,
    total: stepIndexes.length,
  };
}

export interface ExecutionSummary {
  kind: "output" | "map";
  outputLines: string[];
  lastMovement: string;
  finalPosition?: { x: number; y: number };
  collectedCount: number;
  targetCount: number;
  remainingCount: number;
  lastCollection?: string;
}

export function buildExecutionSummary(args: {
  events: ExecutionEvent[];
  result: ExecutionResult | null;
  initial: StageState;
  collectionTarget?: number;
}): ExecutionSummary | null {
  if (!args.result?.started || args.events.length === 0) return null;
  const stageEvents = args.events.filter((event) => event.stage_state);
  const finalState = stageEvents.at(-1)?.stage_state || args.result.stage_state || args.initial;
  const hasObjects = finalState.objects.length > 0;
  const outputLines = args.events
    .filter((event) => event.action === "speak")
    .map((event) => String(event.payload?.text || event.stage_state?.speech || "").trim())
    .filter(Boolean);
  const lastMovementEvent = [...args.events].reverse().find((event) =>
    event.action === "move"
    || (event.action === "arrive" && payloadNumber(event, "from_x") !== null)
  );
  const lastCollectionEvent = [...args.events].reverse().find((event) => event.action === "collect");
  const targetCount = Math.min(
    Number(args.collectionTarget || finalState.objects.length),
    finalState.objects.length,
  );
  const collectedCount = Math.min(finalState.collected.length, targetCount);
  return {
    kind: hasObjects ? "map" : "output",
    outputLines,
    lastMovement: lastMovementEvent ? movementFeedback(lastMovementEvent) : "本次运行没有改变小明的位置。",
    finalPosition: hasObjects ? { x: finalState.actor.x, y: finalState.actor.y } : undefined,
    collectedCount,
    targetCount,
    remainingCount: Math.max(0, targetCount - collectedCount),
    lastCollection: lastCollectionEvent
      ? lastCollectionEvent.payload?.item_kind === "pear" ? "梨" : "苹果"
      : undefined,
  };
}
