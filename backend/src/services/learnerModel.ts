import pool from "../config/database";
import type { DiagnosticResult, LearnerStateName, LearnerStateRecord, LearningStage } from "./agentTypes";

interface ApplyEvidenceInput {
  userId: string;
  taskId: number;
  stage: LearningStage;
  diagnostics: DiagnosticResult[];
  supportLevel?: number;
}

function parseEvidence(value: unknown): Array<Record<string, unknown>> {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try { return JSON.parse(String(value)); } catch { return []; }
}

function nextState(args: {
  current: LearnerStateName;
  successContexts: number;
  errorCount: number;
  isSuccess: boolean;
  diagnosisCode: string;
  recentSameErrors: number;
}): LearnerStateName {
  if (args.isSuccess) {
    if (args.successContexts >= 2) return "stable";
    return "emerging";
  }
  if (args.diagnosisCode.includes("transfer") || args.recentSameErrors >= 2) {
    return "needs_support";
  }
  return args.current === "stable" ? "stable" : args.current;
}

export async function applyDiagnosticsToLearnerModel(input: ApplyEvidenceInput) {
  const grouped = new Map<string, DiagnosticResult[]>();
  for (const diagnostic of input.diagnostics) {
    for (const component of diagnostic.knowledge_components) {
      grouped.set(component, [...(grouped.get(component) || []), diagnostic]);
    }
  }

  for (const [component, componentDiagnostics] of grouped) {
    const evidenceId = componentDiagnostics[0]?.evidence_ids[0] || "";
    const [rows] = await pool.query<any[]>(
      "SELECT * FROM learner_states WHERE user_id = ? AND knowledge_component = ? LIMIT 1",
      [input.userId, component]
    );
    const row = rows[0];
    const evidence = parseEvidence(row?.evidence_json);
    if (evidence.some((item) => item.evidence_id === evidenceId && item.component === component)) {
      continue;
    }

    const isSuccess = componentDiagnostics.every((item) => item.resolved);
    const independent = isSuccess && Number(input.supportLevel || 0) <= 1;
    evidence.push({
      evidence_id: evidenceId,
      component,
      task_id: input.taskId,
      stage: input.stage,
      diagnosis: componentDiagnostics[0]?.code,
      resolved: isSuccess,
      independent,
      timestamp: new Date().toISOString(),
    });
    const compactEvidence = evidence.slice(-30);
    const diagnosisCode = componentDiagnostics[0]?.code || "";
    const recentSameErrors = compactEvidence.slice(-2).filter(
      (item) => !item.resolved && item.diagnosis === diagnosisCode
    ).length;
    const successContexts = new Set(
      compactEvidence
        .filter((item) => item.resolved && item.independent)
        .map((item) => `${item.task_id}:${item.stage}`)
    ).size;
    const successCount = Number(row?.success_count || 0) + (isSuccess ? 1 : 0);
    const errorCount = Number(row?.error_count || 0) + (isSuccess ? 0 : 1);
    const independentSuccessCount = Number(row?.independent_success_count || 0) + (independent ? 1 : 0);
    const state = nextState({
      current: (row?.state || "not_observed") as LearnerStateName,
      successContexts,
      errorCount,
      isSuccess,
      diagnosisCode,
      recentSameErrors,
    });

    await pool.query(
      `INSERT INTO learner_states
        (user_id, knowledge_component, state, success_count, error_count,
         independent_success_count, last_evidence_id, last_task_id, last_stage,
         last_diagnosis, evidence_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         state = VALUES(state), success_count = VALUES(success_count),
         error_count = VALUES(error_count),
         independent_success_count = VALUES(independent_success_count),
         last_evidence_id = VALUES(last_evidence_id), last_task_id = VALUES(last_task_id),
         last_stage = VALUES(last_stage), last_diagnosis = VALUES(last_diagnosis),
         evidence_json = VALUES(evidence_json)`,
      [
        input.userId,
        component,
        state,
        successCount,
        errorCount,
        independentSuccessCount,
        evidenceId || null,
        input.taskId,
        input.stage,
        componentDiagnostics[0]?.code || null,
        JSON.stringify(compactEvidence),
      ]
    );
  }
}

export async function getLearnerStates(userId: string): Promise<LearnerStateRecord[]> {
  const [rows] = await pool.query<any[]>(
    `SELECT knowledge_component, state, success_count, error_count,
            independent_success_count, last_evidence_id, last_task_id,
            last_stage, last_diagnosis, evidence_json
     FROM learner_states WHERE user_id = ? ORDER BY knowledge_component`,
    [userId]
  );
  return rows.map((row) => ({
    knowledge_component: row.knowledge_component,
    state: row.state,
    success_count: Number(row.success_count),
    error_count: Number(row.error_count),
    independent_success_count: Number(row.independent_success_count),
    last_evidence_id: row.last_evidence_id || undefined,
    last_task_id: row.last_task_id == null ? undefined : Number(row.last_task_id),
    last_stage: row.last_stage || undefined,
    last_diagnosis: row.last_diagnosis || undefined,
    evidence: parseEvidence(row.evidence_json),
  }));
}
