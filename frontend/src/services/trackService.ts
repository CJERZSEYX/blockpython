import api from "./api";
import type { ActionLog } from "../types";

const pendingActions: ActionLog[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const flush = async () => {
  if (pendingActions.length === 0) return;
  const batch = [...pendingActions];
  pendingActions.length = 0;
  try {
    await api.post("/track/batch", { actions: batch });
  } catch (err) {
    console.error("Failed to flush tracking data:", err);
  }
};

export const trackAction = (log: ActionLog) => {
  pendingActions.push({ ...log });
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 3000);
};

export const flushNow = () => {
  if (flushTimer) clearTimeout(flushTimer);
  return flush();
};
