import { v4 as uuidv4 } from "uuid";
import pool from "../config/database";
import type { AgentIntervention, DiagnosticResult, LearningStage } from "./agentTypes";

export function supportLevelFor(diagnostics: DiagnosticResult[], previousCount: number): 1 | 2 | 3 {
  if (previousCount >= 2) return 3;
  if (previousCount >= 1 || diagnostics.some((item) => item.severity === "blocking")) return 2;
  return 1;
}

export function supportLevelForRunFeedback(
  stage: LearningStage,
  occurrence: number
): 1 | 2 | 3 {
  if (stage === "A") {
    if (occurrence >= 4) return 3;
    if (occurrence >= 3) return 2;
    return 1;
  }
  if (stage === "C") return occurrence >= 3 ? 3 : 2;
  return occurrence >= 3 ? 3 : 2;
}

function anchorLabel(diagnostic?: DiagnosticResult) {
  if (!diagnostic) return undefined;
  const labels: Record<string, string> = {
    blocks_to_python_syntax_transfer: "检查 Python 语法",
    transfer_wrong_nesting: "检查缩进和嵌套",
    transfer_wrong_order: "检查语句顺序",
    invalid_structure: "检查积木连接",
    syntax_error: "检查语法",
    python_syntax_error: "检查括号、引号或缩进",
    runtime_error: "检查运行错误",
    target_mismatch: "检查任务目标",
    logic_target_mismatch: "检查程序与任务目标",
  };
  const reason = labels[diagnostic.code]
    || (diagnostic.code.startsWith("block_") ? "检查积木连接或输入" : "检查这里");
  return diagnostic.line ? `检查第${diagnostic.line}行：${reason}` : reason;
}

export async function interventionExistsForArtifact(args: {
  userId: string;
  taskId: number;
  stage: LearningStage;
  trigger: string;
  diagnosisCode: string;
  artifactVersion: number;
}) {
  const [rows] = await pool.query<any[]>(
    `SELECT id FROM agent_interventions
     WHERE user_id = ? AND task_id = ? AND stage = ? AND trigger_type = ?
       AND diagnosis_code = ? AND artifact_version = ? LIMIT 1`,
    [args.userId, args.taskId, args.stage, args.trigger, args.diagnosisCode, args.artifactVersion]
  );
  return rows.length > 0;
}

export async function countAttemptDiagnosisOccurrences(
  userId: string,
  taskId: number,
  stage: LearningStage,
  diagnosisCode: string
) {
  const [rows] = await pool.query<any[]>(
    `SELECT diagnostics FROM artifact_snapshots
     WHERE user_id = ? AND task_id = ? AND stage = ?
       AND source_action IN ('a_submit','c_run','i_run')
     ORDER BY id DESC LIMIT 30`,
    [userId, taskId, stage]
  );
  let count = 0;
  for (const row of rows) {
    let diagnostics: any[] = [];
    try {
      diagnostics = typeof row.diagnostics === "string"
        ? JSON.parse(row.diagnostics || "[]")
        : row.diagnostics || [];
    } catch {
      diagnostics = [];
    }
    const sameUnresolved = diagnostics.some(
      (item: any) => item.code === diagnosisCode && !item.resolved
    );
    if (!sameUnresolved) break;
    count += 1;
  }
  return count;
}

export async function countRecentDiagnosis(
  userId: string,
  taskId: number,
  stage: LearningStage,
  diagnosisCode: string
) {
  const [rows] = await pool.query<any[]>(
    `SELECT COUNT(DISTINCT artifact_version) AS count FROM agent_interventions
     WHERE user_id = ? AND task_id = ? AND stage = ? AND diagnosis_code = ?
       AND artifact_version > 0
       AND trigger_type IN ('run_feedback', 'inactivity')
       AND created_at >= DATE_SUB(NOW(), INTERVAL 30 MINUTE)`,
    [userId, taskId, stage, diagnosisCode]
  );
  return Number(rows[0]?.count || 0);
}

export async function recentSupportLevel(
  userId: string,
  taskId: number,
  stage: LearningStage
) {
  const [rows] = await pool.query<any[]>(
    `SELECT support_level FROM agent_interventions
     WHERE user_id = ? AND task_id = ? AND stage = ?
       AND created_at >= DATE_SUB(NOW(), INTERVAL 30 MINUTE)
     ORDER BY id DESC LIMIT 1`,
    [userId, taskId, stage]
  );
  return Number(rows[0]?.support_level || 0);
}

export async function createInterventionRecord(args: {
  userId: string;
  sessionId: string;
  taskId: number;
  stage: LearningStage;
  trigger: string;
  diagnostic?: DiagnosticResult;
  supportLevel: 1 | 2 | 3;
  artifactVersion: number;
  promptVersion: string;
}): Promise<AgentIntervention> {
  const diagnostic = args.diagnostic;
  const intervention: AgentIntervention = {
    intervention_id: uuidv4(),
    diagnosis_code: diagnostic?.code || "general_guidance",
    support_level: args.supportLevel,
    message: "",
    evidence_ids: diagnostic?.evidence_ids || [],
    artifact_version: args.artifactVersion,
    block_id: diagnostic?.block_id,
    line: diagnostic?.line,
    anchor_label: anchorLabel(diagnostic),
  };
  await pool.query(
    `INSERT INTO agent_interventions
      (intervention_id, user_id, session_id, task_id, stage, trigger_type,
       diagnosis_code, support_level, artifact_version, evidence_json,
       block_id, code_line, prompt_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      intervention.intervention_id,
      args.userId,
      args.sessionId,
      args.taskId,
      args.stage,
      args.trigger,
      intervention.diagnosis_code,
      args.supportLevel,
      args.artifactVersion,
      JSON.stringify({
        evidence_ids: intervention.evidence_ids,
        knowledge_components: diagnostic?.knowledge_components || [],
      }),
      intervention.block_id || null,
      intervention.line || null,
      args.promptVersion,
    ]
  );
  return intervention;
}

export async function completeIntervention(
  interventionId: string,
  message: string,
  question?: string
) {
  await pool.query(
    `UPDATE agent_interventions SET message = ?, question = ? WHERE intervention_id = ?`,
    [message, question || null, interventionId]
  );
}

export async function evaluatePendingInterventions(args: {
  userId: string;
  taskId: number;
  stage: LearningStage;
  artifactVersion: number;
  diagnostics: DiagnosticResult[];
}) {
  const [rows] = await pool.query<any[]>(
    `SELECT * FROM agent_interventions
     WHERE user_id = ? AND task_id = ? AND stage = ? AND outcome = 'pending'
       AND artifact_version < ? ORDER BY id`,
    [args.userId, args.taskId, args.stage, args.artifactVersion]
  );
  for (const row of rows) {
    if (row.diagnosis_code === "general_guidance") continue;
    const evidence = typeof row.evidence_json === "string"
      ? JSON.parse(row.evidence_json || "{}")
      : row.evidence_json || {};
    const priorComponents = new Set<string>(evidence.knowledge_components || []);
    const stillPresent = args.diagnostics.some((item) => item.code === row.diagnosis_code && !item.resolved);
    const unresolvedRelated = args.diagnostics.some(
      (item) => !item.resolved && item.knowledge_components.some((component) => priorComponents.has(component))
    );
    const resolvedRelated = args.diagnostics.some(
      (item) => item.resolved && item.knowledge_components.some((component) => priorComponents.has(component))
    );
    if (!stillPresent && resolvedRelated && !unresolvedRelated) {
      evidence.outcome_reason = "diagnosis_resolved_after_related_change";
      await pool.query(
        "UPDATE agent_interventions SET outcome = 'adopted', evidence_json = ?, resolved_at = NOW(3) WHERE id = ?",
        [JSON.stringify(evidence), row.id]
      );
      continue;
    }
    const edits = Number(row.followup_edits || 0) + 1;
    const relatedEdit = stillPresent || unresolvedRelated || resolvedRelated;
    evidence.related_edits = Number(evidence.related_edits || 0) + (relatedEdit ? 1 : 0);
    evidence.unrelated_edits = Number(evidence.unrelated_edits || 0) + (relatedEdit ? 0 : 1);
    evidence.last_artifact_version = args.artifactVersion;
    if (Number(evidence.unrelated_edits) >= 3 && Number(evidence.related_edits) === 0) {
      evidence.outcome_reason = "three_unrelated_semantic_changes";
      await pool.query(
        `UPDATE agent_interventions SET outcome = 'ignored', followup_edits = ?, evidence_json = ?, resolved_at = NOW(3)
         WHERE id = ?`,
        [edits, JSON.stringify(evidence), row.id]
      );
    } else {
      await pool.query(
        "UPDATE agent_interventions SET followup_edits = ?, evidence_json = ? WHERE id = ?",
        [edits, JSON.stringify(evidence), row.id]
      );
    }
  }
}

export async function closeStageInterventions(userId: string, taskId: number, stage: LearningStage) {
  await pool.query(
    `UPDATE agent_interventions
     SET outcome = IF(
       COALESCE(JSON_EXTRACT(evidence_json, '$.related_edits'), 0) > 0,
       'partially_adopted',
       'not_observed'
     ), resolved_at = NOW(3)
     WHERE user_id = ? AND task_id = ? AND stage = ? AND outcome = 'pending'`,
    [userId, taskId, stage]
  );
}
