import { containsInternalTerms, readableDiagnosis, readableKnowledgeComponent, sanitizeTeacherAdviceContent } from "./evidenceLanguage";

export type TeacherAdviceSource = "summary_agent" | "deterministic_fallback";

function readableEvidence(task: any) {
  return {
    task: { id: task.id, title: task.title },
    active_time: task.active_time_label,
    goals: { blockly: Boolean(task.a_completed), python: Boolean(task.c_completed) },
    attempt_count: Number(task.attempt_count || 0),
    hint_count: Number(task.hint_count || 0),
    difficulties: (task.difficulties || []).map((item: any) => ({
      description: readableDiagnosis(item.code || item.label),
      count: Number(item.count || 0),
    })),
    attempts: (task.attempts || []).slice(-8).map((item: any) => ({
      stage: item.stage_label,
      result: item.result_label,
      location: item.location,
      diagnosis: readableDiagnosis(item.diagnosis_code || item.diagnosis),
    })),
    support: (task.interventions || []).slice(-8).map((item: any) => ({
      stage: item.stage_label,
      reason: item.trigger_label,
      level: item.support_label,
      response: item.outcome_label,
    })),
    learning_evidence: (task.learner_states || []).map((item: any) => ({
      knowledge: readableKnowledgeComponent(item.knowledge_component),
      observation: String(item.state_label || item.state || "证据仍在积累"),
    })),
  };
}

function fallbackAdvice(task: any) {
  const difficulties = (task.difficulties || []).slice(0, 2)
    .map((item: any) => readableDiagnosis(item.code || item.label));
  const successful = Boolean(task.a_completed || task.c_completed);
  const strengths = successful
    ? [task.c_completed ? "能够完成积木到Python的转写并达到任务目标。" : "能够通过积木程序达到本次任务目标。"]
    : [];
  return sanitizeTeacherAdviceContent({
    strengths,
    difficulty: difficulties.length ? `当前主要困难是${difficulties.join("和")}。` : "当前证据不足，尚不能确定稳定困难。",
    transfer: task.c_completed
      ? "已有代码挑战达到目标的证据，可继续观察其独立迁移是否稳定。"
      : task.a_completed
        ? "积木练习已达到目标，仍需观察其能否独立转写为Python。"
        : "当前缺少足够的积木到Python迁移证据。",
    support: Number(task.hint_count || 0) > 0
      ? `学习过程中使用了${Number(task.hint_count)}次主动求助，可结合后续修正情况判断提示依赖。`
      : "当前未观察到主动求助记录。",
    next_step: difficulties.length
      ? `下一步可围绕${difficulties[0]}安排一个短练习，并观察学生能否独立修正。`
      : "下一步可继续收集学生独立搭建、转写和修正的过程证据。",
  });
}

function validAdvice(content: any) {
  if (!content || !Array.isArray(content.strengths) || content.strengths.length > 2) return false;
  const fields = [...content.strengths, content.difficulty, content.transfer, content.support, content.next_step];
  return fields.every((item) => typeof item === "string" && item.length <= 140 && !containsInternalTerms(item));
}

function rawAdviceContainsInternalTerms(content: any) {
  const fields = [
    ...(Array.isArray(content?.strengths) ? content.strengths : []),
    content?.difficulty,
    content?.transfer,
    content?.support,
    content?.next_step,
  ];
  return fields.some(containsInternalTerms);
}

async function callSummaryAgent(prompt: string, fetchImpl: typeof fetch) {
  const apiKey = process.env.SUMMARY_AGENT_API_KEY;
  if (!apiKey) throw new Error("summary agent key is not configured");
  const apiUrl = process.env.SUMMARY_AGENT_API_URL || "https://api.deepseek.com/chat/completions";
  const model = process.env.SUMMARY_AGENT_MODEL || "deepseek-chat";
  const response = await fetchImpl(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: prompt }],
      temperature: 0.15,
      max_tokens: 420,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(12000),
  });
  const payload: any = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || "summary agent request failed");
  const raw = String(payload?.choices?.[0]?.message?.content || "{}").replace(/^```json\s*|\s*```$/g, "");
  return { parsed: JSON.parse(raw), model };
}

export async function generateTeacherAdvice(task: any, fetchImpl: typeof fetch = fetch) {
  const evidence = readableEvidence(task);
  const fallback = fallbackAdvice(task);
  const basePrompt = [
    "你是后端学习证据摘要Agent，负责为信息技术教师整理初一学生的Python学习证据。",
    "只依据确定性证据，不推测性格、能力或动机，不评分，不参与任务通过判断。",
    "使用教师可理解的教学术语，禁止出现内部代号、下划线英文标识、积木ID、哈希、XML、JSON、请求编号或提示词版本。",
    "输出严格JSON，字段为strengths（最多2项数组）、difficulty、transfer、support、next_step；每项不超过80个汉字。",
    `学习证据：${JSON.stringify(evidence)}`,
  ].join("\n");
  try {
    let response = await callSummaryAgent(basePrompt, fetchImpl);
    let advice = sanitizeTeacherAdviceContent(response.parsed);
    if (rawAdviceContainsInternalTerms(response.parsed) || !validAdvice(advice)) {
      response = await callSummaryAgent(`${basePrompt}\n上一版包含内部代号或不可追溯结论。请只用中文教学术语重写。`, fetchImpl);
      advice = sanitizeTeacherAdviceContent(response.parsed);
    }
    if (rawAdviceContainsInternalTerms(response.parsed) || !validAdvice(advice)) throw new Error("invalid teacher advice");
    return { content: advice, source: "summary_agent" as const, model: response.model, evidence };
  } catch {
    return { content: fallback, source: "deterministic_fallback" as const, model: null, evidence };
  }
}

export const TEACHER_ADVICE_PROMPT_VERSION = "teacher-evidence-advice-v2";
