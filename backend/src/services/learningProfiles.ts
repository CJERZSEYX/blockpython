import { createHash } from "crypto";
import { v4 as uuidv4 } from "uuid";
import pool from "../config/database";
import type {
  LearningStage,
  LearningSummaryContent,
  LearningSummaryRecord,
  LearningSummaryScope,
  LearnerStateRecord,
  StudentLearningAdvice,
  SupportStrategy,
} from "./agentTypes";
import { getLearnerStates } from "./learnerModel";
import { getStudentTaskState } from "./studentTaskState";

export const SUMMARY_PROMPT_VERSION = "learning-evidence-summary-v4";
export const DEFAULT_SUMMARY_AGENT_MODEL = "deepseek-chat";
const stages: LearningStage[] = ["P", "A", "C", "I"];

const stageLabels: Record<LearningStage, string> = {
  P: "任务理解",
  A: "积木练习",
  C: "代码挑战",
  I: "拓展互动",
};

const diagnosisLabels: Record<string, string> = {
  missing_input: "积木输入槽未填写完整",
  disconnected_block: "积木没有正确连接",
  floating_block: "工作区存在游离积木",
  wrong_order: "语句顺序与任务目标不一致",
  syntax_error: "Python语法书写",
  runtime_error: "程序运行时错误",
  target_mismatch: "运行结果与任务目标不一致",
  logic_target_mismatch: "程序可以运行，但结果未达到任务目标",
  transfer_missing_statement: "积木到Python转写时遗漏语句",
  transfer_order_mismatch: "积木到Python转写时顺序不一致",
  transfer_nesting_mismatch: "积木到Python转写时嵌套或缩进不一致",
};

function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value !== "string") return value as T;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function summaryEvidenceHash(evidence: unknown) {
  return hash({ prompt_version: SUMMARY_PROMPT_VERSION, evidence });
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function readableDiagnosis(code: string) {
  const normalized = code.startsWith("block_") ? code.slice("block_".length) : code;
  return diagnosisLabels[code] || diagnosisLabels[normalized] || "需要继续结合具体作品观察";
}

function isSuccessEvidence(code: string) {
  return code.startsWith("evidence_success_");
}

function cleanText(value: unknown, maxLength = 100) {
  return String(value || "")
    .replace(/([。！？；，])\1+/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanProfileFragment(value: unknown) {
  return cleanText(value, 80)
    .replace(/\b(?:evidence|success|needs support|not observed)(?:[ _-]+[a-z0-9_-]+)*\b/gi, "")
    .replace(/[、，；：。！？]+$/g, "")
    .replace(/^[、，；：。！？]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanList(value: unknown, fallback: string[], maxItems = 2) {
  if (!Array.isArray(value)) return fallback;
  const result = unique(value.map((item) => cleanProfileFragment(item)))
    .filter((item) => item
      && !/^证据(?:不足|仍在积累)/.test(item)
      && !/^(?:未观察到|暂无).*(?:参与|行为|操作|证据)/.test(item))
    .slice(0, maxItems);
  return result.length ? result : fallback;
}

function validateSummary(
  parsed: any,
  fallback: LearningSummaryContent,
  evidence: Awaited<ReturnType<typeof stageEvidence>>,
): LearningSummaryContent | null {
  if (!Array.isArray(parsed?.sentences) || parsed.sentences.length < 4 || parsed.sentences.length > 5) {
    return null;
  }
  const sentences = unique(parsed.sentences.map((item: unknown) => cleanText(item, 110)))
    .filter(Boolean);
  if (sentences.length < 4 || sentences.length > 5) return null;
  const joined = sentences.join("");
  if (/\bevidence(?:[_ -]+(?:success|needs|not|[a-z0-9_-]+))+\b/i.test(joined)) return null;
  if (/\b(?:snapshot|artifact|diagnosis|request)[_-]?[a-z0-9_-]*\b/i.test(joined)) return null;
  if (/初始阶段|被动阶段|主动阶段|建构阶段|互动阶段/.test(joined)) return null;
  if (/性格|聪明|懒惰|动机不足|能力差|成绩/.test(joined)) return null;

  const successes = evidence.attempts.filter((item) => item.result === "target_met").length;
  const failures = evidence.attempts.length - successes;
  if (successes === 0 && /已经掌握|稳定掌握|独立完成|顺利完成/.test(joined)) return null;
  if (failures === 0 && /多次失败|反复失败|持续错误/.test(joined)) return null;

  return {
    ...fallback,
    sentences,
    strengths: cleanList(parsed.strengths, fallback.strengths),
    difficulties: cleanList(parsed.difficulties, fallback.difficulties),
    support_use: cleanText(parsed.support_use || fallback.support_use),
    revision_response: cleanText(parsed.revision_response || fallback.revision_response),
    next_support: cleanText(parsed.next_support || fallback.next_support),
  };
}

function resultOf(detail: Record<string, any>) {
  return String(detail.result || detail.outcome || "");
}

function diagnosisCodes(detail: Record<string, any>) {
  return Array.isArray(detail.diagnostics)
    ? detail.diagnostics.map((item: any) => String(item.code || "")).filter(Boolean)
    : [];
}

async function stageEvidence(userId: string, taskId: number, stage: LearningStage) {
  const [actions] = await pool.query<any[]>(
    `SELECT event_id, action_type, action_detail, timestamp
     FROM user_actions WHERE user_id=? AND task_id=? AND stage=?
     ORDER BY id`,
    [userId, taskId, stage]
  );
  const [snapshots] = await pool.query<any[]>(
    `SELECT snapshot_id, artifact_version, content_hash, diagnostics, semantic_features, created_at
     FROM artifact_snapshots WHERE user_id=? AND task_id=? AND stage=?
     ORDER BY artifact_version`,
    [userId, taskId, stage]
  );
  const [interventions] = await pool.query<any[]>(
    `SELECT intervention_id, diagnosis_code, support_level, outcome, created_at
     FROM agent_interventions WHERE user_id=? AND task_id=? AND stage=? ORDER BY id`,
    [userId, taskId, stage]
  );
  const [messages] = await pool.query<any[]>(
    `SELECT id, role, message_type, created_at FROM chat_messages
     WHERE user_id=? AND task_id=? AND stage=? ORDER BY id`,
    [userId, taskId, stage]
  );
  const attempts = actions
    .filter((item) => ["a_submit", "c_run", "i_run"].includes(item.action_type))
    .map((item) => {
      const detail = parseJson<Record<string, any>>(item.action_detail, {});
      return {
        evidence_id: item.event_id || `action:${item.action_type}:${item.timestamp}`,
        result: resultOf(detail),
        diagnoses: diagnosisCodes(detail),
      };
    });
  const viewedSteps = actions.filter((item) => item.action_type === "subtask_click").length;
  const viewedBlocks = actions.filter((item) => item.action_type === "block_click").length;
  const evidence = {
    task_id: taskId,
    stage,
    exposure: { viewed_steps: viewedSteps, viewed_blocks: viewedBlocks },
    attempts,
    snapshot_versions: snapshots.map((item) => Number(item.artifact_version)),
    snapshot_diagnostics: unique(snapshots.flatMap((item) =>
      parseJson<any[]>(item.diagnostics, []).map((diagnostic) => String(diagnostic.code || ""))
    )),
    support: interventions.map((item) => ({
      evidence_id: item.intervention_id,
      diagnosis: item.diagnosis_code,
      level: Number(item.support_level),
      outcome: item.outcome,
    })),
    dialogue: {
      student_messages: messages.filter((item) => item.role === "user").length,
      assistant_messages: messages.filter((item) => item.role === "assistant").length,
    },
    evidence_ids: unique([
      ...actions.map((item) => item.event_id),
      ...snapshots.map((item) => item.snapshot_id),
      ...interventions.map((item) => item.intervention_id),
    ]),
  };
  return evidence;
}

function deterministicStageSummary(evidence: Awaited<ReturnType<typeof stageEvidence>>): LearningSummaryContent {
  const successes = evidence.attempts.filter((item) => item.result === "target_met").length;
  const failures = evidence.attempts.length - successes;
  const diagnoses = unique([
    ...evidence.attempts.flatMap((item) => item.diagnoses),
    ...evidence.snapshot_diagnostics,
  ]).filter((code) => !isSuccessEvidence(code)).map(readableDiagnosis);
  const usedHighSupport = evidence.support.some((item) => item.level >= 2);
  const adopted = evidence.support.filter((item) => item.outcome === "adopted").length;
  const strengths = successes > 0 ? ["出现了达到任务目标的有效尝试"] : [];
  if (evidence.stage === "P" && evidence.exposure.viewed_steps > 0) strengths.push("主动查看了任务拆解步骤");
  const difficulties = diagnoses.length ? diagnoses : failures > 0 ? ["结果尚未达到任务目标"] : [];
  const supportUse = evidence.support.length === 0
    ? "尚未观察到过程提示使用"
    : `共使用${evidence.support.length}次过程支持${usedHighSupport ? "，其中包含定位或分步支持" : ""}`;
  const revisionResponse = adopted > 0
    ? `已有${adopted}次提示后修正证据`
    : evidence.support.length > 0 ? "提示后的修正结果仍需继续观察" : "尚无提示采纳证据";
  const nextSupport = difficulties.length
    ? `下一阶段优先关注${difficulties[0]}`
    : "下一阶段可减少重复讲解并鼓励独立解释";
  const sentences = [
    evidence.stage === "P"
      ? `在${stageLabels[evidence.stage]}中，学生查看了${evidence.exposure.viewed_steps}个任务步骤和${evidence.exposure.viewed_blocks}个积木说明。`
      : `在${stageLabels[evidence.stage]}中记录了${evidence.attempts.length}次关键尝试，其中${successes}次达到目标。`,
    difficulties.length ? `当前可追溯的主要困难是${difficulties.slice(0, 2).join("、")}。` : "目前没有观察到重复出现的明确困难。",
    `${supportUse}。`,
    `${revisionResponse}。`,
    `${nextSupport}。`,
  ];
  return {
    sentences,
    strengths,
    difficulties,
    support_use: supportUse,
    revision_response: revisionResponse,
    next_support: nextSupport,
    knowledge_components: [],
  };
}

async function polishSummary(evidence: unknown, fallback: LearningSummaryContent) {
  const apiKey = process.env.SUMMARY_AGENT_API_KEY;
  if (!apiKey) return { content: fallback, model: null as string | null };
  try {
    const typedEvidence = evidence as Awaited<ReturnType<typeof stageEvidence>>;
    const model = process.env.SUMMARY_AGENT_MODEL || DEFAULT_SUMMARY_AGENT_MODEL;
    const apiUrl = process.env.SUMMARY_AGENT_API_URL || "https://api.deepseek.com/v1/chat/completions";
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 420,
        response_format: { type: "json_object" },
        messages: [{
          role: "system",
          content: [
            "你是独立的学习过程摘要Agent，只能压缩和改写给定的确定性证据，不能判断成绩、性格、动机或未发生的行为。",
            "输出严格JSON，字段为sentences、strengths、difficulties、support_use、revision_response、next_support。",
            "sentences必须是4至5句简短中文，每句只表达一个事实；其余数组最多2项，字符串不超过80字。",
            "阶段只能称为任务理解、积木练习、代码挑战或拓展互动。不得使用初始阶段、被动阶段、主动阶段、建构阶段或互动阶段。",
            "不要逐次罗列运行流水，不要重复句子，不要使用双标点。没有积极证据时strengths返回空数组，没有明确困难时difficulties返回空数组。",
            `证据：${JSON.stringify(evidence)}`,
          ].join("\n"),
        }],
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return { content: fallback, model: null };
    const payload: any = await response.json();
    const raw = String(payload?.choices?.[0]?.message?.content || "{}").replace(/^```json\s*|\s*```$/g, "");
    const parsed = JSON.parse(raw);
    const validated = validateSummary(parsed, fallback, typedEvidence);
    if (!validated) return { content: fallback, model: null };
    return {
      model,
      content: validated,
    };
  } catch {
    return { content: fallback, model: null };
  }
}

export async function summarizeStageEvidence(
  evidence: Awaited<ReturnType<typeof stageEvidence>>,
) {
  const fallback = deterministicStageSummary(evidence);
  return polishSummary(evidence, fallback);
}

async function latestSummary(userId: string, key: string): Promise<LearningSummaryRecord | null> {
  const [rows] = await pool.query<any[]>(
    `SELECT * FROM learning_summaries WHERE user_id=? AND summary_key=?
     ORDER BY version DESC LIMIT 1`,
    [userId, key]
  );
  if (!rows.length) return null;
  const row = rows[0];
  const evidence = parseJson<any>(row.evidence_json, {});
  return {
    summary_id: row.summary_id,
    scope: row.scope,
    task_id: row.task_id == null ? undefined : Number(row.task_id),
    stage: row.stage || undefined,
    version: Number(row.version),
    evidence_hash: row.evidence_hash,
    evidence_ids: Array.isArray(evidence.evidence_ids) ? evidence.evidence_ids : [],
    content: parseJson(row.summary_json, {} as LearningSummaryContent),
    is_stale: Boolean(row.is_stale),
    created_at: row.created_at,
  };
}

async function storeSummary(args: {
  userId: string;
  scope: LearningSummaryScope;
  key: string;
  taskId?: number;
  stage?: LearningStage;
  evidence: Record<string, unknown>;
  content: LearningSummaryContent;
  model: string | null;
}) {
  const evidenceHash = summaryEvidenceHash(args.evidence);
  const current = await latestSummary(args.userId, args.key);
  if (current?.evidence_hash === evidenceHash) return current;
  const version = (current?.version || 0) + 1;
  await pool.query(
    "UPDATE learning_summaries SET is_stale=1 WHERE user_id=? AND summary_key=? AND is_stale=0",
    [args.userId, args.key]
  );
  const summaryId = uuidv4();
  try {
    await pool.query(
      `INSERT INTO learning_summaries
        (summary_id,user_id,scope,summary_key,task_id,stage,version,evidence_hash,
         evidence_json,summary_json,model_name,prompt_version,is_stale)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0)`,
      [summaryId, args.userId, args.scope, args.key, args.taskId || null, args.stage || null,
        version, evidenceHash, JSON.stringify(args.evidence), JSON.stringify(args.content),
        args.model, SUMMARY_PROMPT_VERSION]
    );
  } catch (error: any) {
    if (error?.code !== "ER_DUP_ENTRY") throw error;
    const winner = await latestSummary(args.userId, args.key);
    if (winner?.evidence_hash !== evidenceHash) return storeSummary(args);
    return winner;
  }
  return latestSummary(args.userId, args.key);
}

function profileContent(label: string, summaries: LearningSummaryRecord[], states: LearnerStateRecord[]): LearningSummaryContent {
  const strengths = unique(summaries.flatMap((item) => item.content.strengths).map(cleanProfileFragment))
    .filter(Boolean)
    .filter((item) => !/^证据(?:不足|仍在积累)/.test(item))
    .slice(0, 2);
  const difficulties = unique([
    ...summaries.flatMap((item) => item.content.difficulties),
    ...states.filter((item) => item.state === "needs_support").map((item) => item.knowledge_component),
  ].map(cleanProfileFragment)).filter(Boolean)
    .filter((item) => !/^证据(?:不足|仍在积累)/.test(item))
    .filter((item) => !/^(?:未观察到|暂无).*(?:参与|行为|操作|证据)/.test(item))
    .slice(0, 2);
  const highSupport = summaries.filter((item) => /定位|分步/.test(item.content.support_use)).length;
  const independent = states.filter((item) => item.independent_success_count > 0).length;
  const nextSupport = difficulties.length
    ? `后续优先支持${difficulties.join("、")}`
    : "后续可逐步减少支架并增加解释和比较";
  return {
    sentences: [
      `${label}已汇总${summaries.length}份有效学习摘要。`,
      strengths.length ? `已观察到的积极证据包括${strengths.join("、")}。` : "当前还没有足够证据概括稳定优势。",
      difficulties.length ? `需要继续关注${difficulties.join("、")}。` : "目前没有发现跨阶段重复出现的明确困难。",
      `共有${independent}个知识点出现独立成功证据，${highSupport}个阶段使用过较强支架。`,
      `${nextSupport}。`,
    ],
    strengths,
    difficulties,
    support_use: highSupport ? `${highSupport}个阶段使用过定位或分步支持` : "以低等级支持或独立尝试为主",
    revision_response: summaries.some((item) => /已有\d+次提示后修正证据|观察到提示后的修正/.test(item.content.revision_response)) ? "观察到提示后的修正" : "当前还没有明确的提示后修正证据",
    next_support: nextSupport,
    knowledge_components: unique(states.map((item) => item.knowledge_component)),
  };
}

const studentAdviceActions: Record<number, string> = {
  1: "试着调换两条示例语句的顺序，再观察输出先后发生了什么变化。",
  2: "换一个简单的变量和值，先预测计算结果，再运行程序核对变量变化。",
  3: "分别输入两个允许的词，比较程序进入的分支和小明到达的位置。",
  4: "先预测循环一轮后的变量值，再逐轮核对往返过程是否符合预期。",
  5: "每轮判断前先记下变量值，再运行程序核对条件选择的方向。",
  6: "先用一句话说清前往、返回、再前往三部分，再逐段检查变量变化。",
};

function deterministicStudentAdvice(
  taskId: number,
  content: LearningSummaryContent,
  evidenceVersion: number,
): StudentLearningAdvice {
  const observedDifficulty = cleanProfileFragment(content.difficulties[0]);
  return {
    achieved: "你已经用Python程序达到本任务目标，并完成了从积木到代码的转换。",
    focus: observedDifficulty
      ? `下一步重点留意${observedDifficulty}，修改后再用运行结果核对。`
      : "下一步继续留意积木结构与Python语句在顺序和嵌套上的对应关系。",
    action: studentAdviceActions[taskId] || "先预测程序运行结果，再运行一次并比较自己的预测。",
    evidence_version: evidenceVersion,
  };
}

function validateStudentAdvice(value: unknown, fallback: StudentLearningAdvice): StudentLearningAdvice | null {
  const candidate = value as Partial<StudentLearningAdvice> | null;
  if (!candidate) return null;
  const advice = {
    achieved: cleanText(candidate.achieved, 52),
    focus: cleanText(candidate.focus, 52),
    action: cleanText(candidate.action, 52),
    evidence_version: fallback.evidence_version,
  };
  const joined = `${advice.achieved}${advice.focus}${advice.action}`;
  if (!advice.achieved || !advice.focus || !advice.action) return null;
  if (joined.length < 55 || joined.length > 150) return null;
  if (/[_a-z]+_[a-z_]+|诊断码|画像|掌握度|尝试\d*次|错误\d*次|分数|排名|标准答案|快照|哈希|证据ID/i.test(joined)) return null;
  if (/```|\b(?:print|input|range)\s*\(|\b(?:if|for)\s+/.test(joined)) return null;
  return advice;
}

async function polishStudentAdvice(
  taskId: number,
  evidence: Record<string, unknown>,
  fallback: StudentLearningAdvice,
) {
  const apiKey = process.env.SUMMARY_AGENT_API_KEY;
  if (!apiKey) return { advice: fallback, model: null as string | null };
  try {
    const model = process.env.SUMMARY_AGENT_MODEL || DEFAULT_SUMMARY_AGENT_MODEL;
    const response = await fetch(process.env.SUMMARY_AGENT_API_URL || "https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 220,
        response_format: { type: "json_object" },
        messages: [{
          role: "system",
          content: [
            "你负责把确定性学习证据整理成面向初一学生的本任务学习小结。",
            "只输出JSON对象，字段为achieved、focus、action。每项一句话，三项总计约80至120个汉字。",
            "只确认已有证据支持的成果，每次只突出一个问题，并给出一个立即可做的练习动作。",
            "禁止出现分数、排名、画像、掌握度、尝试或错误次数、内部代号、诊断码、标准答案和完整代码。",
            `任务编号：${taskId}`,
            `确定性备选小结：${JSON.stringify(fallback)}`,
            `证据摘要：${JSON.stringify(evidence)}`,
          ].join("\n"),
        }],
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return { advice: fallback, model: null };
    const payload: any = await response.json();
    const raw = String(payload?.choices?.[0]?.message?.content || "{}").replace(/^```json\s*|\s*```$/g, "");
    const validated = validateStudentAdvice(JSON.parse(raw), fallback);
    return validated ? { advice: validated, model } : { advice: fallback, model: null };
  } catch {
    return { advice: fallback, model: null };
  }
}

export async function summarizeStudentAdvice(
  taskId: number,
  content: LearningSummaryContent,
  evidenceVersion: number,
  evidence: Record<string, unknown>,
) {
  const fallback = deterministicStudentAdvice(taskId, content, evidenceVersion);
  return polishStudentAdvice(taskId, evidence, fallback);
}

export async function refreshLearningProfiles(userId: string, taskId: number, stage?: LearningStage) {
  if (stage) {
    const evidence = await stageEvidence(userId, taskId, stage);
    const key = `task:${taskId}:stage:${stage}`;
    const current = await latestSummary(userId, key);
    if (current?.evidence_hash !== summaryEvidenceHash(evidence)) {
      const polished = await summarizeStageEvidence(evidence);
      await storeSummary({
        userId, scope: "stage", key, taskId, stage,
        evidence, content: polished.content, model: polished.model,
      });
    }
  }

  const stageSummaries = (await Promise.all(stages.map((item) =>
    latestSummary(userId, `task:${taskId}:stage:${item}`)
  ))).filter((item): item is LearningSummaryRecord => Boolean(item && !item.is_stale));
  const states = await getLearnerStates(userId);
  const taskStates = states.filter((item) => Number(item.last_task_id) === taskId);
  const taskState = await getStudentTaskState(userId, taskId);
  const taskEvidence = {
    evidence_ids: unique(stageSummaries.flatMap((item) => [item.summary_id, ...item.evidence_ids])),
    stage_summaries: stageSummaries.map((item) => ({ id: item.summary_id, stage: item.stage, version: item.version, content: item.content })),
    learner_states: taskStates,
    c_completed: Boolean(taskState?.c_completed),
  };
  const taskContent = profileContent("本任务", stageSummaries, taskStates);
  let taskModel: string | null = null;
  if (taskState?.c_completed) {
    const evidenceVersion = stageSummaries.reduce((total, item) => total + item.version, 0);
    const polished = await summarizeStudentAdvice(taskId, taskContent, evidenceVersion, taskEvidence);
    taskContent.student_advice = polished.advice;
    taskModel = polished.model;
  }
  await storeSummary({
    userId, scope: "task", key: `task:${taskId}`, taskId,
    evidence: taskEvidence, content: taskContent, model: taskModel,
  });

  const [taskRows] = await pool.query<any[]>("SELECT id FROM tasks ORDER BY sort_order");
  const taskProfiles = (await Promise.all(taskRows.map((row) => latestSummary(userId, `task:${Number(row.id)}`))))
    .filter((item): item is LearningSummaryRecord => Boolean(item && !item.is_stale));
  const courseEvidence = {
    evidence_ids: unique(taskProfiles.flatMap((item) => [item.summary_id, ...item.evidence_ids])),
    task_profiles: taskProfiles.map((item) => ({ id: item.summary_id, task_id: item.task_id, version: item.version, content: item.content })),
    learner_states: states,
  };
  await storeSummary({
    userId, scope: "course", key: "course", evidence: courseEvidence,
    content: profileContent("六个任务", taskProfiles, states), model: null,
  });
}

const pendingRefreshes = new Map<string, Promise<void>>();

export function queueLearningProfileRefresh(userId: string, taskId: number, stage?: LearningStage) {
  const key = `${userId}:${taskId}:${stage || "task"}`;
  if (pendingRefreshes.has(key)) return;
  const pending = new Promise<void>((resolve) => setTimeout(resolve, 0))
    .then(() => refreshLearningProfiles(userId, taskId, stage))
    .catch((error) => console.error("Learning profile refresh failed:", error))
    .finally(() => pendingRefreshes.delete(key));
  pendingRefreshes.set(key, pending);
}

export async function getLearningProfileBundle(userId: string, taskId: number, stage?: LearningStage) {
  return {
    stage_summary: stage ? await latestSummary(userId, `task:${taskId}:stage:${stage}`) : null,
    task_profile: await latestSummary(userId, `task:${taskId}`),
    course_profile: await latestSummary(userId, "course"),
  };
}

export async function getTeacherLearningProfiles(userId: string) {
  const [rows] = await pool.query<any[]>(
    `SELECT * FROM learning_summaries
     WHERE user_id=? AND is_stale=0
     ORDER BY COALESCE(task_id,0), FIELD(stage,'P','A','C','I'), version DESC`,
    [userId]
  );
  const seen = new Set<string>();
  const summaries: LearningSummaryRecord[] = [];
  for (const row of rows) {
    if (seen.has(row.summary_key)) continue;
    seen.add(row.summary_key);
    const evidence = parseJson<any>(row.evidence_json, {});
    summaries.push({
      summary_id: row.summary_id,
      scope: row.scope,
      task_id: row.task_id == null ? undefined : Number(row.task_id),
      stage: row.stage || undefined,
      version: Number(row.version),
      evidence_hash: row.evidence_hash,
      evidence_ids: Array.isArray(evidence.evidence_ids) ? evidence.evidence_ids : [],
      content: parseJson(row.summary_json, {} as LearningSummaryContent),
      is_stale: false,
      created_at: row.created_at,
    });
  }
  return {
    course_profile: summaries.find((item) => item.scope === "course") || null,
    task_profiles: summaries.filter((item) => item.scope === "task"),
    stage_summaries: summaries.filter((item) => item.scope === "stage"),
  };
}

const focusLabels: Record<string, string> = {
  sequential_execution: "顺序执行",
  print_text: "输出与文本",
  block_connection: "积木连接",
  variable_assignment: "变量赋值",
  variable_reading: "变量读取",
  arithmetic: "加减运算",
  input: "输入",
  text_comparison: "文本比较",
  if_else: "条件分支",
  for_range: "循环次数",
  indentation: "缩进与嵌套",
  coordinates: "二维坐标",
  block_to_python: "积木到Python迁移",
  python_syntax: "Python语法",
};

const readableFocusLabels: Record<string, string> = {
  sequence_execution: "顺序执行",
  print_text: "输出与文本",
  block_connection: "积木连接",
  variable_assignment: "变量赋值",
  variable_read: "变量读取",
  arithmetic_add_subtract: "加减运算",
  input_string: "输入",
  text_comparison: "文本比较",
  if_else: "条件分支",
  for_range: "循环次数",
  indentation: "Python缩进",
  structure_nesting: "结构嵌套",
  coordinate_xy: "二维坐标",
  blocks_to_python_transfer: "积木到Python迁移",
};

export function selectSupportStrategy(args: {
  stage: LearningStage;
  diagnostics: Array<{ knowledge_components: string[]; severity: string }>;
  learnerStates: LearnerStateRecord[];
  taskProfile: LearningSummaryRecord | null;
  courseProfile: LearningSummaryRecord | null;
}): SupportStrategy {
  const diagnosticComponents = unique(args.diagnostics.flatMap((item) => item.knowledge_components));
  const persistent = args.learnerStates
    .filter((item) => item.state === "needs_support")
    .sort((a, b) => b.error_count - a.error_count)
    .map((item) => item.knowledge_component);
  const profileDifficulties = unique([
    ...(args.taskProfile?.content.difficulties || []),
    ...(args.courseProfile?.content.difficulties || []),
  ]);
  const candidates = unique([...diagnosticComponents, ...persistent, ...profileDifficulties]);
  const label = (value: string | undefined) => value ? readableFocusLabels[value] || focusLabels[value] || value : "当前任务目标";
  const level = args.diagnostics.some((item) => item.severity === "blocking") ? 2 : 1;
  return {
    stage: args.stage,
    primary_focus: label(candidates[0]),
    secondary_focus: candidates[1] ? label(candidates[1]) : undefined,
    interaction_mode: args.stage === "P" ? "explain" : args.stage === "A" ? "locate" : args.stage === "C" ? "coach" : "co_construct",
    support_level: level,
    require_prediction: args.stage === "I" && !args.learnerStates.some((item) => item.state === "needs_support"),
    evidence_ids: unique([
      ...(args.taskProfile?.evidence_ids || []),
      ...(args.courseProfile?.evidence_ids || []),
    ]).slice(-20),
  };
}
