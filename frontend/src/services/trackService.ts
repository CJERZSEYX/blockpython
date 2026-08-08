import type { ActionLog } from "../types";

const STORAGE_KEY = "icap_pending_actions";
const MAX_PENDING_ACTIONS = 1000;
const FLUSH_DELAY_MS = 3000;
const RETRY_DELAY_MS = 5000;
const apiBaseUrl =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? "/api" : "http://localhost:3001/api");
const endpoint = `${apiBaseUrl.replace(/\/$/, "")}/track/batch`;

let pendingActions: ActionLog[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;

function currentSessionId() {
  return sessionStorage.getItem("icap_session") || "";
}

function loadPendingActions() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as ActionLog[];
    const sessionId = currentSessionId();
    pendingActions = saved.filter((item) => item.session_id === sessionId);
  } catch {
    pendingActions = [];
  }
}

function persistPendingActions() {
  try {
    if (pendingActions.length === 0) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pendingActions.slice(-MAX_PENDING_ACTIONS)));
  } catch {
    // Logging must never interrupt the learning workflow.
  }
}

function makeEventId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function scheduleFlush(delay = FLUSH_DELAY_MS) {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => void flush(), delay);
}

async function flush(keepalive = false) {
  if (flushing || pendingActions.length === 0) return;
  const token = currentSessionId();
  if (!token) return;

  const batch = [...pendingActions];
  pendingActions = [];
  persistPendingActions();
  flushing = true;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-token": token,
      },
      body: JSON.stringify({ actions: batch }),
      keepalive,
    });
    if (!response.ok) throw new Error(`Tracking request failed: ${response.status}`);
  } catch (error) {
    pendingActions = [...batch, ...pendingActions].slice(-MAX_PENDING_ACTIONS);
    persistPendingActions();
    if (!keepalive) {
      console.error("Failed to flush tracking data:", error);
      scheduleFlush(RETRY_DELAY_MS);
    }
  } finally {
    flushing = false;
  }
}

loadPendingActions();

window.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") void flush(true);
});
window.addEventListener("pagehide", () => {
  void flush(true);
});

export const trackAction = (log: ActionLog) => {
  pendingActions.push({
    ...log,
    event_id: log.event_id || makeEventId(),
  });
  pendingActions = pendingActions.slice(-MAX_PENDING_ACTIONS);
  persistPendingActions();
  scheduleFlush();
};

export const flushNow = () => {
  if (flushTimer) clearTimeout(flushTimer);
  return flush();
};
