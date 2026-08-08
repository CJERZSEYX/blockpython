export type LearningStage = "P" | "A" | "C" | "I";
export type ArtifactType = "blockly" | "python";
export type LearnerStateName = "not_observed" | "needs_support" | "emerging" | "stable";

import type { TransferComparison } from "./transferAnalysis";

export interface DiagnosticResult {
  code: string;
  knowledge_components: string[];
  severity: "info" | "warning" | "blocking";
  evidence_ids: string[];
  block_id?: string;
  line?: number;
  resolved: boolean;
}

export interface ArtifactSnapshot {
  snapshot_id: string;
  task_id: number;
  stage: LearningStage;
  artifact_type: ArtifactType;
  artifact_version: number;
  content_hash: string;
  content: string;
  generated_code?: string;
  semantic_features: Record<string, unknown>;
  diagnostics: DiagnosticResult[];
  source_action: string;
}

export interface LearnerStateRecord {
  knowledge_component: string;
  state: LearnerStateName;
  success_count: number;
  error_count: number;
  independent_success_count: number;
  last_evidence_id?: string;
  last_task_id?: number;
  last_stage?: LearningStage;
  last_diagnosis?: string;
  evidence?: Array<Record<string, unknown>>;
}

export interface AgentContextPacket {
  task_and_stage: Record<string, unknown>;
  trigger: string;
  current_artifact: Record<string, unknown>;
  latest_run: Record<string, unknown> | null;
  diagnostics: DiagnosticResult[];
  learner_states: LearnerStateRecord[];
  previous_stage_summary: Record<string, unknown> | null;
  recent_attempts: Array<Record<string, unknown>>;
  p_evidence_summary: Record<string, unknown> | null;
  transfer_comparison: TransferComparison | null;
  stage_summary: LearningSummaryRecord | null;
  task_profile: LearningSummaryRecord | null;
  course_profile: LearningSummaryRecord | null;
  support_strategy: SupportStrategy;
  i_dialogue_state: IDialogueState | null;
}

export type LearningSummaryScope = "stage" | "task" | "course";

export interface StudentLearningAdvice {
  achieved: string;
  focus: string;
  action: string;
  evidence_version: number;
}

export interface LearningSummaryContent {
  sentences: string[];
  strengths: string[];
  difficulties: string[];
  support_use: string;
  revision_response: string;
  next_support: string;
  knowledge_components: string[];
  student_advice?: StudentLearningAdvice;
}

export interface LearningSummaryRecord {
  summary_id: string;
  scope: LearningSummaryScope;
  task_id?: number;
  stage?: LearningStage;
  version: number;
  evidence_hash: string;
  evidence_ids: string[];
  content: LearningSummaryContent;
  is_stale: boolean;
  created_at: string;
}

export interface SupportStrategy {
  stage: LearningStage;
  primary_focus: string;
  secondary_focus?: string;
  interaction_mode: "explain" | "locate" | "coach" | "co_construct";
  support_level: 1 | 2 | 3;
  require_prediction: boolean;
  evidence_ids: string[];
}

export type IDialoguePhase = "review" | "explain" | "challenge" | "revise" | "reflect" | "summary";

export interface IDialogueState {
  phase: IDialoguePhase;
  focus: string[];
  discussed_topics: string[];
  resolved_topics: string[];
  student_decisions: string[];
  current_question?: string;
  current_question_key?: string;
  latest_run_evidence_id?: string;
  turn_count: number;
}

export interface AgentIntervention {
  intervention_id: string;
  diagnosis_code: string;
  support_level: 1 | 2 | 3;
  message: string;
  question?: string;
  block_id?: string;
  line?: number;
  evidence_ids: string[];
  artifact_version: number;
  anchor_label?: string;
}
