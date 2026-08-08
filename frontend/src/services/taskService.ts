import api from "./api";
import type { Task } from "../types";

export const getTaskList = async () => {
  const { data } = await api.get<{ tasks: Task[] }>("/task/list");
  return data.tasks;
};

export const getTaskDetail = async (id: number) => {
  const { data } = await api.get<{ task: Task }>(`/task/${id}`);
  return data.task;
};

export const getCStageBlocks = async (taskId: number) => {
  const { data } = await api.get<{ blocks_xml: string }>(
    `/task/${taskId}/cstage`
  );
  return data;
};
