import { create } from "zustand";
import type {
  Stage,
  User,
  ChatMessage,
  Task,
  TaskContent,
  SupportRequest,
  StudentTaskState,
} from "../types";

interface AppState {
  user: User | null;
  sessionId: string;
  selectedTask: Task | null;
  currentStage: Stage;
  chatMessages: ChatMessage[];
  isBlocklyReadOnly: boolean;
  pythonCode: string;
  iPythonCode: string;
  currentBlocklyXml: string;
  taskContent: TaskContent | null;
  pendingSystemMessage: SupportRequest | null;
  savedAWorkspace: string;
  cStageBlocksXml: string;
  learningState: StudentTaskState | null;
  triggeredStages: Set<string>;
  artifactRevision: number;
  agentAnchor: { stage: Stage; block_id?: string; line?: number; label?: string } | null;
  learningActivity: {
    running: boolean;
    inputOpen: boolean;
    playbackActive: boolean;
    chatFocused: boolean;
    chatSending: boolean;
    lastMeaningfulActionAt: number;
  };

  setUser: (user: User, sessionId: string) => void;
  setSelectedTask: (task: Task | null) => void;
  setStage: (stage: Stage) => void;
  addChatMessage: (msg: Omit<ChatMessage, "timestamp">) => void;
  mergeChatHistory: (messages: ChatMessage[]) => void;
  setBlocklyReadOnly: (readOnly: boolean) => void;
  setPythonCode: (code: string) => void;
  setIPythonCode: (code: string) => void;
  setCurrentBlocklyXml: (xml: string) => void;
  setTaskContent: (content: TaskContent | null) => void;
  setPendingSystemMessage: (msg: SupportRequest | null) => void;
  setSavedAWorkspace: (xml: string) => void;
  setCStageBlocksXml: (xml: string) => void;
  applyLearningState: (state: StudentTaskState) => void;
  markStageTriggered: (stage: string) => void;
  setAgentAnchor: (anchor: { stage: Stage; block_id?: string; line?: number; label?: string } | null) => void;
  setLearningActivity: (activity: Partial<AppState["learningActivity"]>) => void;
  resetTeachingState: () => void;
}

const SUPPORT_PROMPT_VERSION = "icap-process-aware-agent-v4";

const idleLearningActivity = () => ({
  running: false,
  inputOpen: false,
  playbackActive: false,
  chatFocused: false,
  chatSending: false,
  lastMeaningfulActionAt: Date.now(),
});

function clearLegacyCompletionState() {
  Object.keys(localStorage)
    .filter((key) => key === "icap_completed" || key.startsWith("icap_turns_"))
    .forEach((key) => localStorage.removeItem(key));
}

function clearCachedChatState() {
  Object.keys(sessionStorage)
    .filter((key) => key.startsWith("icap_chat_"))
    .forEach((key) => sessionStorage.removeItem(key));
}

function getTriggeredStages(): Set<string> {
  if (sessionStorage.getItem("icap_prompt_version") !== SUPPORT_PROMPT_VERSION) {
    sessionStorage.removeItem("icap_triggered");
    sessionStorage.setItem("icap_prompt_version", SUPPORT_PROMPT_VERSION);
  }
  return new Set<string>(JSON.parse(sessionStorage.getItem("icap_triggered") || "[]"));
}

function draftKey(userId: string | undefined, taskId: number | undefined, kind: "a" | "c" | "i") {
  return userId && taskId ? `icap_draft_${userId}_${taskId}_${kind}` : "";
}

function readDraft(userId: string | undefined, taskId: number | undefined, kind: "a" | "c" | "i") {
  const key = draftKey(userId, taskId, kind);
  return key ? sessionStorage.getItem(key) || "" : "";
}

clearLegacyCompletionState();
clearCachedChatState();

const initialUser = JSON.parse(sessionStorage.getItem("icap_user") || "null") as User | null;
const initialTask = JSON.parse(sessionStorage.getItem("icap_task") || "null") as Task | null;

export const useAppStore = create<AppState>((set) => ({
  user: initialUser,
  sessionId: sessionStorage.getItem("icap_session") || "",
  selectedTask: initialTask,
  currentStage: "P",
  chatMessages: [],
  isBlocklyReadOnly: true,
  pythonCode: readDraft(initialUser?.id, initialTask?.id, "c"),
  iPythonCode: readDraft(initialUser?.id, initialTask?.id, "i"),
  currentBlocklyXml: "",
  taskContent: null,
  pendingSystemMessage: null,
  savedAWorkspace: readDraft(initialUser?.id, initialTask?.id, "a"),
  cStageBlocksXml: "",
  learningState: null,
  triggeredStages: getTriggeredStages(),
  artifactRevision: 0,
  agentAnchor: null,
  learningActivity: idleLearningActivity(),

  setUser: (user, sessionId) => {
    sessionStorage.setItem("icap_user", JSON.stringify(user));
    sessionStorage.setItem("icap_session", sessionId);
    set({ user, sessionId });
  },
  setSelectedTask: (task) => {
    sessionStorage.setItem("icap_task", JSON.stringify(task));
    set((state) => {
      const taskChanged = state.selectedTask?.id !== task?.id;
      return {
        selectedTask: task,
        pythonCode: readDraft(state.user?.id, task?.id, "c"),
        iPythonCode: readDraft(state.user?.id, task?.id, "i"),
        savedAWorkspace: readDraft(state.user?.id, task?.id, "a"),
        ...(taskChanged
          ? {
              currentStage: "P" as Stage,
              chatMessages: [],
              isBlocklyReadOnly: true,
              currentBlocklyXml: "",
              taskContent: null,
              pendingSystemMessage: null,
              cStageBlocksXml: "",
              learningState: null,
              artifactRevision: 0,
              agentAnchor: null,
              learningActivity: idleLearningActivity(),
            }
          : {}),
      };
    });
  },
  setStage: (stage) => {
    set({
      currentStage: stage,
      chatMessages: [],
      agentAnchor: null,
      learningActivity: idleLearningActivity(),
    });
  },
  addChatMessage: (msg) =>
    set((state) => {
      const previous = state.chatMessages[state.chatMessages.length - 1];
      if (previous?.role === msg.role && previous.content.trim() === msg.content.trim()) {
        return state;
      }
      const newMessages = [...state.chatMessages, { ...msg, timestamp: Date.now() }];
      return { chatMessages: newMessages };
    }),
  mergeChatHistory: (messages) =>
    set((state) => {
      const merged = [...messages, ...state.chatMessages];
      const seen = new Set<string>();
      const chatMessages = merged.filter((message) => {
        const key = `${message.role}:${message.content.trim()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return { chatMessages };
    }),
  setBlocklyReadOnly: (readOnly) => set({ isBlocklyReadOnly: readOnly }),
  setPythonCode: (code) =>
    set((state) => {
      const key = draftKey(state.user?.id, state.selectedTask?.id, "c");
      if (key) sessionStorage.setItem(key, code);
      return {
        pythonCode: code,
        artifactRevision: state.pythonCode === code
          ? state.artifactRevision
          : state.artifactRevision + 1,
        ...(state.pythonCode === code ? {} : {
          agentAnchor: null,
          learningActivity: { ...state.learningActivity, lastMeaningfulActionAt: Date.now() },
        }),
      };
    }),
  setIPythonCode: (code) =>
    set((state) => {
      const key = draftKey(state.user?.id, state.selectedTask?.id, "i");
      if (key) sessionStorage.setItem(key, code);
      return {
        iPythonCode: code,
        artifactRevision: state.iPythonCode === code
          ? state.artifactRevision
          : state.artifactRevision + 1,
        ...(state.iPythonCode === code ? {} : {
          agentAnchor: null,
          learningActivity: { ...state.learningActivity, lastMeaningfulActionAt: Date.now() },
        }),
      };
    }),
  setCurrentBlocklyXml: (xml) => set((state) => {
    const changed = state.currentBlocklyXml !== xml;
    return {
      currentBlocklyXml: xml,
      artifactRevision: changed ? state.artifactRevision + 1 : state.artifactRevision,
      ...(changed ? {
        agentAnchor: null,
        learningActivity: { ...state.learningActivity, lastMeaningfulActionAt: Date.now() },
      } : {}),
    };
  }),
  setTaskContent: (content) => set({ taskContent: content }),
  setPendingSystemMessage: (msg) => set({ pendingSystemMessage: msg }),
  setSavedAWorkspace: (xml) =>
    set((state) => {
      const key = draftKey(state.user?.id, state.selectedTask?.id, "a");
      if (key) sessionStorage.setItem(key, xml);
      return { savedAWorkspace: xml };
    }),
  setCStageBlocksXml: (xml) => set({ cStageBlocksXml: xml }),
  applyLearningState: (learningState) => {
    const aKey = draftKey(useAppStore.getState().user?.id, learningState.task_id, "a");
    const cKey = draftKey(useAppStore.getState().user?.id, learningState.task_id, "c");
    const iKey = draftKey(useAppStore.getState().user?.id, learningState.task_id, "i");
    if (aKey) sessionStorage.setItem(aKey, learningState.drafts.A || "");
    if (cKey) sessionStorage.setItem(cKey, learningState.drafts.C || "");
    if (iKey) sessionStorage.setItem(iKey, learningState.drafts.I || "");
    set({
      learningState,
      currentStage: learningState.last_stage,
      savedAWorkspace: learningState.drafts.A || "",
      pythonCode: learningState.drafts.C || "",
      iPythonCode: learningState.drafts.I || "",
    });
  },
  markStageTriggered: (stage) =>
    set((state) => {
      const tid = state.selectedTask?.id || 0;
      const key = `${tid}-${stage}`;
      if (state.triggeredStages.has(key)) return state;
      const updated = new Set([...state.triggeredStages, key]);
      sessionStorage.setItem("icap_triggered", JSON.stringify([...updated]));
      return { triggeredStages: updated };
    }),
  setAgentAnchor: (agentAnchor) => set({ agentAnchor }),
  setLearningActivity: (activity) => set((state) => ({
    learningActivity: { ...state.learningActivity, ...activity },
  })),
  resetTeachingState: () => {
    clearCachedChatState();
    set({
      currentStage: "P",
      chatMessages: [],
      isBlocklyReadOnly: true,
      pythonCode: "",
      iPythonCode: "",
      currentBlocklyXml: "",
      taskContent: null,
      pendingSystemMessage: null,
      savedAWorkspace: "",
      cStageBlocksXml: "",
      learningState: null,
      triggeredStages: getTriggeredStages(),
      artifactRevision: 0,
      agentAnchor: null,
      learningActivity: idleLearningActivity(),
    });
  },
}));
