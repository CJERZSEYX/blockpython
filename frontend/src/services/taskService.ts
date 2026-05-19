import api from "./api";
import type { Task, UserProgress } from "../types";

export const getTaskList = async () => {
  const { data } = await api.get<{ tasks: Task[] }>("/task/list");
  return data.tasks;
};

export const getTaskDetail = async (id: number) => {
  const { data } = await api.get<{ task: Task }>(`/task/${id}`);
  return data.task;
};

export const getUserProgress = async (userId: string) => {
  const { data } = await api.get<{ progress: UserProgress[] }>(
    `/task/progress/${userId}`
  );
  return data.progress;
};

export const startTask = async (user_id: string, task_id: number) => {
  const { data } = await api.post("/task/start", { user_id, task_id });
  return data;
};

export const updateStage = async (
  user_id: string,
  task_id: number,
  stage: string
) => {
  const { data } = await api.post("/task/updateStage", {
    user_id,
    task_id,
    stage,
  });
  return data;
};

export const getCStageBlocks = async (taskId: number) => {
  const { data } = await api.get<{ blocks_xml: string }>(
    `/task/${taskId}/cstage`
  );
  return data;
};

export const completeTask = async (user_id: string, task_id: number) => {
  const { data } = await api.post("/task/complete", { user_id, task_id });
  return data;
};
