import { Router, Request, Response } from "express";
import { idempotentRequest } from "../middleware/idempotentRequest";
import { canAccessStage, getStudentTaskState } from "../services/studentTaskState";
import pool from "../config/database";
import { CURRICULUM_VERSION, PROMPT_VERSION } from "../tasks/curriculum";
import {
  buildChatSystemPrompt,
  getMeaningfulCodeLines,
  getReplyCharacterLimit,
  replyContradictsStudentCode,
  trimAssistantReply,
  type ChatStage,
} from "../services/chatPolicy";
import {
  buildRunSnapshot,
  buildWorkspaceSnapshot,
} from "../services/learningContext";
import { saveArtifactSnapshot } from "../services/artifactEvidence";
import { buildAgentContextPacket, formatAgentContextPacket } from "../services/agentContextBuilder";
import { buildCollaborationOpening, collaborationReplyViolation, latestRelevantAttempt } from "../services/collaborationSupport";
import {
  completeIntervention,
  countAttemptDiagnosisOccurrences,
  countRecentDiagnosis,
  createInterventionRecord,
  interventionExistsForArtifact,
  supportLevelFor,
  supportLevelForRunFeedback,
} from "../services/interventionPolicy";
import {
  buildIDialogueFallback,
  recordAssistantDialogueTurn,
  recordStudentDialogueTurn,
  repeatsCurrentQuestion,
} from "../services/iDialogueState";
import { queueLearningProfileRefresh } from "../services/learningProfiles";

export const chatRouter = Router();

const DEEPSEEK_API_URL =
  process.env.DEEPSEEK_API_URL || "https://api.deepseek.com/v1/chat/completions";

interface IncomingMessage {
  role: "user" | "assistant";
  content: string;
}

export function chatOperationId(body: Record<string, unknown> | undefined): string | undefined {
  if (!body) return undefined;
  if (!body.trigger || body.trigger === "student_message") {
    return typeof body.client_message_id === "string" ? body.client_message_id : undefined;
  }
  if (typeof body.request_key === "string") return body.request_key;
  return typeof body.client_message_id === "string" ? body.client_message_id : undefined;
}

interface CoordinateBounds {
  min_x: number;
  max_x: number;
  min_y: number;
  max_y: number;
}

function likelyLeaksCode(reply: string, studentCode: string): boolean {
  if (reply.includes("```")) return true;

  const normalizeLine = (line: string) =>
    line
      .replace(/^[\s\d.、*-]+/, "")
      .replace(/^`|`$/g, "")
      .trim();
  const studentLines = getMeaningfulCodeLines(studentCode).map(normalizeLine);
  const inlineSnippets = Array.from(reply.matchAll(/`([^`\n]+)`/g))
    .map((match) => normalizeLine(match[1]))
    .filter((line) => /\b(print|input|range|if|else|for)\b\s*[:(]/.test(line));
  const standaloneLines = reply
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter((line) => /^(?:print|input|for|if|else)\b.*[:()]?\s*$/.test(line));
  const candidateLines = Array.from(new Set([...inlineSnippets, ...standaloneLines]));
  const novelLines = candidateLines.filter(
    (candidate) =>
      !studentLines.some(
        (studentLine) =>
          candidate === studentLine
          || candidate.includes(studentLine)
          || studentLine.includes(candidate)
      )
  );

  return novelLines.length >= 2;
}

function claimsUnseenStudentHistory(reply: string, evidence: string): boolean {
  return evidence.trim().length === 0 && /(你刚才|你之前|你说过|你选择了)/.test(reply);
}

function misattributesReferenceBlocks(reply: string, stage: ChatStage): boolean {
  if (stage !== "C" && stage !== "I") return false;
  return /(你的|你目前的|你现在的|你已经).{0,8}(工作区|积木|搭建)/.test(reply);
}

function claimsWorkInEmptyWorkspace(reply: string): boolean {
  return /(你已经|你已|你现在已经|你成功).{0,32}(设成|设为|设置|创建|放入|连接|搭好|搭建|完成|添加|拖出)/.test(reply);
}

function previousTaskAttempts(packet: any): Array<Record<string, any>> {
  const attempts = packet?.previous_stage_summary?.attempts;
  if (Array.isArray(attempts) && attempts.length) return attempts;
  const latest = latestRelevantAttempt(packet);
  return latest ? [latest] : [];
}

const taskSuccessFocus: Record<number, string> = {
  1: "请观察三条输出和小明气泡是否按代码从上到下一一对应。",
  2: "请观察变量的新值怎样对应小明的位置变化。",
  3: "请比较本次输入、实际进入的条件分支和小明到达的位置。",
  4: "请观察循环次数与小明每次往返之间的对应关系。",
  5: "请观察每一轮条件判断怎样决定小明接下来的方向。",
  6: "请观察输入选择、条件分支、循环移动和最终路线之间的对应关系。",
};

export function successfulRunReply(packet: any, stage: ChatStage, taskId?: number): string {
  const attempts = Array.isArray(packet?.recent_attempts)
    ? packet.recent_attempts as Array<Record<string, any>>
    : [];
  const currentEvidenceId = String(packet?.latest_run?.evidence_id || "");
  let skippedCurrentSuccess = false;
  const priorAttempts = attempts.filter((attempt) => {
    if (currentEvidenceId && String(attempt.evidence_id || "") === currentEvidenceId) return false;
    if (
      !currentEvidenceId
      && !skippedCurrentSuccess
      && attempt.stage === stage
      && attempt.result === "target_met"
    ) {
      skippedCurrentSuccess = true;
      return false;
    }
    return true;
  });
  const hadPriorFailure = priorAttempts.some((attempt) =>
    attempt.stage === stage
    && ["invalid_structure", "syntax_error", "runtime_error", "target_mismatch", "timeout"]
      .includes(String(attempt.result || ""))
  );
  const historySentence = hadPriorFailure
    ? "这也说明你已经修正了这个阶段此前的问题，请以本次运行结果为准。"
    : "";
  if (stage === "I") {
    return `这次运行已经达到拓展目标。${historySentence}${buildIDialogueFallback(packet?.i_dialogue_state || null, true)}`;
  }
  if (stage === "C") {
    return "你已经完成代码挑战，本次学习成果已记录，学习小结正在整理。现在可以进入拓展互动继续练习。";
  }
  return `这次运行已经达到任务目标。${historySentence}${taskSuccessFocus[Number(taskId)] || "请观察当前程序和画面结果之间的对应关系。"}`;
}

function claimsUnsupportedAttemptHistory(reply: string, packet: any): boolean {
  const attempts = previousTaskAttempts(packet);
  if (!/(运行|尝试|报错|错误|通过|成功|目标)/.test(reply)) return false;

  const latestRunResult = String(packet?.latest_run?.result || "");
  const statuses = new Set([
    ...attempts.map((attempt) => String(attempt.result || "")),
    latestRunResult,
  ].filter(Boolean));
  if (/(成功通过|通过了|目标达成|运行成功)/.test(reply) && !statuses.has("target_met")) return true;
  if (/语法错误/.test(reply) && !statuses.has("syntax_error")) return true;
  if (/(目标不匹配|没有达到任务目标|结果不符)/.test(reply) && !statuses.has("target_mismatch")) return true;

  const ordinals: Record<string, number> = {
    一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
  };
  for (const match of reply.matchAll(/第([一二三四五六七八九]|\d+)次(?:运行|尝试)/g)) {
    const value = ordinals[match[1]] || Number(match[1]);
    const availableAttemptCount = attempts.length + (latestRunResult ? 1 : 0);
    if (value > availableAttemptCount) return true;
  }
  return false;
}

export function currentOutputMismatchHint(packet: any): string {
  const run = packet?.latest_run;
  if (!run || run.matches_current_artifact !== true) {
    return "程序可以运行，但当前结果还没有达到任务目标。请根据本次运行结果逐项检查。";
  }
  const actual = String(run.stdout || "").replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
  const expected = String(run.expected_output || "").replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
  if (!String(run.expected_output || "").trim()) {
    return "程序可以运行，但当前结果还没有达到任务目标。请检查变量变化、条件分支或实际路线。";
  }
  const limit = Math.max(actual.length, expected.length);
  for (let index = 0; index < limit; index += 1) {
    if (actual[index] === expected[index]) continue;
    if (actual[index] == null) return `程序可以运行，但缺少第${index + 1}条目标输出。请检查对应的语句是否已连接并执行。`;
    if (expected[index] == null) return `程序可以运行，但从第${index + 1}条开始出现了额外输出。请检查是否多放或重复执行了语句。`;
    return `程序可以运行，但第${index + 1}条输出内容与任务目标不一致。请检查对应的文本或语句顺序。`;
  }
  return "程序可以运行，但当前结果还没有达到任务目标。请检查变量变化、条件分支或实际路线。";
}

function attemptStatusLabel(attempt: Record<string, any>): string {
  const line = attempt.error_line ? `（第${attempt.error_line}行）` : "";
  switch (attempt.result) {
    case "syntax_error": return `代码存在语法错误${line}`;
    case "runtime_error": return `程序运行中出现错误${line}`;
    case "target_mismatch": return "程序可以运行，但结果没有达到任务目标";
    case "target_met": return "本次运行达到任务目标";
    case "timeout": return "程序运行超时";
    case "invalid_structure": return "积木结构还不能生成程序";
    default: return "留下了一次运行记录";
  }
}

function collaborationEvidenceFallback(packet: any): string {
  return buildCollaborationOpening(packet);
}

function asksToEditReferenceBlocks(reply: string) {
  return /(拖|搭|排列|连接|修改|移动).{0,8}(积木|块)|(积木|块).{0,8}(拖|搭|排列|连接|修改|移动)/.test(reply);
}

function normalizedReply(value: string) {
  return value.replace(/[\s，。！？、：；"'“”‘’]/g, "").toLowerCase();
}

function semanticSimilarity(left: string, right: string) {
  const a = normalizedReply(left);
  const b = normalizedReply(right);
  if (!a || !b) return 0;
  if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) / Math.max(a.length, b.length);
  const bigrams = (value: string) => new Set(Array.from({ length: Math.max(0, value.length - 1) }, (_, index) => value.slice(index, index + 2)));
  const aSet = bigrams(a);
  const bSet = bigrams(b);
  const intersection = [...aSet].filter((item) => bSet.has(item)).length;
  return intersection / Math.max(1, new Set([...aSet, ...bSet]).size);
}

function collaborationQuestionContradictsOutcome(reply: string, packet: any): boolean {
  const latestAttempt = previousTaskAttempts(packet).at(-1);
  return latestAttempt?.result === "target_met"
    && /(结果与目标|还有什么不同|还差什么|没有达到|未达到)/.test(reply);
}

function coordinatesWithinBounds(reply: string, bounds?: CoordinateBounds): boolean {
  if (!bounds) return true;
  const matches = reply.matchAll(/\(\s*(-?\d+)\s*[,，]\s*(-?\d+)\s*\)/g);
  for (const match of matches) {
    const x = Number(match[1]);
    const y = Number(match[2]);
    if (x < bounds.min_x || x > bounds.max_x || y < bounds.min_y || y > bounds.max_y) {
      return false;
    }
  }
  return true;
}

function visualizationForStage(content: any, stage: ChatStage) {
  if (stage === "I") {
    return content.i_stage?.visualization_override || content.visualization || {};
  }
  return content.visualization || {};
}

function buildTrustedTaskFacts(content: any, stage: ChatStage) {
  const visualization = visualizationForStage(content, stage);
  const actor = visualization.actor || { x: 0, y: 0 };
  const objects = Array.isArray(visualization.objects) ? visualization.objects : [];
  const bounds = visualization.coordinate_bounds as CoordinateBounds | undefined;
  const fruitObjects = objects.filter((object: any) => ["apple", "pear"].includes(object.kind));
  const objectFacts = stage === "P"
    ? Array.from(new Set(fruitObjects.map((object: any) => object.kind === "apple" ? "苹果" : "梨")))
        .map((kind) => `本阶段画面包含${kind}，P阶段不得透露其目标坐标`)
    : objects.map(
        (object: any) => `${object.kind === "apple" ? "苹果" : object.kind === "pear" ? "梨" : object.kind} ${object.id} 位于(${object.x},${object.y})`
      );
  const colorNames: Record<string, string> = {
    blue: "蓝色",
    orange: "橙色",
    green: "绿色",
    purple: "紫色",
  };
  const lessonBlocks = Array.isArray(content.p_stage?.subtasks)
    ? content.p_stage.subtasks.flatMap((subtask: any) => subtask.blocks || [])
    : [];
  const colorFacts = lessonBlocks.map(
    (item: any) => `${item.block_type}使用${colorNames[item.color] || item.color || "课程指定"}标识`
  );
  const facts = [
    `小明初始坐标=(${actor.x ?? 0},${actor.y ?? 0})`,
    bounds && stage !== "P"
      ? `可活动坐标范围：x从${bounds.min_x}到${bounds.max_x}，y从${bounds.min_y}到${bounds.max_y}`
      : "",
    `本阶段水果数量=${fruitObjects.length}`,
    visualization.coordinate_help !== "hidden"
      ? "画面关系：x增加向右、x减少向左、y增加向下、y减少向上；数值变化1对应一个草格"
      : "",
    visualization.collection_help && visualization.collection_help !== "none"
      ? "画面结果：小明进入水果所在草格后会收集水果"
      : "",
    ...objectFacts,
    ...colorFacts,
  ].filter(Boolean);
  return { facts: facts.join("\n"), bounds };
}

async function requestModel(
  apiKey: string,
  systemPrompt: string,
  messages: IncomingMessage[]
) {
  const response = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      temperature: 0.3,
      max_tokens: 320,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const data: any = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "模型请求失败");
  return String(data?.choices?.[0]?.message?.content || "");
}

async function loadTrustedConversation(
  userId: string,
  taskId: number,
  stage: ChatStage,
  artifactToken: string
): Promise<IncomingMessage[]> {
  const [rows] = await pool.query<any[]>(
    `SELECT cm.role, cm.content
     FROM chat_messages cm
     WHERE cm.user_id = ? AND cm.task_id = ? AND cm.stage = ? AND cm.prompt_version = ?
       AND (
         cm.message_type <> 'system_trigger'
         OR cm.artifact_token IS NULL
         OR cm.artifact_token = ?
         OR cm.artifact_token LIKE '%:context'
       )
       AND NOT EXISTS (
         SELECT 1 FROM user_actions ua
         WHERE ua.user_id = cm.user_id
           AND ua.task_id = cm.task_id
           AND ua.stage = cm.stage
           AND ua.action_type = 'agent_response_stale'
           AND JSON_UNQUOTE(JSON_EXTRACT(ua.action_detail, '$.request_key')) = cm.request_id
       )
     ORDER BY cm.id DESC
     LIMIT 12`,
    [userId, taskId, stage, PROMPT_VERSION, artifactToken]
  );
  return rows.reverse().filter((row, index, ordered) => {
    const previous = ordered[index - 1];
    return !previous || previous.role !== row.role || previous.content !== row.content;
  }).map((row) => ({
    role: row.role,
    content: String(row.content || "").slice(0, 4000),
  }));
}

chatRouter.get("/history", async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const taskId = Number(req.query.task_id);
    const stage = String(req.query.stage || "");
    const artifactToken = String(req.query.artifact_token || "").slice(0, 80);
    const [rows] = await pool.query<any[]>(
      `SELECT cm.role, cm.content, cm.message_type, cm.request_id, cm.artifact_token, cm.created_at
       FROM chat_messages cm
       WHERE cm.user_id = ? AND cm.task_id = ? AND cm.stage = ?
         AND cm.prompt_version = ?
         AND NOT (cm.role = 'user' AND cm.message_type = 'system_trigger')
         AND (
           cm.message_type <> 'system_trigger'
           OR cm.artifact_token IS NULL
           OR cm.artifact_token = ?
           OR cm.artifact_token LIKE '%:context'
         )
         AND NOT EXISTS (
           SELECT 1 FROM user_actions ua
           WHERE ua.user_id = cm.user_id
             AND ua.task_id = cm.task_id
             AND ua.stage = cm.stage
             AND ua.action_type = 'agent_response_stale'
             AND JSON_UNQUOTE(JSON_EXTRACT(ua.action_detail, '$.request_key')) = cm.request_id
         )
       ORDER BY cm.created_at, cm.id`,
      [session.user_id, taskId, stage, PROMPT_VERSION, artifactToken]
    );
    const messages = rows.filter((row, index) => {
      const previous = rows[index - 1];
      return !previous || previous.role !== row.role || previous.content !== row.content;
    });
    res.json({ messages });
  } catch (error) {
    console.error("Chat history error:", error);
    res.status(500).json({ error: "对话记录加载失败" });
  }
});

chatRouter.post(
  "/send",
  idempotentRequest("agent", (req) => chatOperationId(req.body)),
  async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const {
      messages,
      stage,
      task_id,
      trigger = "student_message",
      attempt = 0,
      run_outcome,
      error_line,
      block_id,
      student_code,
      blockly_xml,
      message_type = "dialogue",
      client_message_id,
      artifact_version,
      artifact_token,
      diagnosis_occurrence,
      step_id,
      request_key,
    } = req.body as {
      messages: IncomingMessage[];
      stage: ChatStage;
      task_id: number;
      trigger?: string;
      attempt?: number;
      run_outcome?: string;
      error_line?: number;
      block_id?: string;
      student_code?: string;
      blockly_xml?: string;
      message_type?: string;
      client_message_id?: string;
      artifact_version?: number;
      artifact_token?: string;
      diagnosis_occurrence?: number;
      step_id?: number;
      request_key?: string;
    };

    if (!task_id || !["P", "A", "C", "I"].includes(stage)) {
      res.status(400).json({ error: "任务或阶段参数不正确" });
      return;
    }

    if (!(await canAccessStage(session.user_id, task_id, stage))) {
      res.status(403).json({ error: "请先完成前一个学习阶段" });
      return;
    }

    const [taskRows] = await pool.query<any[]>(
      `SELECT title, description, content_json
       FROM tasks WHERE id = ? AND version = ?`,
      [task_id, CURRICULUM_VERSION]
    );
    if (taskRows.length === 0) {
      res.status(404).json({ error: "任务不存在" });
      return;
    }

    if (trigger === "stage_intro" || trigger === "collaboration_start") {
      const [existingRows] = await pool.query<any[]>(
        `SELECT id
         FROM user_actions
         WHERE user_id = ? AND task_id = ? AND stage = ?
           AND action_type = 'llm_interaction'
           AND prompt_version = ?
           AND JSON_UNQUOTE(JSON_EXTRACT(action_detail, '$.trigger')) = ?
         LIMIT 1`,
        [session.user_id, task_id, stage, PROMPT_VERSION, trigger]
      );
      if (existingRows.length > 0) {
        res.json({ skipped: true, prompt_version: PROMPT_VERSION });
        return;
      }
    }

    const task = taskRows[0];
    const content = task.content_json || {};
    const { facts: trustedTaskFacts, bounds } = buildTrustedTaskFacts(content, stage);

    const currentLearningState = stage === "A" || stage === "C"
      ? await getStudentTaskState(session.user_id, task_id)
      : null;
    if (stage === "C" && trigger === "stage_intro" && currentLearningState?.c_completed) {
      res.json({
        skipped: true,
        reason: "completed_stage_intro",
        prompt_version: PROMPT_VERSION,
        artifact_version: Number(artifact_version || 0),
      });
      return;
    }

    const contextOnlyTrigger = trigger === "stage_intro"
      || trigger === "p_step_explanation"
      || trigger === "collaboration_start";
    const safeArtifactToken = String(artifact_token || `${stage}:context`).slice(0, 80);
    const workspaceSnapshot = buildWorkspaceSnapshot({
      stage,
      blocklyXml: contextOnlyTrigger ? "" : typeof blockly_xml === "string" ? blockly_xml : "",
      studentCode: contextOnlyTrigger ? "" : String(student_code || ""),
    });
    const workspaceContext = workspaceSnapshot.context;
    const workspaceIsEmpty = workspaceSnapshot.workspaceIsEmpty;
    const effectiveStudentCode = workspaceSnapshot.currentCode;

    let currentArtifactVersion = contextOnlyTrigger ? 0 : Number(artifact_version || 0);
    const artifactContent = stage === "A"
      ? String(blockly_xml || "")
      : stage === "C" || stage === "I"
        ? String(student_code || "")
        : "";
    if (!contextOnlyTrigger && artifactContent.trim()) {
      const savedArtifact = await saveArtifactSnapshot({
        userId: session.user_id,
        sessionId: session.session_id,
        taskId: task_id,
        stage,
        artifactType: stage === "A" ? "blockly" : "python",
        content: artifactContent,
        sourceAction: trigger === "student_message" ? "chat_request" : trigger,
        generatedCode: stage === "A" ? effectiveStudentCode : undefined,
      });
      currentArtifactVersion = savedArtifact.snapshot.artifact_version;
    }

    const [actionRows] = await pool.query<any[]>(
      `SELECT action_detail
       FROM user_actions
       WHERE user_id = ? AND task_id = ? AND stage = ?
         AND action_type IN ('a_submit', 'c_run', 'i_run')
       ORDER BY id DESC
       LIMIT 1`,
      [session.user_id, task_id, stage]
    );
    const runSnapshot = buildRunSnapshot(
      actionRows[0]?.action_detail,
      effectiveStudentCode
    );
    const runFacts = runSnapshot.facts;

    const clientMessages = Array.isArray(messages)
      ? messages.filter((item) => item?.role === "user" || item?.role === "assistant")
      : [];
    const currentUserMessage = message_type === "system_trigger"
      ? undefined
      : [...clientMessages].reverse().find((item) => item.role === "user");
    const requestId = client_message_id || request_key
      ? String(client_message_id || request_key).slice(0, 50)
      : null;

    if (requestId) {
      const [existingReplies] = await pool.query<any[]>(
        `SELECT content, artifact_token
         FROM chat_messages
         WHERE user_id = ? AND task_id = ? AND stage = ?
           AND role = 'assistant' AND request_id = ?
         LIMIT 1`,
        [session.user_id, task_id, stage, requestId]
      );
      if (existingReplies.length > 0) {
        res.json({
          choices: [{ message: { role: "assistant", content: existingReplies[0].content } }],
          prompt_version: PROMPT_VERSION,
          artifact_token: existingReplies[0].artifact_token || safeArtifactToken,
          deduplicated: true,
        });
        return;
      }
    }

    if (currentUserMessage) {
      await pool.query(
        `INSERT IGNORE INTO chat_messages
          (user_id, session_id, task_id, stage, role, content, message_type, prompt_version, request_id, artifact_token)
         VALUES (?, ?, ?, ?, 'user', ?, ?, ?, ?, ?)`,
        [
          session.user_id,
          session.session_id,
          task_id,
          stage,
          String(currentUserMessage.content || "").slice(0, 4000),
          message_type,
          PROMPT_VERSION,
          requestId,
          safeArtifactToken,
        ]
      );
      if (stage === "I") {
        await recordStudentDialogueTurn(
          session.user_id,
          task_id,
          String(currentUserMessage.content || "")
        );
      }
    }

    const learningState = currentLearningState;
    if (stage === "A" && learningState?.a_completed && trigger !== "inactivity") {
      const reply = "这个阶段已经完成了。你可以回顾左侧保留的积木结构，然后点击下方的“代码挑战”进入下一阶段。";
      await pool.query(
        `INSERT INTO chat_messages
          (user_id, session_id, task_id, stage, role, content, message_type, prompt_version, request_id, artifact_token)
         VALUES (?, ?, ?, ?, 'assistant', ?, ?, ?, ?, ?)`,
        [
          session.user_id,
          session.session_id,
          task_id,
          stage,
          reply,
          message_type,
          PROMPT_VERSION,
          requestId,
          safeArtifactToken,
        ]
      );
      await pool.query(
        `INSERT INTO user_actions
          (user_id, session_id, task_id, stage, action_type, action_detail, prompt_version)
         VALUES (?, ?, ?, ?, 'llm_interaction', ?, ?)`,
        [
          session.user_id,
          session.session_id,
          task_id,
          stage,
          JSON.stringify({ trigger, message_type, deterministic: true, reason: "a_stage_completed" }),
          PROMPT_VERSION,
        ]
      );
      res.json({
        choices: [{ message: { role: "assistant", content: reply } }],
        prompt_version: PROMPT_VERSION,
        artifact_version: Number(artifact_version || 0),
        artifact_token: safeArtifactToken,
      });
      return;
    }

    const trustedConversation = await loadTrustedConversation(
      session.user_id,
      task_id,
      stage,
      safeArtifactToken
    );
    const trustedStudentEvidence = trustedConversation
      .filter((item) => item.role === "user")
      .slice(-6)
      .map((item, index) => `${index + 1}. ${item.content}`)
      .join("\n");

    const stageGuide = content.learning_guide || {};
    const iStage = content.i_stage || {};
    const iUiCopy = iStage.ui_copy || {};
    const pSubtasks = Array.isArray(content.p_stage?.subtasks) ? content.p_stage.subtasks : [];
    const selectedPSubtask = trigger === "p_step_explanation"
      ? pSubtasks.find((subtask: any) => Number(subtask.id) === Number(step_id))
      : null;
    const pSubtaskContext = selectedPSubtask
      ? [
          `学生当前正在阅读的步骤：${selectedPSubtask.title}`,
          selectedPSubtask.objective ? `这一步要理解：${selectedPSubtask.objective}` : "",
          ...(selectedPSubtask.blocks || []).map((block: any) =>
            `所需积木：${block.block_type}；抽屉类别：${block.drawer_category}；含义：${block.meaning}`
          ),
          "只讲解当前这一步，不要展开其他步骤，不要给出本题完整答案。",
        ].filter(Boolean).join("\n")
      : pSubtasks
          .map((subtask: any, index: number) => `步骤${index + 1}：${subtask.title}`)
          .join("\n");
    const baseGuideContext = stage === "P"
      ? [
          pSubtaskContext ? `讲解步骤（只讲概念，不给目标值或完整答案）：\n${pSubtaskContext}` : "",
          Array.isArray(stageGuide.concepts) ? `本任务限定知识点：${stageGuide.concepts.join("、")}` : "",
        ].filter(Boolean).join("\n")
      : [
          stageGuide.goal ? `本任务明确目标：${stageGuide.goal}` : "",
          Array.isArray(stageGuide.steps) ? `本任务操作步骤：${stageGuide.steps.join("；")}` : "",
          Array.isArray(stageGuide.concepts) ? `本任务限定知识点：${stageGuide.concepts.join("、")}` : "",
          stageGuide.observe ? `本任务观察重点：${stageGuide.observe}` : "",
        ].filter(Boolean).join("\n");
    const guideContext = stage === "I"
      ? [
          iStage.title ? `I阶段拓展任务：${iStage.title}` : "",
          iStage.description ? `I阶段任务说明：${iStage.description}` : "",
          iUiCopy.planning ? `I阶段规划要求：${iUiCopy.planning}` : "",
          iUiCopy.reference_step ? `I阶段参考方式：${iUiCopy.reference_step}` : "",
          iUiCopy.discussion_step ? `I阶段讨论依据：${iUiCopy.discussion_step}` : "",
          "I阶段必须只依据以上拓展任务，不得套用A/C阶段的目标、输入要求或目标数量。",
        ].filter(Boolean).join("\n")
      : baseGuideContext;
    const stageSpecificContext = stage === "P"
      ? "只解释本阶段概念、积木关系与画面变化，不介绍系统实现方式，也不复述界面中的目标数值、目标坐标或固定输出文本。"
      : stage === "A"
        ? String(content.a_stage?.instruction || "")
        : stage === "C"
          ? `${content.c_stage?.title || ""}。${content.c_stage?.description || ""}`
          : String(content.i_stage?.description || "");
    const stageContext = [stageSpecificContext, guideContext].filter(Boolean).join("\n");

    const agentPacket = await buildAgentContextPacket({
      userId: session.user_id,
      taskId: task_id,
      taskTitle: task.title,
      stage,
      trigger,
    });
    const strategyContext = [
      `本次支持方式：${agentPacket.support_strategy.interaction_mode}`,
      `优先关注：${agentPacket.support_strategy.primary_focus}`,
      agentPacket.support_strategy.secondary_focus
        ? `次要关注：${agentPacket.support_strategy.secondary_focus}`
        : "",
      agentPacket.support_strategy.require_prediction
        ? "先请学生预测或解释，再提供提示。"
        : "",
      stage === "I" && agentPacket.i_dialogue_state
        ? `I阶段当前互动环节：${agentPacket.i_dialogue_state.phase}。必须承接学生已作出的选择，不得重新询问已讨论或已解决的问题。`
        : "",
    ].filter(Boolean).join("\n");
    // Historical snapshots remain available through recent attempts and learner states,
    // but an empty live workspace must not be presented as the student's current artifact.
    if (
      contextOnlyTrigger
      || (trigger !== "run_feedback" && workspaceIsEmpty && (stage === "A" || stage === "C" || stage === "I"))
    ) {
      agentPacket.current_artifact = {};
      agentPacket.diagnostics = [];
      agentPacket.latest_run = null;
    }
    const groundedRunFacts = (agentPacket.latest_run as any)?.matches_current_artifact === true
      ? runFacts
      : "最近运行不对应当前作品，不得使用其输出、错误或变量事实评价当前内容。";
    const primaryDiagnostic = agentPacket.diagnostics.find((item) => !item.resolved);
    if (trigger === "inactivity" && !primaryDiagnostic) {
      res.json({
        skipped: true,
        prompt_version: PROMPT_VERSION,
        artifact_version: Number((agentPacket.current_artifact as any).artifact_version || currentArtifactVersion || 0),
      });
      return;
    }
    const packetArtifactVersion = Number(
      (agentPacket.current_artifact as any).artifact_version || currentArtifactVersion || 0
    );
    const attemptOccurrence = primaryDiagnostic
      ? Number(diagnosis_occurrence || await countAttemptDiagnosisOccurrences(
          session.user_id,
          task_id,
          stage,
          primaryDiagnostic.code
        ))
      : 0;
    if (
      trigger === "run_feedback"
      && run_outcome !== "target_met"
      && primaryDiagnostic
      && attemptOccurrence < 2
    ) {
      res.json({
        skipped: true,
        prompt_version: PROMPT_VERSION,
        artifact_version: packetArtifactVersion,
      });
      return;
    }
    if (
      trigger === "inactivity"
      && primaryDiagnostic
      && await interventionExistsForArtifact({
        userId: session.user_id,
        taskId: task_id,
        stage,
        trigger,
        diagnosisCode: primaryDiagnostic.code,
        artifactVersion: packetArtifactVersion,
      })
    ) {
      res.json({ skipped: true, prompt_version: PROMPT_VERSION, artifact_version: packetArtifactVersion });
      return;
    }
    const previousDiagnosisCount = primaryDiagnostic
      ? await countRecentDiagnosis(session.user_id, task_id, stage, primaryDiagnostic.code)
      : 0;
    const diagnosticSupportLevel = trigger === "run_feedback" && primaryDiagnostic
      ? supportLevelForRunFeedback(stage, attemptOccurrence)
      : trigger === "inactivity"
        ? stage === "C" ? 2 : 1
        : trigger === "p_step_explanation"
          ? 1
          : supportLevelFor(primaryDiagnostic ? [primaryDiagnostic] : [], previousDiagnosisCount);
    const supportLevel = (
      trigger === "run_feedback" || trigger === "inactivity" || trigger === "p_step_explanation"
        ? diagnosticSupportLevel
        : Math.max(diagnosticSupportLevel, agentPacket.support_strategy.support_level)
    ) as 1 | 2 | 3;
    const latestRunFeatures = ((agentPacket.latest_run as any)?.ast_features || {}) as Record<string, boolean>;
    const task6RouteScaffold = task_id === 6
      && trigger === "run_feedback"
      && run_outcome === "target_mismatch"
      && (agentPacket.latest_run as any)?.matches_current_artifact === true
      && latestRunFeatures.has_input === true
      && latestRunFeatures.has_if === true
      && latestRunFeatures.has_for === true;
    const routeScaffoldContext = task6RouteScaffold
      ? supportLevel >= 3
        ? "本次只可提供三级路线支架：把路线概括成三个阶段——前往第一个目标、返回中心、再前往第二个目标。请引导学生逐段核对变量变化，不得提供代码、行号、坐标答案或完整积木组合。"
        : "本次只可提供二级路线支架：提醒学生检查程序是否同时包含‘前往、返回、再前往’三个作用不同的部分。不得提供代码、行号、坐标答案或完整积木组合。"
      : "";
    const intervention = await createInterventionRecord({
      userId: session.user_id,
      sessionId: session.session_id,
      taskId: task_id,
      stage,
      trigger,
      diagnostic: primaryDiagnostic,
      supportLevel,
      artifactVersion: packetArtifactVersion,
      promptVersion: PROMPT_VERSION,
    });

    const systemPrompt = buildChatSystemPrompt({
      stage,
      taskTitle: task.title,
      taskDescription: stage === "P"
        ? "课程讲解阶段。任务目标与标准答案由界面负责展示，模型只讲概念和方法。"
        : stage === "I"
          ? [iStage.title, iStage.description, iUiCopy.planning].filter(Boolean).join("。")
          : task.description,
      stageContext: [stageContext, strategyContext, routeScaffoldContext].filter(Boolean).join("\n"),
      trustedTaskFacts,
      trustedStudentEvidence,
      trigger,
      attempt,
      runOutcome: run_outcome,
      errorLine: error_line,
      blockId: block_id,
      studentCode: effectiveStudentCode,
      workspaceContext,
      runFacts: groundedRunFacts,
      agentContext: formatAgentContextPacket(agentPacket),
      supportLevel,
      promptVersion: PROMPT_VERSION,
    });

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      res.status(503).json({ error: "学习伙伴暂时不可用，消息已经保存" });
      return;
    }

    const studentQuestion = String(currentUserMessage?.content || "");
    const asksPrintLineCount = /(?:几|多少)\s*(?:行|条).{0,8}(?:print|输出)|(?:print|输出).{0,8}(?:几|多少)\s*(?:行|条)/i.test(studentQuestion);
    const asksCodeLineCount = /(?:编辑器|当前代码|我写的代码).{0,12}(?:几|多少)\s*(?:行|条)/.test(studentQuestion);
    const currentCodeLines = getMeaningfulCodeLines(effectiveStudentCode);
    const currentPrintLines = currentCodeLines.filter((line) => /^\s*print\s*\(/.test(line));
    const successfulRunMessage = trigger === "run_feedback" && run_outcome === "target_met"
      ? successfulRunReply(agentPacket, stage, task_id)
      : "";
    let reply = successfulRunMessage
      || (asksPrintLineCount
        ? `我读取到当前编辑器里有${currentPrintLines.length}行print语句。`
        : asksCodeLineCount
          ? `我读取到当前编辑器里有${currentCodeLines.length}行非空代码。`
          : await requestModel(apiKey, systemPrompt, trustedConversation));
    const invalidFacts = () =>
      !coordinatesWithinBounds(reply, bounds)
      || claimsUnseenStudentHistory(reply, trustedStudentEvidence)
      || claimsUnsupportedAttemptHistory(reply, agentPacket)
      || collaborationQuestionContradictsOutcome(reply, agentPacket)
      || misattributesReferenceBlocks(reply, stage)
      || (stage === "I" && asksToEditReferenceBlocks(reply))
      || (workspaceIsEmpty && claimsWorkInEmptyWorkspace(reply))
      || replyContradictsStudentCode(reply, effectiveStudentCode)
      || (stage === "I" && repeatsCurrentQuestion(reply, agentPacket.i_dialogue_state))
      || (trigger === "collaboration_start" && collaborationReplyViolation(reply) !== null)
      || (
        run_outcome === "target_mismatch"
        && /括号|引号|冒号|缩进|语法错误/.test(reply)
        && !/不是|并非|无需/.test(reply)
      )
      || (stage === "C" && likelyLeaksCode(reply, effectiveStudentCode));

    if (invalidFacts()) {
      reply = await requestModel(
        apiKey,
        `${systemPrompt}\n上一条草稿包含不可信事实、重复问题、错误读取了当前代码，或越过了教学边界。请严格依据平台事实和当前代码重写。I阶段只能要求学生编写和运行Python，绝不能让学生搭建、拖动、排列或修改只读积木。不得虚构学生原话、代码行数或坐标，不得给出本题答案代码。若本次是拓展互动开场，只能用两至三句话概括一个相关表现并提出一个新问题，禁止列举第几次运行、尝试次数或错误流水。`,
        trustedConversation
      );
    }

    if (invalidFacts()) {
      reply = stage === "I"
        ? trigger === "collaboration_start"
          ? collaborationEvidenceFallback(agentPacket)
          : buildIDialogueFallback(agentPacket.i_dialogue_state, Boolean(effectiveStudentCode.trim()))
        : stage === "P"
        ? "请先阅读本次任务目标，再按顺序展开下面的任务步骤。你可以先告诉我：目前哪一个积木或概念最难理解？"
        : stage === "A"
        ? workspaceIsEmpty
          ? "左侧工作区目前还是空白。请先根据目标程序第一行，从对应颜色的抽屉拖出第一块积木；完成后再来问我下一步。"
          : "先观察左侧工作区中已有的积木，再检查本课需要的积木是否从对应颜色的抽屉中拖出，并正确放入输入槽、上下连接。"
          : stage === "C"
          ? run_outcome === "target_mismatch"
            ? currentOutputMismatchHint(agentPacket)
            : run_outcome === "runtime_error" || run_outcome === "timeout"
              ? "程序已经开始执行，但运行中途遇到了问题。请先查看停止的代码行和已经产生的变量变化，再检查这一行使用的变量和值。"
              : "请根据错误行检查这一行的括号、英文引号、冒号或缩进，再对照左侧积木确认程序结构。"
          : trigger === "collaboration_start" || /之前|刚才|此前|运行记录|真实运行/.test(trustedStudentEvidence)
            ? collaborationEvidenceFallback(agentPacket)
            : effectiveStudentCode.trim()
              ? `我已经读取到你本次运行的${getMeaningfulCodeLines(effectiveStudentCode).length}行非空代码和运行结果。请先对照拓展任务，检查当前程序还缺少哪一句输出或哪一步操作。`
              : "我还没有足够可靠的信息判断这次路线。请先运行一次程序，或告诉我你现在想检查哪一步。";
    }
    if (
      stage === "C"
      && trigger === "run_feedback"
      && run_outcome === "target_mismatch"
      && /括号|引号|冒号|缩进|语法错误/.test(reply)
    ) {
      reply = currentOutputMismatchHint(agentPacket);
    }
    reply = trimAssistantReply(
      reply,
      getReplyCharacterLimit(trigger, stage, supportLevel)
    );
    if (["stage_intro", "p_step_explanation", "hint_request", "collaboration_start", "student_message"].includes(trigger)) {
      const [recentRows] = await pool.query<any[]>(
        `SELECT content FROM chat_messages
         WHERE user_id=? AND task_id=? AND stage=? AND role='assistant'
         ORDER BY id DESC LIMIT 5`,
        [session.user_id, task_id, stage]
      );
      if (recentRows.some((row) => semanticSimilarity(reply, String(row.content || "")) >= 0.78)) {
        reply = stage === "I"
          ? "我已经记下你刚才的回答，不再重复前一个问题。请继续在Python编辑区完成当前思路并运行；有了新结果后，我们再一起比较。"
          : "这条提示和前面的内容相同。请先按已有提示检查一个位置，作品发生变化后我再继续帮助你。";
      }
    }
    if (trigger === "p_step_explanation" && !/随时.{0,4}(问|提问)|可以.{0,4}(问|提问)/.test(reply)) {
      reply = `${trimAssistantReply(reply, 92)}\n哪里不明白，可以随时问我。`;
    }
    await completeIntervention(intervention.intervention_id, reply);

    await pool.query(
      `INSERT INTO chat_messages
        (user_id, session_id, task_id, stage, role, content, message_type, prompt_version, request_id, artifact_token)
       VALUES (?, ?, ?, ?, 'assistant', ?, ?, ?, ?, ?)`,
      [
        session.user_id,
        session.session_id,
        task_id,
        stage,
        reply,
        message_type,
        PROMPT_VERSION,
        requestId,
        safeArtifactToken,
      ]
    );
    if (stage === "I") {
      await recordAssistantDialogueTurn(session.user_id, task_id, reply);
      queueLearningProfileRefresh(session.user_id, task_id, "I");
    }
    await pool.query(
      `INSERT INTO user_actions
        (user_id, session_id, task_id, stage, action_type, action_detail, prompt_version)
       VALUES (?, ?, ?, ?, 'llm_interaction', ?, ?)`,
      [
        session.user_id,
        session.session_id,
        task_id,
        stage,
        JSON.stringify({
          trigger,
          attempt,
          run_outcome,
          error_line,
          block_id,
          message_type,
          received_student_code: Boolean(student_code),
          received_blockly_context: Boolean(blockly_xml),
          current_code_lines: getMeaningfulCodeLines(effectiveStudentCode).length,
          latest_run_available: runSnapshot.hasRun,
          latest_run_matches_current: runSnapshot.matchesCurrent,
          grounded_task_facts: true,
        }),
        PROMPT_VERSION,
      ]
    );

    res.json({
      choices: [{ message: { role: "assistant", content: reply } }],
      prompt_version: PROMPT_VERSION,
      artifact_version: intervention.artifact_version,
      artifact_token: safeArtifactToken,
      intervention: { ...intervention, message: reply },
    });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(503).json({ error: "学习伙伴暂时无法连接，请稍后重试" });
  }
});
