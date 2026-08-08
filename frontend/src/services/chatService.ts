import api from "./api";
import type { ChatMessage, ExecutionStatus, Stage } from "../types";

interface ChatContext {
  task_id: number;
  trigger?: string;
  attempt?: number;
  run_outcome?: ExecutionStatus;
  error_line?: number | null;
  block_id?: string;
  student_code?: string;
  blockly_xml?: string;
  message_type?: string;
  client_message_id?: string;
  artifact_version?: number;
  artifact_token?: string;
  support_level?: 1 | 2 | 3;
  evidence_ids?: string[];
  diagnosis_code?: string;
  diagnosis_occurrence?: number;
  step_id?: number;
  request_key?: string;
}

export const sendChatMessage = async (
  messages: Omit<ChatMessage, "timestamp">[],
  stage: Stage,
  context: ChatContext
) => {
  const { data } = await api.post("/chat/send", { messages, stage, ...context });
  return data;
};

export const getChatHistory = async (taskId: number, stage: Stage, artifactToken: string) => {
  const { data } = await api.get("/chat/history", {
    params: { task_id: taskId, stage, artifact_token: artifactToken },
  });
  return data.messages as Array<{
    role: "user" | "assistant";
    content: string;
    message_type: string;
    artifact_token?: string;
    created_at: string;
  }>;
};
