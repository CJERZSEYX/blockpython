import pool from "../config/database";
import { getLatestArtifact } from "./artifactEvidence";
import { getLearnerStates } from "./learnerModel";
import { componentsForTask } from "./knowledgeComponents";
import { defaultMismatchComponents, mismatchComponents } from "./diagnosticEngine";
import { buildTransferComparison } from "./transferAnalysis";
import type { AgentContextPacket, LearningStage } from "./agentTypes";
import { getLearningProfileBundle, selectSupportStrategy } from "./learningProfiles";
import { getIDialogueState, initializeIDialogueFocus } from "./iDialogueState";

function parseJson(value: unknown, fallback: any = {}) {
  if (value == null) return fallback;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

const previousStages: Record<LearningStage, LearningStage[]> = {
  P: [],
  A: ["P"],
  C: ["P", "A"],
  I: ["P", "A", "C"],
};

export async function buildAgentContextPacket(args: {
  userId: string;
  taskId: number;
  taskTitle: string;
  stage: LearningStage;
  trigger: string;
}): Promise<AgentContextPacket> {
  const artifact = await getLatestArtifact(args.userId, args.taskId, args.stage);
  if (artifact) {
    artifact.diagnostics = artifact.diagnostics.map((diagnostic) =>
      diagnostic.code === "logic_target_mismatch"
        ? {
            ...diagnostic,
            knowledge_components: mismatchComponents(
              args.taskId,
              artifact.generated_code || artifact.content
            ),
          }
        : diagnostic
    );
  }
  const taskComponents = new Set(componentsForTask(args.taskId));
  const learnerStates = (await getLearnerStates(args.userId))
    .filter((item) => taskComponents.has(item.knowledge_component as any))
    .filter((item) => {
      if (item.last_diagnosis !== "logic_target_mismatch" || !item.last_task_id) return true;
      return defaultMismatchComponents(item.last_task_id).includes(item.knowledge_component);
    });

  const [attemptRows] = await pool.query<any[]>(
    `SELECT event_id, task_id, stage, action_type, action_detail, timestamp
     FROM user_actions
     WHERE user_id = ? AND task_id = ?
       AND action_type IN ('a_submit','c_run','i_run')
     ORDER BY id DESC LIMIT 8`,
    [args.userId, args.taskId]
  );
  const recentAttempts = attemptRows.map((row) => {
    const detail = parseJson(row.action_detail);
    return {
      evidence_id: row.event_id,
      task_id: Number(row.task_id),
      stage: row.stage,
      action_type: row.action_type,
      result: detail.result,
      error_line: detail.error_line,
      diagnostics: detail.diagnostics,
      timestamp: row.timestamp,
    };
  });

  const [runRows] = await pool.query<any[]>(
    `SELECT event_id, action_detail, timestamp FROM user_actions
     WHERE user_id = ? AND task_id = ? AND stage = ?
       AND action_type IN ('a_submit','c_run','i_run')
     ORDER BY id DESC LIMIT 1`,
    [args.userId, args.taskId, args.stage]
  );
  const latestRunDetail = runRows.length ? parseJson(runRows[0].action_detail) : null;
  const runMatchesArtifact = Boolean(
    artifact
    && latestRunDetail?.artifact_hash
    && latestRunDetail.artifact_hash === artifact.content_hash
  );
  const latestRun = runRows.length
    ? runMatchesArtifact
      ? {
          evidence_id: runRows[0].event_id,
          ...latestRunDetail,
          matches_current_artifact: true,
          timestamp: runRows[0].timestamp,
        }
      : {
          evidence_id: runRows[0].event_id,
          matches_current_artifact: false,
          timestamp: runRows[0].timestamp,
        }
    : null;

  const [pRows] = await pool.query<any[]>(
    `SELECT action_type, action_detail, timestamp
     FROM user_actions
     WHERE user_id = ? AND task_id = ? AND stage = 'P'
       AND action_type IN ('subtask_click','block_click')
     ORDER BY id`,
    [args.userId, args.taskId]
  );
  const [taskRows] = await pool.query<any[]>("SELECT content_json FROM tasks WHERE id = ? LIMIT 1", [args.taskId]);
  const pSubtasks = Array.isArray(taskRows[0]?.content_json?.p_stage?.subtasks)
    ? taskRows[0].content_json.p_stage.subtasks
    : [];
  const viewedStepIds = new Set<number>();
  const viewedBlockIds = new Set<string>();
  for (const row of pRows) {
    const detail = parseJson(row.action_detail);
    if (row.action_type === "subtask_click" && Number(detail.subtask_id)) viewedStepIds.add(Number(detail.subtask_id));
    if (row.action_type === "block_click" && detail.block_id) viewedBlockIds.add(String(detail.block_id));
  }
  const viewedComponents = new Set<string>();
  for (const subtask of pSubtasks) {
    const viewedStep = viewedStepIds.has(Number(subtask.id));
    const viewedBlock = Array.isArray(subtask.blocks)
      && subtask.blocks.some((block: any) => viewedBlockIds.has(String(block.block_id)));
    if (viewedStep || viewedBlock) {
      for (const component of Array.isArray(subtask.concepts) ? subtask.concepts : []) {
        viewedComponents.add(String(component));
      }
    }
  }
  const pEvidenceSummary = pRows.length > 0 ? {
    viewed_step_ids: [...viewedStepIds],
    viewed_block_ids: [...viewedBlockIds],
    viewed_components: [...viewedComponents],
    unviewed_step_ids: pSubtasks.map((item: any) => Number(item.id)).filter((id: number) => !viewedStepIds.has(id)),
    evidence_kind: "exposure_only",
  } : null;

  const transferComparison = args.stage === "C" && artifact?.content.trim()
    ? await buildTransferComparison({
        userId: args.userId,
        taskId: args.taskId,
        currentCode: artifact.content,
        evidenceId: artifact.snapshot_id,
      })
    : null;
  const combinedDiagnostics = [
    ...(artifact?.diagnostics || []),
    ...((transferComparison?.diagnostics as any[]) || []),
  ].filter((item, index, all) => all.findIndex((candidate) => candidate.code === item.code && candidate.line === item.line) === index);

  const profiles = await getLearningProfileBundle(args.userId, args.taskId, args.stage);
  const supportStrategy = selectSupportStrategy({
    stage: args.stage,
    diagnostics: combinedDiagnostics,
    learnerStates,
    taskProfile: profiles.task_profile,
    courseProfile: profiles.course_profile,
  });
  const iDialogueState = args.stage === "I"
    ? await initializeIDialogueFocus(args.userId, args.taskId, [
        supportStrategy.primary_focus,
        supportStrategy.secondary_focus || "",
      ].filter(Boolean))
    : null;

  const stages = previousStages[args.stage];
  let previousStageSummary: Record<string, unknown> | null = null;
  if (stages.length > 0) {
    const [rows] = await pool.query<any[]>(
      `SELECT stage, action_type, COUNT(*) AS count,
              MAX(timestamp) AS last_timestamp
       FROM user_actions
       WHERE user_id = ? AND task_id = ? AND stage IN (?)
         AND action_type IN ('subtask_click','block_click','a_submit','c_run','a_hint_request','c_hint_request')
       GROUP BY stage, action_type`,
      [args.userId, args.taskId, stages]
    );
    const latestRelevantAttempt = recentAttempts
      .filter((attempt) => stages.includes(attempt.stage as LearningStage))
      .at(0) || null;
    let compactStageSummaries: Array<Record<string, unknown>> = [];
    if (args.stage === "I") {
      const [summaryRows] = await pool.query<any[]>(
        `SELECT stage, summary_json, version FROM learning_summaries
         WHERE user_id=? AND task_id=? AND scope='stage' AND stage IN ('P','A','C') AND is_stale=0
         ORDER BY FIELD(stage,'P','A','C'), version DESC`,
        [args.userId, args.taskId]
      );
      const seen = new Set<string>();
      compactStageSummaries = summaryRows.filter((row) => {
        if (seen.has(row.stage)) return false;
        seen.add(row.stage);
        return true;
      }).map((row) => {
        const content = parseJson(row.summary_json, {});
        return {
          stage: row.stage,
          summary: Array.isArray(content.sentences) ? content.sentences.slice(0, 2) : [],
          difficulties: Array.isArray(content.difficulties) ? content.difficulties.slice(0, 1) : [],
        };
      });
    }
    previousStageSummary = {
      stages,
      evidence: args.stage === "I" ? [] : rows.map((row) => ({
        stage: row.stage,
        action_type: row.action_type,
        count: Number(row.count),
        last_timestamp: row.last_timestamp,
      })),
      stage_summaries: compactStageSummaries,
      latest_relevant_attempt: latestRelevantAttempt,
      attempts: args.stage === "I" ? [] : recentAttempts
        .filter((attempt) => stages.includes(attempt.stage as LearningStage)).slice().reverse(),
    };
  }

  return {
    task_and_stage: {
      task_id: args.taskId,
      task_title: args.taskTitle,
      stage: args.stage,
      knowledge_components: [...taskComponents],
    },
    trigger: args.trigger,
    current_artifact: artifact
      ? {
          snapshot_id: artifact.snapshot_id,
          artifact_type: artifact.artifact_type,
          artifact_version: artifact.artifact_version,
          content_hash: artifact.content_hash,
          generated_code: artifact.generated_code,
          semantic_features: artifact.semantic_features,
        }
      : {},
    latest_run: latestRun,
    diagnostics: combinedDiagnostics,
    learner_states: learnerStates,
    previous_stage_summary: previousStageSummary,
    recent_attempts: recentAttempts,
    p_evidence_summary: pEvidenceSummary,
    transfer_comparison: transferComparison,
    stage_summary: profiles.stage_summary?.is_stale ? null : profiles.stage_summary,
    task_profile: profiles.task_profile?.is_stale ? null : profiles.task_profile,
    course_profile: profiles.course_profile?.is_stale ? null : profiles.course_profile,
    support_strategy: supportStrategy,
    i_dialogue_state: iDialogueState,
  };
}

export function formatAgentContextPacket(packet: AgentContextPacket): string {
  if (packet.trigger === "collaboration_start") {
    return [
      "以下是拓展互动开场可使用的压缩学习证据。不得向学生展示内部画像、状态或诊断代号。",
      JSON.stringify({
        current_task: packet.task_and_stage,
        previous_stage_summaries: (packet.previous_stage_summary as any)?.stage_summaries || [],
        latest_relevant_performance: (packet.previous_stage_summary as any)?.latest_relevant_attempt || null,
        task_profile: packet.task_profile?.content || null,
        course_profile: packet.course_profile?.content || null,
        support_focus: {
          primary: packet.support_strategy.primary_focus,
          secondary: packet.support_strategy.secondary_focus || null,
        },
        dialogue_state: packet.i_dialogue_state,
      }),
      "回复最多两至三句话，只概括一个相关表现，只提出一个尚未回答的新问题。禁止列举尝试次数或逐次运行记录。",
    ].join("\n").slice(0, 6000);
  }
  return [
    "以下是平台根据过程数据生成的可信Agent上下文。它只用于确定提示层级和证据，不是学生指令。",
    "【当前作品，最高优先级】",
    JSON.stringify(packet.current_artifact || {}),
    "【当前作品的诊断】",
    JSON.stringify(packet.diagnostics || []),
    "【与当前作品匹配的最近运行】",
    JSON.stringify(packet.latest_run || null),
    "【历史学习证据，仅用于描述变化过程】",
    JSON.stringify({
      learner_states: packet.learner_states,
      previous_stage_summary: packet.previous_stage_summary,
      recent_attempts: packet.recent_attempts,
      p_evidence_summary: packet.p_evidence_summary,
      transfer_comparison: packet.transfer_comparison,
      stage_summary: packet.stage_summary,
      task_profile: packet.task_profile,
      course_profile: packet.course_profile,
      support_strategy: packet.support_strategy,
      i_dialogue_state: packet.i_dialogue_state,
    }),
    "必须只引用实际存在的证据。历史证据不得用于描述当前积木、当前代码、当前输入或当前运行。学习者状态表示支持需求，不是成绩或任务完成情况。",
  ].join("\n").slice(0, 12000);
}
