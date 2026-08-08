import type { PythonRunResult, TraceEvent } from "./pythonRunner";

type Scalar = string | number | boolean | null;

interface MapObject {
  id: string;
  kind: string;
  x: number;
  y: number;
  collected?: boolean;
}

export interface VariableMapConfig {
  type?: string;
  scene?: string;
  coordinate_help?: "hidden" | "full" | "compact";
  collection_help?: "none" | "single" | "stacked";
  width?: number;
  height?: number;
  actor?: { x?: number; y?: number; direction?: string };
  objects?: MapObject[];
  coordinate_bounds?: {
    min_x?: number;
    max_x?: number;
    min_y?: number;
    max_y?: number;
  };
  variable_bindings?: { x?: string; y?: string };
}

function numeric(value: Scalar | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function projectVariableMap(
  run: PythonRunResult,
  config: VariableMapConfig
): PythonRunResult {
  if (config.type !== "variable_map" || !run.started) return run;

  const width = Math.max(1, Number(config.width || 5));
  const height = Math.max(1, Number(config.height || 5));
  const xName = config.variable_bindings?.x || "x";
  const yName = config.variable_bindings?.y || "y";
  const minX = Number(config.coordinate_bounds?.min_x ?? 0);
  const maxX = Number(config.coordinate_bounds?.max_x ?? width - 1);
  const minY = Number(config.coordinate_bounds?.min_y ?? 0);
  const maxY = Number(config.coordinate_bounds?.max_y ?? height - 1);
  let actualX = Number(config.actor?.x ?? 0);
  let actualY = Number(config.actor?.y ?? 0);
  let enteredX = actualX;
  let enteredY = actualY;
  const objects = (config.objects || []).map((item) => ({ ...item, collected: false }));
  const collected: string[] = [];
  let speech = "";
  let direction = String(config.actor?.direction || "right");
  let lastVariables: Record<string, Scalar> = {};
  let seq = 0;
  const projected: TraceEvent[] = [];
  const coordinateFeedbackEnabled = config.coordinate_help !== "hidden";

  const state = () => ({
    scene: config.scene || "apple_map",
    width,
    height,
    actor: {
      x: actualX,
      y: actualY,
      display_x: Math.min(maxX, Math.max(minX, actualX)),
      display_y: Math.min(maxY, Math.max(minY, actualY)),
      direction,
    },
    coordinate_bounds: { min_x: minX, max_x: maxX, min_y: minY, max_y: maxY },
    speech,
    collected: [...collected],
    objects: clone(objects),
    out_of_bounds: actualX < minX || actualX > maxX || actualY < minY || actualY > maxY,
  });

  const addStage = (
    source: TraceEvent,
    action: string,
    payload: Record<string, unknown>
  ) => {
    projected.push({
      seq: ++seq,
      type: "stage",
      line: source.line,
      variables: source.variables,
      action,
      payload,
      stage_state: state(),
    });
  };

  for (const source of run.events) {
    projected.push({ ...source, seq: ++seq });
    if (source.type === "print") {
      speech = source.text || "";
      addStage(source, "speak", { text: speech, authoritative: true });
      continue;
    }
    if (source.type === "line") {
      continue;
    }
    if (source.type !== "variables") continue;
    const variables = source.variables || {};
    const variablesChanged = JSON.stringify(variables) !== JSON.stringify(lastVariables);
    lastVariables = clone(variables);
    const nextX = numeric(variables[xName], actualX);
    const nextY = numeric(variables[yName], actualY);
    if (nextX === actualX && nextY === actualY) {
      if (coordinateFeedbackEnabled && variablesChanged) {
        addStage(source, "observe", {
          authoritative: true,
          from_x: actualX,
          from_y: actualY,
          to_x: actualX,
          to_y: actualY,
          delta_x: 0,
          delta_y: 0,
        });
      }
      continue;
    }

    if (nextX > actualX) direction = "right";
    else if (nextX < actualX) direction = "left";
    else if (nextY > actualY) direction = "down";
    else if (nextY < actualY) direction = "up";

    const startX = actualX;
    const startY = actualY;
    const dx = nextX - startX;
    const dy = nextY - startY;
    const movementPayload = {
      from_x: startX,
      from_y: startY,
      to_x: nextX,
      to_y: nextY,
      delta_x: dx,
      delta_y: dy,
    };
    const steps = Math.max(Math.abs(dx), Math.abs(dy));
    for (let step = 1; step < steps; step += 1) {
      actualX = startX + Math.sign(dx) * Math.min(step, Math.abs(dx));
      actualY = startY + Math.sign(dy) * Math.min(step, Math.abs(dy));
      addStage(source, "move", {
        ...movementPayload,
        authoritative: false,
        interpolated: true,
        display_step: step,
        display_steps: steps,
      });
    }

    actualX = nextX;
    actualY = nextY;
    let collectedId: string | null = null;
    const inBounds = actualX >= minX && actualX <= maxX && actualY >= minY && actualY <= maxY;
    if (inBounds && (actualX !== enteredX || actualY !== enteredY)) {
      const itemAtPosition = objects.find(
        (item) => !item.collected && item.x === actualX && item.y === actualY
      );
      if (itemAtPosition) {
        itemAtPosition.collected = true;
        collectedId = itemAtPosition.id;
        collected.push(itemAtPosition.id);
      }
    }
    enteredX = actualX;
    enteredY = actualY;
    const collectedObject = collectedId
      ? objects.find((item) => item.id === collectedId)
      : undefined;
    addStage(source, collectedId ? "collect" : "move", {
      ...movementPayload,
      authoritative: true,
      item_id: collectedId,
      item_kind: collectedObject?.kind,
    });
  }

  const finalState = state();
  return {
    ...run,
    events: projected,
    stage_state: finalState,
  };
}
