import pool from "../config/database";
import { saveArtifactSnapshot } from "./artifactEvidence";
import { diagnoseAttempt } from "./diagnosticEngine";
import { applyDiagnosticsToLearnerModel } from "./learnerModel";
import { closeStageInterventions, evaluatePendingInterventions } from "./interventionPolicy";
import { generatePythonFromBlockly } from "./blocklyPython";
import type { LearningStage } from "./agentTypes";
import { analyzePythonStructure, buildTransferComparison } from "./transferAnalysis";
import { queueLearningProfileRefresh } from "./learningProfiles";

interface TrackedAction {
  action_type: string;
  task_id?: number;
  stage?: LearningStage;
  action_detail?: Record<string, unknown>;
}

export async function processTrackedLearningAction(
  session: { user_id: string; session_id: string },
  action: TrackedAction
) {
  if (!action.task_id || !action.stage) return;

  if (action.action_type === "stage_exit") {
    await closeStageInterventions(session.user_id, action.task_id, action.stage);
    queueLearningProfileRefresh(session.user_id, action.task_id, action.stage);
    return;
  }

  const detail = action.action_detail || {};
  const isBlockly = action.action_type === "a_workspace_snapshot";
  const isPython = action.action_type === "c_code_snapshot" || action.action_type === "i_code_snapshot";
  if (!isBlockly && !isPython) return;

  const content = String(isBlockly ? detail.blockly_xml || "" : detail.code || "");
  if (!content.trim()) return;
  const generated = isBlockly ? generatePythonFromBlockly(content) : null;
  const saved = await saveArtifactSnapshot({
    userId: session.user_id,
    sessionId: session.session_id,
    taskId: action.task_id,
    stage: action.stage,
    artifactType: isBlockly ? "blockly" : "python",
    content,
    generatedCode: generated?.code,
    sourceAction: action.action_type,
  });
  if (!saved.created) return;

  if (generated && generated.diagnostics.length > 0) {
    const diagnostics = await diagnoseAttempt({
      userId: session.user_id,
      taskId: action.task_id,
      stage: action.stage,
      status: "invalid_structure",
      evidenceId: saved.snapshot.snapshot_id,
      code: generated.code,
      blockTypes: generated.block_types,
      blockDiagnostics: generated.diagnostics,
    });
    await pool.query(
      "UPDATE artifact_snapshots SET diagnostics = ? WHERE snapshot_id = ?",
      [JSON.stringify(diagnostics), saved.snapshot.snapshot_id]
    );
    await applyDiagnosticsToLearnerModel({
      userId: session.user_id,
      taskId: action.task_id,
      stage: action.stage,
      diagnostics,
    });
    await evaluatePendingInterventions({
      userId: session.user_id,
      taskId: action.task_id,
      stage: action.stage,
      artifactVersion: saved.snapshot.artifact_version,
      diagnostics,
    });
    return;
  }

  if (isPython) {
    const transfer = action.stage === "C"
      ? await buildTransferComparison({
          userId: session.user_id,
          taskId: action.task_id,
          currentCode: content,
          evidenceId: saved.snapshot.snapshot_id,
        })
      : null;
    const parsed = transfer ? null : await analyzePythonStructure(content);
    const diagnostics = transfer?.diagnostics || (!parsed?.valid ? [{
      code: "syntax_error",
      knowledge_components: ["python_syntax"],
      severity: "blocking" as const,
      evidence_ids: [saved.snapshot.snapshot_id],
      line: parsed?.error?.line,
      resolved: false,
    }] : []);
    await pool.query(
      "UPDATE artifact_snapshots SET diagnostics = ?, semantic_features = ? WHERE snapshot_id = ?",
      [
        JSON.stringify(diagnostics),
        JSON.stringify({ ...saved.snapshot.semantic_features, transfer_comparison: transfer }),
        saved.snapshot.snapshot_id,
      ]
    );
    if (diagnostics.length === 0) return;
    await applyDiagnosticsToLearnerModel({
      userId: session.user_id,
      taskId: action.task_id,
      stage: action.stage,
      diagnostics,
    });
    await evaluatePendingInterventions({
      userId: session.user_id,
      taskId: action.task_id,
      stage: action.stage,
      artifactVersion: saved.snapshot.artifact_version,
      diagnostics,
    });
  }
}
