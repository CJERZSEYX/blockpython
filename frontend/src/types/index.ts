export type Stage = "P" | "A" | "C" | "I";

export type LLMRole = "讲解者" | "搭建提示者" | "编码教练" | "学习伙伴";

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
  version: string;
  suggested_lessons: number;
  has_learning_advice?: boolean;
  learning_advice_updated_at?: string | null;
  content_json?: TaskContent;
}

export interface StudentLearningAdvice {
  achieved: string;
  focus: string;
  action: string;
  evidence_version: number;
}

export interface StudentTaskState {
  task_id: number;
  last_stage: Stage;
  a_completed: boolean;
  c_completed: boolean;
  a_reference_hidden: boolean;
  drafts: { A: string; C: string; I: string };
  updated_at: string | null;
}

export interface TargetConfig {
  mode: "exact" | "template" | "input_case" | "stage";
  expected?: string;
  template?: string;
  cases?: Record<string, string>;
  default?: string;
  expected_state?: Record<string, unknown>;
  state_cases?: Record<string, Record<string, unknown>>;
  default_state?: Record<string, unknown>;
  expected_stdout?: string;
  stdout_cases?: Record<string, string>;
  expected_variables?: Record<string, string | number | boolean | null>;
  required_features?: Array<"has_for" | "has_if" | "has_input">;
}

export interface TaskContent {
  content_version: string;
  toolbox: string[];
  learning_guide?: LearningGuide;
  support?: {
    profile: string;
    prompt_version: string;
    P: string;
    A: string;
    C: string;
    I: string;
  };
  p_stage: PStageContent;
  a_stage: AStageContent;
  c_stage: CStageContent;
  i_stage: IStageContent;
  visualization: VisualizationConfig;
}

export interface LearningGuide {
  goal: string;
  expected_effect?: string;
  platform_principle?: {
    title: string;
    description: string;
    rules: string[];
  };
  overview?: string;
  steps: string[];
  observe: string;
  concepts: string[];
  trace?: {
    columns: string[];
    rows: string[][];
  };
  program_sections?: Array<{
    label: string;
    focus: string;
  }>;
}

export interface PStageContent {
  intro?: string;
  subtasks: Subtask[];
}

export interface Subtask {
  id: number;
  title: string;
  objective: string;
  blocks: BlockMapping[];
  concepts?: string[];
  trace?: {
    columns: string[];
    rows: string[][];
  };
}

export interface BlockMapping {
  block_id: string;
  block_type: string;
  drawer_category: "控制" | "数据" | "输入输出" | "文本";
  meaning: string;
  translation_rule: string;
  python_code: string;
  explanation: string;
  color: "blue" | "orange" | "green" | "purple";
}

export interface AStageContent {
  python_code: string;
  instruction?: string;
  target: TargetConfig;
  requires_input?: boolean;
  input_placeholder?: string;
  input_options?: string[];
}

export interface CStageContent {
  title: string;
  description: string;
  code_skeleton: string;
  blocks_xml: string;
  target: TargetConfig;
  requires_input?: boolean;
  input_placeholder?: string;
  input_options?: string[];
}

export interface IStageContent {
  mode: "free_dialogue" | "fixed_extension";
  title?: string;
  description: string;
  code_skeleton?: string;
  target?: TargetConfig;
  visualization_override?: VisualizationConfig;
  requires_input?: boolean;
  input_placeholder?: string;
  input_options?: string[];
  ui_copy?: {
    planning: string;
    reference_step: string;
    discussion_step: string;
    editor_placeholder: string;
    empty_code_description: string;
  };
}

export type ExecutionStatus =
  | "invalid_structure"
  | "syntax_error"
  | "runtime_error"
  | "target_mismatch"
  | "target_met"
  | "timeout";

export interface ExecutionEvent {
  seq: number;
  type: "line" | "print" | "input" | "variables" | "stage";
  line?: number;
  block_id?: string;
  text?: string;
  value?: string;
  prompt?: string;
  variables?: Record<string, string | number | boolean | null>;
  action?: string;
  payload?: Record<string, unknown>;
  stage_state?: StageState;
  final?: boolean;
}

export interface ExecutionDiagnostic {
  code: string;
  message: string;
  block_id?: string;
}

export interface LearningDiagnostic {
  code: string;
  knowledge_components: string[];
  severity: "info" | "warning" | "blocking";
  evidence_ids: string[];
  block_id?: string;
  line?: number;
  resolved: boolean;
}

export interface ExecutionResult {
  status: ExecutionStatus;
  started: boolean;
  code: string;
  generated_code?: string;
  line_block_map: Record<number, string>;
  diagnostics: ExecutionDiagnostic[];
  stdout: string;
  stderr: string;
  line: number | null;
  events: ExecutionEvent[];
  variables?: Record<string, string | number | boolean | null>;
  stage_state?: StageState;
  ast_features?: Record<string, boolean>;
  expected_output: string;
  artifact_version?: number;
  artifact_snapshot_id?: string;
  artifact_hash?: string;
  diagnosis_occurrence?: number;
  agent_intervention_recommended?: boolean;
  learning_diagnostics?: LearningDiagnostic[];
  learning_state?: StudentTaskState;
}

export type VisualizationType = "console" | "variable_map";

export interface StageActor {
  x: number;
  y: number;
  direction: "right" | "left" | "up" | "down";
  display_x?: number;
  display_y?: number;
}

export interface StageObject {
  id: string;
  kind: string;
  x: number;
  y: number;
  collected?: boolean;
}

export interface StageState {
  scene: string;
  width: number;
  height: number;
  actor: StageActor;
  speech: string;
  equipment: string;
  paid: number;
  left_items: Array<string | number>;
  right_items: Array<string | number>;
  collected: string[];
  objects: StageObject[];
  out_of_bounds?: boolean;
  coordinate_bounds?: {
    min_x: number;
    max_x: number;
    min_y: number;
    max_y: number;
  };
}

export interface VisualizationConfig {
  type: VisualizationType;
  coordinate_help?: "hidden" | "full" | "compact";
  collection_help?: "none" | "single" | "stacked";
  collection_target?: number;
  scene?: string;
  width?: number;
  height?: number;
  actor?: StageActor;
  objects?: StageObject[];
  coordinate_bounds?: {
    min_x?: number;
    max_x?: number;
    min_y?: number;
    max_y?: number;
  };
  variable_bindings?: {
    x?: string;
    y?: string;
    stdout?: string;
  };
  state_panel?: {
    title: string;
    variables: string[];
    input_label?: string;
    loop_variable?: string;
    condition?: {
      variable: string;
      operator: "==" | "<" | ">";
      value: string | number;
      true_label: string;
      false_label: string;
    };
    trace?: {
      columns: string[];
      rows: string[][];
      active_variable: string;
    };
  };
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  message_type?: string;
  artifact_token?: string;
}

export interface SupportRequest {
  target_stage?: Stage;
  trigger:
    | "stage_intro"
    | "p_step_explanation"
    | "run_feedback"
    | "hint_request"
    | "collaboration_start"
    | "inactivity"
    | "stage_completed"
    | "service_error";
  attempt?: number;
  run_outcome?: ExecutionStatus;
  error_line?: number | null;
  block_id?: string;
  student_code?: string;
  artifact_version?: number;
  diagnosis_code?: string;
  support_level?: 1 | 2 | 3;
  evidence_ids?: string[];
  diagnosis_occurrence?: number;
  step_id?: number;
  request_key?: string;
}

export interface ActionLog {
  event_id?: string;
  user_id: string;
  session_id: string;
  task_id?: number;
  stage?: Stage;
  action_type: string;
  action_detail?: Record<string, unknown>;
  duration_ms?: number;
  prompt_version?: string;
}
