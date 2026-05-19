export type Stage = "P" | "A" | "C" | "I";

export type LLMRole = "讲解者" | "辅导员" | "协助者" | "学习伙伴";

export interface User {
  id: string;
  name: string;
  grade?: string;
  prior_experience?: string;
}

export interface Task {
  id: number;
  title: string;
  description: string;
  sort_order: number;
  content_json?: TaskContent;
}

export interface TaskContent {
  p_stage: PStageContent;
  a_stage: AStageContent;
  c_stage: CStageContent;
  i_stage: IStageContent;
}

export interface PStageContent {
  subtasks: Subtask[];
}

export interface Subtask {
  id: number;
  title: string;
  block_image_url: string;
  blocks: BlockMapping[];
}

export interface BlockMapping {
  block_id: string;
  block_type: string;
  python_code: string;
  explanation: string;
  color: "blue" | "orange" | "green" | "purple";
}

export interface AStageContent {
  python_code: string;
  expected_blocks: string;
}

export interface CStageContent {
  title: string;
  description: string;
  block_image: string;
  code_skeleton: string;
  expected_output: string;
}

export interface IStageContent {
  summary_points: string[];
  question_prompts: string[];
}

export interface UserProgress {
  task_id: number;
  current_stage: string;
  status: "not_started" | "in_progress" | "completed";
  completed_at?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface ActionLog {
  user_id: string;
  session_id: string;
  task_id?: number;
  stage?: Stage;
  action_type: string;
  action_detail?: Record<string, unknown>;
  duration_ms?: number;
}
