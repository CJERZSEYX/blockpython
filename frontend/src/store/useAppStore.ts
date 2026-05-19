import { create } from "zustand";
import type { Stage, User, ChatMessage, Task, TaskContent, Subtask, BlockMapping } from "../types";

interface AppState {
  user: User | null;
  sessionId: string;
  selectedTask: Task | null;
  currentStage: Stage;
  chatMessages: ChatMessage[];
  isBlocklyReadOnly: boolean;
  showCodeEditor: boolean;
  pythonCode: string;
  taskContent: TaskContent | null;
  selectedSubtask: Subtask | null;
  selectedBlock: BlockMapping | null;
  highlightedBlockId: string | null;
  pendingSystemMessage: string | null;
  savedAWorkspace: string;
  cStageBlocksXml: string;
  completedStages: Set<string>;
  dialogTurnCount: number;
  triggeredStages: Set<string>;

  setUser: (user: User, sessionId: string) => void;
  setSelectedTask: (task: Task | null) => void;
  setStage: (stage: Stage) => void;
  addChatMessage: (msg: Omit<ChatMessage, "timestamp">) => void;
  setBlocklyReadOnly: (readOnly: boolean) => void;
  setShowCodeEditor: (show: boolean) => void;
  setPythonCode: (code: string) => void;
  setTaskContent: (content: TaskContent | null) => void;
  setSelectedSubtask: (subtask: Subtask | null) => void;
  setSelectedBlock: (block: BlockMapping | null) => void;
  setHighlightedBlockId: (id: string | null) => void;
  setPendingSystemMessage: (msg: string | null) => void;
  setSavedAWorkspace: (xml: string) => void;
  setCStageBlocksXml: (xml: string) => void;
  markStageCompleted: (stage: string) => void;
  markStageTriggered: (stage: string) => void;
  resetTeachingState: () => void;
  getDialogTurnCount: () => number;
  canCompleteIStage: () => boolean;
}

function getCompletedStages(): Set<string> {
  return new Set<string>(JSON.parse(localStorage.getItem("icap_completed") || "[]"));
}

function getTurnCount(taskId: number): number {
  return parseInt(localStorage.getItem(`icap_turns_${taskId}`) || "0");
}

function getTriggeredStages(): Set<string> {
  return new Set<string>(JSON.parse(sessionStorage.getItem("icap_triggered") || "[]"));
}

export const useAppStore = create<AppState>((set, get) => ({
  user: JSON.parse(sessionStorage.getItem("icap_user") || "null") as User | null,
  sessionId: sessionStorage.getItem("icap_session") || "",
  selectedTask: JSON.parse(sessionStorage.getItem("icap_task") || "null"),
  currentStage: "P",
  chatMessages: [],
  isBlocklyReadOnly: true,
  showCodeEditor: false,
  pythonCode: "",
  taskContent: null,
  selectedSubtask: null,
  selectedBlock: null,
  highlightedBlockId: null,
  pendingSystemMessage: null,
  savedAWorkspace: "",
  cStageBlocksXml: "",
  completedStages: getCompletedStages(),
  dialogTurnCount: 0,
  triggeredStages: getTriggeredStages(),

  setUser: (user, sessionId) => {
    sessionStorage.setItem("icap_user", JSON.stringify(user));
    sessionStorage.setItem("icap_session", sessionId);
    set({ user, sessionId });
  },
  setSelectedTask: (task) => {
    sessionStorage.setItem("icap_task", JSON.stringify(task));
    const tc = task ? getTurnCount(task.id) : 0;
    set({ selectedTask: task, dialogTurnCount: tc });
  },
  setStage: (stage) => {
    const state = get();
    const tid = state.selectedTask?.id || 0;
    const key = `icap_chat_${tid}_${state.currentStage}`;
    sessionStorage.setItem(key, JSON.stringify(state.chatMessages));
    const newKey = `icap_chat_${tid}_${stage}`;
    const saved = sessionStorage.getItem(newKey);
    set({ currentStage: stage, chatMessages: saved ? JSON.parse(saved) : [] });
  },
  addChatMessage: (msg) =>
    set((state) => {
      const newMessages = [...state.chatMessages, { ...msg, timestamp: Date.now() }];
      let turns = state.dialogTurnCount;
      if (msg.role === "assistant") {
        turns = state.dialogTurnCount + 1;
        const tid = state.selectedTask?.id || 0;
        localStorage.setItem(`icap_turns_${tid}`, String(turns));
      }
      return { chatMessages: newMessages, dialogTurnCount: turns };
    }),
  setBlocklyReadOnly: (readOnly) => set({ isBlocklyReadOnly: readOnly }),
  setShowCodeEditor: (show) => set({ showCodeEditor: show }),
  setPythonCode: (code) => set({ pythonCode: code }),
  setTaskContent: (content) => set({ taskContent: content }),
  setSelectedSubtask: (subtask) => set({ selectedSubtask: subtask, selectedBlock: null }),
  setSelectedBlock: (block) => set({ selectedBlock: block, highlightedBlockId: block?.block_id || null }),
  setHighlightedBlockId: (id) => set({ highlightedBlockId: id }),
  setPendingSystemMessage: (msg) => set({ pendingSystemMessage: msg }),
  setSavedAWorkspace: (xml) => set({ savedAWorkspace: xml }),
  setCStageBlocksXml: (xml) => set({ cStageBlocksXml: xml }),
  markStageCompleted: (stage) =>
    set((state) => {
      const tid = state.selectedTask?.id || 0;
      const key = `${tid}-${stage}`;
      if (state.completedStages.has(key)) return state;
      const updated = new Set([...state.completedStages, key]);
      localStorage.setItem("icap_completed", JSON.stringify([...updated]));
      return { completedStages: updated };
    }),
  markStageTriggered: (stage) =>
    set((state) => {
      const tid = state.selectedTask?.id || 0;
      const key = `${tid}-${stage}`;
      if (state.triggeredStages.has(key)) return state;
      const updated = new Set([...state.triggeredStages, key]);
      sessionStorage.setItem("icap_triggered", JSON.stringify([...updated]));
      return { triggeredStages: updated };
    }),
  resetTeachingState: () =>
    set({
      currentStage: "P",
      chatMessages: [],
      isBlocklyReadOnly: true,
      showCodeEditor: false,
      pythonCode: "",
      taskContent: null,
      selectedSubtask: null,
      selectedBlock: null,
      highlightedBlockId: null,
      pendingSystemMessage: null,
      savedAWorkspace: "",
      cStageBlocksXml: "",
      completedStages: getCompletedStages(),
      dialogTurnCount: 0,
      triggeredStages: getTriggeredStages(),
    }),
  getDialogTurnCount: () => get().dialogTurnCount,
  canCompleteIStage: () => {
    const s = get();
    const tid = s.selectedTask?.id || 0;
    return (
      s.completedStages.has(`${tid}-P`) &&
      s.completedStages.has(`${tid}-A`) &&
      s.completedStages.has(`${tid}-C`) &&
      s.dialogTurnCount >= 5
    );
  },
}));
