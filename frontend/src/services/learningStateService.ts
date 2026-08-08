import api from "./api";
import type { Stage, StudentTaskState } from "../types";

export async function getLearningState(taskId: number) {
  const { data } = await api.get<{ state: StudentTaskState }>(`/learning-state/${taskId}`);
  return data.state;
}

export async function getRecentLearningState() {
  const { data } = await api.get<{ state: StudentTaskState | null }>("/learning-state/recent");
  return data.state;
}

export async function saveLearningStage(taskId: number, stage: Stage) {
  const { data } = await api.put<{ state: StudentTaskState }>(`/learning-state/${taskId}/stage`, { stage });
  return data.state;
}

export async function saveLearningDraft(taskId: number, stage: "A" | "C" | "I", content: string) {
  const { data } = await api.put<{ state: StudentTaskState }>(`/learning-state/${taskId}/draft`, { stage, content });
  return data.state;
}
