import { useCallback, useEffect, useRef } from "react";
import { appMessage as message } from "./appMessage";
import { trackAction } from "../services/trackService";
import { useAppStore } from "../store/useAppStore";

const suppressionBuckets = new Map<string, { count: number; timer: number }>();

export function notifyRepeatedOperation(content = "操作正在处理中，请勿重复点击") {
  void message.warning({
    key: "blockpython-repeat-operation",
    content,
    duration: 1.6,
  });
}

function recordSuppressed(control: string, feedback?: string) {
  notifyRepeatedOperation(feedback);
  const state = useAppStore.getState();
  const key = `${state.user?.id || "anonymous"}:${state.selectedTask?.id || 0}:${state.currentStage}:${control}`;
  const existing = suppressionBuckets.get(key);
  if (existing) {
    existing.count += 1;
    return;
  }
  const bucket = { count: 1, timer: 0 };
  bucket.timer = window.setTimeout(() => {
    suppressionBuckets.delete(key);
    const latest = useAppStore.getState();
    if (!latest.user) return;
    trackAction({
      user_id: latest.user.id,
      session_id: latest.sessionId,
      task_id: latest.selectedTask?.id,
      stage: latest.currentStage,
      action_type: "ui_repeat_suppressed",
      action_detail: { control, suppressed_count: bucket.count, window_ms: 2000 },
    });
  }, 2000);
  suppressionBuckets.set(key, bucket);
}

export function recordSuppressedOperation(control: string, feedback?: string) {
  recordSuppressed(control, feedback);
}

export interface OperationLease {
  operationId: string;
  release: () => void;
}

export function useOperationGate(minimumLockMs = 800) {
  const locksRef = useRef(new Map<string, number>());
  const timersRef = useRef<number[]>([]);

  useEffect(() => () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
    locksRef.current.clear();
  }, []);

  return useCallback((control: string): OperationLease | null => {
    if (locksRef.current.has(control)) {
      recordSuppressed(control);
      return null;
    }
    const startedAt = Date.now();
    locksRef.current.set(control, startedAt);
    let released = false;
    return {
      operationId: crypto.randomUUID(),
      release: () => {
        if (released) return;
        released = true;
        const delay = Math.max(0, minimumLockMs - (Date.now() - startedAt));
        const timer = window.setTimeout(() => locksRef.current.delete(control), delay);
        timersRef.current.push(timer);
      },
    };
  }, [minimumLockMs]);
}

export function artifactFingerprint(content: string) {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${(hash >>> 0).toString(16)}:${normalized.length}`;
}
