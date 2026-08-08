import type { Stage } from "../types";
import { trackAction } from "./trackService";

const IDLE_LIMIT_MS = 2 * 60 * 1000;
const FLUSH_INTERVAL_MS = 30 * 1000;
const SAMPLE_INTERVAL_MS = 1000;

interface LearningContext {
  userId: string;
  sessionId: string;
  taskId: number;
  stage: Stage;
}

let context: LearningContext | null = null;
let lastSampleAt = Date.now();
let lastActivityAt = Date.now();
let accumulatedMs = 0;
let sliceStartedAt = Date.now();
let sampleTimer: number | null = null;

function noteActivity() {
  lastActivityAt = Date.now();
}

function sample() {
  const now = Date.now();
  const elapsed = Math.min(now - lastSampleAt, SAMPLE_INTERVAL_MS * 2);
  if (context && !document.hidden && now - lastActivityAt <= IDLE_LIMIT_MS) {
    accumulatedMs += Math.max(0, elapsed);
  }
  lastSampleAt = now;
}

function flush(reason: string) {
  sample();
  if (context && accumulatedMs >= 500) {
    trackAction({
      user_id: context.userId,
      session_id: context.sessionId,
      task_id: context.taskId,
      stage: context.stage,
      action_type: "active_learning_slice",
      duration_ms: Math.round(accumulatedMs),
      action_detail: {
        reason,
        slice_started_at: new Date(sliceStartedAt).toISOString(),
        idle_limit_ms: IDLE_LIMIT_MS,
      },
    });
  }
  accumulatedMs = 0;
  sliceStartedAt = Date.now();
  lastSampleAt = Date.now();
}

function ensureListeners() {
  if (sampleTimer != null) return;
  for (const eventName of ["pointerdown", "keydown", "wheel", "touchstart"] as const) {
    window.addEventListener(eventName, noteActivity, { passive: true });
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) flush("page_hidden");
    else noteActivity();
  });
  window.addEventListener("pagehide", () => flush("page_leave"));
  sampleTimer = window.setInterval(sample, SAMPLE_INTERVAL_MS);
  window.setInterval(() => flush("interval"), FLUSH_INTERVAL_MS);
}

export function setActiveLearningContext(next: LearningContext | null) {
  ensureListeners();
  if (
    context
    && (!next
      || context.userId !== next.userId
      || context.taskId !== next.taskId
      || context.stage !== next.stage)
  ) {
    flush(next ? "context_change" : "task_leave");
  }
  context = next;
  noteActivity();
  lastSampleAt = Date.now();
}

export function markLearningActivity() {
  noteActivity();
}
