import assert from "node:assert/strict";
import "dotenv/config";
import { summarizeStageEvidence, summarizeStudentAdvice } from "../services/learningProfiles";
import { generateTeacherAdvice } from "../services/teacherAdvice";
import { containsInternalTerms } from "../services/evidenceLanguage";
import { buildCollaborationOpening, collaborationReplyViolation } from "../services/collaborationSupport";

const evidence = {
  task_id: 2,
  stage: "A" as const,
  exposure: { viewed_steps: 0, viewed_blocks: 0 },
  attempts: [
    { evidence_id: "attempt-1", result: "target_mismatch", diagnoses: ["wrong_order"] },
    { evidence_id: "attempt-2", result: "target_met", diagnoses: [] },
  ],
  snapshot_versions: [1, 2],
  snapshot_diagnostics: ["wrong_order"],
  support: [{ evidence_id: "hint-1", diagnosis: "wrong_order", level: 2, outcome: "adopted" }],
  dialogue: { student_messages: 1, assistant_messages: 1 },
  evidence_ids: ["attempt-1", "attempt-2", "hint-1"],
};

function validate(content: Awaited<ReturnType<typeof summarizeStageEvidence>>["content"]) {
  assert.ok(content.sentences.length >= 4 && content.sentences.length <= 5);
  assert.equal(new Set(content.sentences).size, content.sentences.length);
  assert.doesNotMatch(content.sentences.join(""), /初始阶段|被动阶段|主动阶段|双标点|。。|，，/);
  assert.doesNotMatch(content.strengths.join(""), /^证据不足/);
}

async function main() {
  const originalKey = process.env.SUMMARY_AGENT_API_KEY;
  const originalUrl = process.env.SUMMARY_AGENT_API_URL;

  delete process.env.SUMMARY_AGENT_API_KEY;
  const noKey = await summarizeStageEvidence(evidence);
  assert.equal(noKey.model, null);
  validate(noKey.content);

  process.env.SUMMARY_AGENT_API_KEY = originalKey;
  process.env.SUMMARY_AGENT_API_URL = "http://127.0.0.1:1/unavailable";
  const failed = await summarizeStageEvidence(evidence);
  assert.equal(failed.model, null);
  validate(failed.content);

  delete process.env.SUMMARY_AGENT_API_KEY;
  const studentAdviceFallback = await summarizeStudentAdvice(2, {
    sentences: [],
    strengths: ["已经达到任务目标"],
    difficulties: ["变量读取"],
    support_use: "以独立尝试为主",
    revision_response: "已完成修正",
    next_support: "继续观察变量变化",
    knowledge_components: [],
  }, 3, { c_completed: true });
  assert.equal(studentAdviceFallback.model, null);
  assert.equal(studentAdviceFallback.advice.evidence_version, 3);
  assert.match(studentAdviceFallback.advice.achieved, /达到本任务目标/);
  assert.doesNotMatch(JSON.stringify(studentAdviceFallback.advice), /分数|排名|画像|尝试\d*次|print_text|标准答案/);

  process.env.SUMMARY_AGENT_API_URL = originalUrl;
  if (originalKey) {
    process.env.SUMMARY_AGENT_API_KEY = originalKey;
    const live = await summarizeStageEvidence(evidence);
    validate(live.content);
    assert.equal(typeof live.model, "string", "Configured summary Agent should return a validated model summary");
  }

  const originalSummaryKey = process.env.SUMMARY_AGENT_API_KEY;
  const originalStudentKey = process.env.DEEPSEEK_API_KEY;
  delete process.env.SUMMARY_AGENT_API_KEY;
  process.env.DEEPSEEK_API_KEY = "student-agent-key-must-not-be-used";
  const teacherFallback = await generateTeacherAdvice({
    id: 1,
    title: "顺序执行与输出",
    a_completed: true,
    c_completed: false,
    attempt_count: 3,
    hint_count: 1,
    difficulties: [{ code: "missing_input", count: 2 }],
    attempts: [],
    interventions: [],
    learner_states: [{ knowledge_component: "print_text", state: "needs_support" }],
  });
  assert.equal(teacherFallback.source, "deterministic_fallback");
  assert.doesNotMatch(JSON.stringify(teacherFallback.content), /print_text|sequence_execution/);
  assert.equal(containsInternalTerms([
    ...teacherFallback.content.strengths,
    teacherFallback.content.difficulty,
    teacherFallback.content.transfer,
    teacherFallback.content.support,
    teacherFallback.content.next_step,
  ].join(" ")), false);

  const badFetch = (async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: JSON.stringify({
      strengths: ["掌握print_text"], difficulty: "sequence_execution不足",
      transfer: "artifact_hash正常", support: "暂无", next_step: "继续",
    }) } }] }),
  })) as unknown as typeof fetch;
  process.env.SUMMARY_AGENT_API_KEY = "summary-test-key";
  const invalidModelAdvice = await generateTeacherAdvice({
    id: 1, title: "顺序执行与输出", difficulties: [], attempts: [], interventions: [], learner_states: [],
  }, badFetch);
  assert.equal(invalidModelAdvice.source, "deterministic_fallback");

  const packet = {
    task_and_stage: { task_id: 1 },
    previous_stage_summary: { latest_relevant_attempt: { result: "target_met" } },
  };
  const opening = buildCollaborationOpening(packet);
  assert.match(opening, /第四句话/);
  assert.equal(collaborationReplyViolation(opening), null);
  assert.equal(collaborationReplyViolation("共有8次运行：第1次运行成功，第2次运行出错。你准备怎么办？"), "attempt_count");
  assert.equal(collaborationReplyViolation("你先做什么？然后怎么验证？"), "multiple_questions");

  process.env.SUMMARY_AGENT_API_KEY = originalSummaryKey;
  process.env.DEEPSEEK_API_KEY = originalStudentKey;

  console.log("Summary agent, teacher advice, and collaboration validation passed." );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
