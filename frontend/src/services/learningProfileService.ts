import api from "./api";
import type { StudentLearningAdvice } from "../types";

export interface StudentLearningAdviceResponse {
  student_advice: StudentLearningAdvice | null;
  student_advice_updated_at: string | null;
}

export async function getStudentLearningAdvice(taskId: number) {
  const { data } = await api.get<StudentLearningAdviceResponse>(`/learning-profile/${taskId}`);
  return data;
}
