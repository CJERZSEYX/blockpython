import { Router, Request, Response } from "express";
import pool from "../config/database";
import { generatePythonFromBlockly } from "../services/blocklyPython";
import {
  resolveExpectedOutput,
  runPython,
  stageTargetMet,
  type PythonRunResult,
  type TargetConfig,
} from "../services/pythonRunner";
import { PROMPT_VERSION } from "../tasks/curriculum";
import { v4 as uuidv4 } from "uuid";
import { saveArtifactSnapshot } from "../services/artifactEvidence";
import { diagnoseAttempt } from "../services/diagnosticEngine";
import { applyDiagnosticsToLearnerModel } from "../services/learnerModel";
import { countAttemptDiagnosisOccurrences, evaluatePendingInterventions, recentSupportLevel } from "../services/interventionPolicy";
import type { DiagnosticResult } from "../services/agentTypes";
import { idempotentRequest } from "../middleware/idempotentRequest";
import { canAccessStage, markStageCompleted } from "../services/studentTaskState";
import { queueLearningProfileRefresh } from "../services/learningProfiles";
import { recordIDialogueRun } from "../services/iDialogueState";

export const submitRouter = Router();

type ExecuteStage = "A" | "C" | "I";

interface TaskContent {
  toolbox?: string[];
  a_stage?: { target?: TargetConfig };
  c_stage?: { target?: TargetConfig };
  i_stage?: {
    target?: TargetConfig;
    visualization_override?: Record<string, unknown>;
  };
  visualization?: Record<string, unknown>;
}

interface BehaviorCaseResult {
  input: string;
  status: PythonRunResult["status"];
  target_met: boolean;
}

function withBlockIds(
  result: PythonRunResult,
  lineBlockMap: Record<number, string>
): PythonRunResult & { events: Array<PythonRunResult["events"][number] & { block_id?: string }> } {
  return {
    ...result,
    events: result.events.map((event) => ({
      ...event,
      block_id: event.line ? lineBlockMap[event.line] : undefined,
    })),
  };
}

async function logAttempt(
  session: any,
  taskId: number,
  stage: ExecuteStage,
  actionType: string,
  detail: Record<string, unknown>
) {
  const eventId = uuidv4();
  await pool.query(
    `INSERT INTO user_actions
      (event_id, user_id, session_id, task_id, stage, action_type, action_detail, prompt_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      eventId,
      session.user_id,
      session.session_id,
      taskId,
      stage,
      actionType,
      JSON.stringify(detail),
      PROMPT_VERSION,
    ]
  );
  return eventId;
}

async function attachAttemptEvidence(eventId: string, evidence: Record<string, unknown>) {
  const [rows] = await pool.query<any[]>("SELECT action_detail FROM user_actions WHERE event_id = ? LIMIT 1", [eventId]);
  if (rows.length === 0) return;
  const detail = typeof rows[0].action_detail === "string"
    ? JSON.parse(rows[0].action_detail || "{}")
    : rows[0].action_detail || {};
  await pool.query(
    "UPDATE user_actions SET action_detail = ? WHERE event_id = ?",
    [JSON.stringify({ ...detail, ...evidence }), eventId]
  );
}

async function processAttemptEvidence(args: {
  session: any;
  taskId: number;
  stage: ExecuteStage;
  actionType: string;
  status: string;
  code: string;
  blocklyXml?: string;
  generatedCode?: string;
  blockTypes?: string[];
  blockDiagnostics?: Array<{ code: string; block_id?: string }>;
  errorLine?: number | null;
  stderr?: string;
}) {
  try {
    const content = args.stage === "A" ? String(args.blocklyXml || "") : args.code;
    const artifactType = args.stage === "A" ? "blockly" as const : "python" as const;
    const snapshotResult = await saveArtifactSnapshot({
      userId: args.session.user_id,
      sessionId: args.session.session_id,
      taskId: args.taskId,
      stage: args.stage,
      artifactType,
      content,
      sourceAction: args.actionType,
      generatedCode: args.generatedCode,
      forceOccurrence: true,
    });
    const learningDiagnostics = await diagnoseAttempt({
      userId: args.session.user_id,
      taskId: args.taskId,
      stage: args.stage,
      status: args.status,
      evidenceId: snapshotResult.snapshot.snapshot_id,
      code: args.code,
      blockTypes: args.blockTypes,
      blockDiagnostics: args.blockDiagnostics,
      errorLine: args.errorLine,
      stderr: args.stderr,
    });
    await pool.query(
      "UPDATE artifact_snapshots SET diagnostics = ? WHERE snapshot_id = ?",
      [JSON.stringify(learningDiagnostics), snapshotResult.snapshot.snapshot_id]
    );
    const supportLevel = await recentSupportLevel(args.session.user_id, args.taskId, args.stage);
    await applyDiagnosticsToLearnerModel({
      userId: args.session.user_id,
      taskId: args.taskId,
      stage: args.stage,
      diagnostics: learningDiagnostics,
      supportLevel,
    });
    await evaluatePendingInterventions({
      userId: args.session.user_id,
      taskId: args.taskId,
      stage: args.stage,
      artifactVersion: snapshotResult.snapshot.artifact_version,
      diagnostics: learningDiagnostics,
    });
    return {
      artifact_version: snapshotResult.snapshot.artifact_version,
      artifact_snapshot_id: snapshotResult.snapshot.snapshot_id,
      artifact_hash: snapshotResult.snapshot.content_hash,
      learning_diagnostics: learningDiagnostics,
      primary_diagnosis: learningDiagnostics.find((item) => !item.resolved)?.code,
    };
  } catch (error) {
    console.error("Learning evidence processing failed:", error);
    return {
      artifact_version: 0,
      artifact_snapshot_id: "",
      artifact_hash: "",
      learning_diagnostics: [] as DiagnosticResult[],
      primary_diagnosis: undefined as string | undefined,
    };
  }
}

submitRouter.post(
  "/execute",
  idempotentRequest("execute", (req) => req.body?.operation_id),
  async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const {
      task_id,
      stage,
      code: submittedCode,
      blockly_xml,
      input = "",
      attempt = 1,
      activity_summary,
      operation_id,
      artifact_hash,
      artifact_version,
    } = req.body as {
      task_id: number;
      stage: ExecuteStage;
      code?: string;
      blockly_xml?: string;
      input?: string;
      attempt?: number;
      activity_summary?: Record<string, number>;
      operation_id?: string;
      artifact_hash?: string;
      artifact_version?: number;
    };

    if (!task_id || !["A", "C", "I"].includes(stage)) {
      res.status(400).json({ error: "任务和阶段参数不正确" });
      return;
    }

    if (session.role === "student" && !(await canAccessStage(session.user_id, task_id, stage))) {
      res.status(403).json({ error: "请先完成前一个学习阶段" });
      return;
    }

    const [rows] = await pool.query<any[]>(
      "SELECT content_json FROM tasks WHERE id = ?",
      [task_id]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: "任务不存在" });
      return;
    }

    const content = rows[0].content_json as TaskContent;
    let code = String(submittedCode || "");
    let lineBlockMap: Record<number, string> = {};
    let diagnostics: ReturnType<typeof generatePythonFromBlockly>["diagnostics"] = [];
    let blockTypes: string[] = [];

    if (stage === "A") {
      const generated = generatePythonFromBlockly(String(blockly_xml || ""));
      diagnostics = [...generated.diagnostics];
      blockTypes = generated.block_types;
      lineBlockMap = generated.line_block_map;
      code = generated.code;

      const allowed = new Set(content.toolbox || []);
      for (const type of generated.block_types) {
        if (!allowed.has(type)) {
          diagnostics.push({
            code: "unsupported_block",
            message: `本任务不需要积木 ${type}`,
          });
        }
      }

      if (!generated.valid || diagnostics.length > 0) {
        const response = {
          status: "invalid_structure" as const,
          started: false,
          code,
          generated_code: code,
          line_block_map: lineBlockMap,
          diagnostics,
          stdout: "",
          stderr: "",
          line: null,
          events: [],
          expected_output: "",
        };
        const eventId = await logAttempt(session, task_id, stage, "a_submit", {
          attempt,
          blockly_xml,
          generated_code: code,
          line_block_map: lineBlockMap,
          diagnostics,
          activity_summary,
          result: response.status, operation_id, requested_artifact_hash: artifact_hash, requested_artifact_version: artifact_version,
        });
        const evidence = await processAttemptEvidence({
          session, taskId: task_id, stage, actionType: "a_submit",
          status: response.status, code, blocklyXml: String(blockly_xml || ""),
          generatedCode: code, blockTypes, blockDiagnostics: diagnostics,
        });
        const occurrence = evidence.primary_diagnosis
          ? await countAttemptDiagnosisOccurrences(session.user_id, task_id, stage, evidence.primary_diagnosis)
          : 0;
        const interventionRecommended = occurrence >= 2;
        await attachAttemptEvidence(eventId, {
          artifact_hash: evidence.artifact_hash,
          artifact_snapshot_id: evidence.artifact_snapshot_id,
          artifact_version: evidence.artifact_version,
          diagnosis_occurrence: occurrence,
        });
        queueLearningProfileRefresh(session.user_id, task_id, stage);
        res.json({ ...response, ...evidence, diagnosis_occurrence: occurrence, agent_intervention_recommended: interventionRecommended });
        return;
      }
    }

    if (!code.trim()) {
      const response = {
        status: stage === "A" ? "invalid_structure" : "syntax_error",
        started: false,
        code,
        generated_code: stage === "A" ? code : undefined,
        line_block_map: lineBlockMap,
        diagnostics: stage === "A"
          ? [{ code: "empty_workspace", message: "还没有可执行积木" }]
          : [],
        stdout: "",
        stderr: "代码不能为空",
        line: 1,
        events: [],
        expected_output: "",
      } as const;
      const actionType = stage === "A" ? "a_submit" : `${stage.toLowerCase()}_run`;
      const eventId = await logAttempt(
        session,
        task_id,
        stage,
        actionType,
        {
          attempt,
          input,
          blockly_xml: stage === "A" ? blockly_xml : undefined,
          code: stage !== "A" ? code : undefined,
          diagnostics: response.diagnostics,
          result: response.status,
          stderr: response.stderr,
          error_line: response.line,
          events: [], operation_id, requested_artifact_hash: artifact_hash, requested_artifact_version: artifact_version,
        }
      );
      const evidence = await processAttemptEvidence({
        session, taskId: task_id, stage, actionType,
        status: response.status, code,
        blocklyXml: stage === "A" ? String(blockly_xml || "") : undefined,
        generatedCode: stage === "A" ? code : undefined,
        blockTypes,
        blockDiagnostics: response.diagnostics,
        errorLine: response.line,
        stderr: response.stderr,
      });
      const occurrence = evidence.primary_diagnosis
        ? await countAttemptDiagnosisOccurrences(session.user_id, task_id, stage, evidence.primary_diagnosis)
        : 0;
      await attachAttemptEvidence(eventId, {
        artifact_hash: evidence.artifact_hash,
        artifact_snapshot_id: evidence.artifact_snapshot_id,
        artifact_version: evidence.artifact_version,
        diagnosis_occurrence: occurrence,
      });
      if (stage === "I") await recordIDialogueRun(session.user_id, task_id, eventId);
      queueLearningProfileRefresh(session.user_id, task_id, stage);
      res.json({ ...response, ...evidence, diagnosis_occurrence: occurrence, agent_intervention_recommended: occurrence >= 2 });
      return;
    }

    const visualization = stage === "I"
      ? content.i_stage?.visualization_override || content.visualization || {}
      : content.visualization || {};
    const rawRun = await runPython(code, String(input), 5000, visualization);
    const target = stage === "A"
      ? content.a_stage?.target
      : stage === "C"
        ? content.c_stage?.target
        : content.i_stage?.target;
    const expectedOutput = target && target.mode !== "stage"
      ? resolveExpectedOutput(target, String(input))
      : "";
    let status = rawRun.status;
    let behaviorCases: BehaviorCaseResult[] | undefined;
    if (status === "target_met" && target) {
      let matched = target.mode === "stage"
        ? stageTargetMet(
          target,
          String(input),
          rawRun.stage_state,
          rawRun.variables,
          rawRun.ast_features,
          rawRun.stdout
        )
        : rawRun.stdout === expectedOutput;

      const caseInputs = stage !== "I" && target.mode === "stage" && target.state_cases
        ? Object.keys(target.state_cases)
        : [];
      if (matched && caseInputs.length > 1) {
        const currentInput = String(input).split(/\r?\n/)[0] || "";
        behaviorCases = [];
        for (const caseInput of caseInputs) {
          const caseRun = caseInput === currentInput
            ? rawRun
            : await runPython(code, caseInput, 5000, visualization);
          const caseMet = caseRun.status === "target_met" && stageTargetMet(
            target,
            caseInput,
            caseRun.stage_state,
            caseRun.variables,
            caseRun.ast_features,
            caseRun.stdout
          );
          behaviorCases.push({ input: caseInput, status: caseRun.status, target_met: caseMet });
        }
        matched = behaviorCases.every((item) => item.target_met);
      }
      if (!matched) status = "target_mismatch";
    }

    const run = withBlockIds({ ...rawRun, status }, lineBlockMap);
    const response = {
      ...run,
      code,
      generated_code: stage === "A" ? code : undefined,
      line_block_map: lineBlockMap,
      diagnostics,
      expected_output: expectedOutput,
      behavior_coverage: behaviorCases
        ? {
          tested: behaviorCases.length,
          passed: behaviorCases.filter((item) => item.target_met).length,
          all_passed: behaviorCases.every((item) => item.target_met),
        }
        : undefined,
    };

    const actionType = stage === "A" ? "a_submit" : `${stage.toLowerCase()}_run`;
    const eventId = await logAttempt(session, task_id, stage, actionType, {
      attempt,
      input,
      blockly_xml: stage === "A" ? blockly_xml : undefined,
      generated_code: stage === "A" ? code : undefined,
      code: stage !== "A" ? code : undefined,
      line_block_map: lineBlockMap,
      diagnostics,
      activity_summary: stage === "A" ? activity_summary : undefined,
      result: status,
      stdout: run.stdout,
      stderr: run.stderr,
      error_line: run.line,
      events: run.events,
      ast_features: run.ast_features,
      behavior_cases: behaviorCases,
      operation_id,
      requested_artifact_hash: artifact_hash,
      requested_artifact_version: artifact_version,
    });
    const evidence = await processAttemptEvidence({
      session, taskId: task_id, stage, actionType, status,
      code, blocklyXml: stage === "A" ? String(blockly_xml || "") : undefined,
      generatedCode: stage === "A" ? code : undefined,
      blockTypes, blockDiagnostics: diagnostics,
      errorLine: run.line, stderr: run.stderr,
    });
    const occurrence = evidence.primary_diagnosis
      ? await countAttemptDiagnosisOccurrences(session.user_id, task_id, stage, evidence.primary_diagnosis)
      : 0;
    await attachAttemptEvidence(eventId, {
      artifact_hash: evidence.artifact_hash,
      artifact_snapshot_id: evidence.artifact_snapshot_id,
      artifact_version: evidence.artifact_version,
      diagnosis_occurrence: occurrence,
    });
    const learningState = status === "target_met" && session.role === "student" && (stage === "A" || stage === "C")
      ? await markStageCompleted(session.user_id, task_id, stage, evidence.artifact_snapshot_id)
      : undefined;
    if (stage === "I") await recordIDialogueRun(session.user_id, task_id, eventId);
    queueLearningProfileRefresh(session.user_id, task_id, stage);

    res.json({
      ...response,
      ...evidence,
      diagnosis_occurrence: occurrence,
      agent_intervention_recommended: status === "target_met" || occurrence >= 2,
      learning_state: learningState,
    });
  } catch (error) {
    console.error("Execute error:", error);
    res.status(500).json({ error: "运行请求处理失败" });
  }
});
