import api from "./api";
import type { ExecutionResult, Stage } from "../types";

interface ExecuteRequest {
  task_id: number;
  stage: Extract<Stage, "A" | "C" | "I">;
  code?: string;
  blockly_xml?: string;
  input?: string;
  attempt?: number;
  activity_summary?: Record<string, number>;
  operation_id: string;
  artifact_hash: string;
  artifact_version: number;
}

export const executeProgram = async (request: ExecuteRequest): Promise<ExecutionResult> => {
  const { data } = await api.post<ExecutionResult>("/submit/execute", request);
  return data;
};
