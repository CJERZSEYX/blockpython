import { createHash } from "crypto";
import { XMLParser } from "fast-xml-parser";
import pool from "../config/database";
import { getTeacherLearningProfiles } from "./learningProfiles";
import { readableKnowledgeComponent, sanitizeLearningSummaryRecord, sanitizeTeacherAdviceContent } from "./evidenceLanguage";

const stageLabels: Record<string, string> = {
  P: "任务分解",
  A: "积木练习",
  C: "代码挑战",
  I: "拓展互动",
};

const resultLabels: Record<string, string> = {
  target_met: "达到任务目标",
  target_mismatch: "程序可运行，但结果未达到目标",
  invalid_structure: "积木结构尚不完整",
  syntax_error: "Python语法有误",
  runtime_error: "程序运行中出错",
  timeout: "程序运行超时",
  cancelled: "本次运行已取消",
};

const blockLabels: Record<string, string> = {
  controls_if: "条件积木",
  controls_repeat_ext: "循环积木",
  variables_set: "变量赋值积木",
  variables_get: "变量读取积木",
  math_number: "数字积木",
  math_arithmetic: "运算积木",
  logic_compare: "比较积木",
  text_print: "输出积木",
  sensing_ask: "询问积木",
  text: "文本积木",
  text_join: "文本拼接积木",
};

const diagnosisLabels: Record<string, string> = {
  empty_workspace: "积木工作区为空",
  block_missing_input: "积木缺少必要输入",
  missing_input: "积木缺少必要输入",
  floating_blocks: "存在未连接到主程序的积木",
  empty_statement: "控制结构内部缺少要执行的积木",
  invalid_variable: "变量名称不符合Python规则",
  syntax_error: "Python语法有误",
  runtime_error: "程序运行中出错",
  logic_target_mismatch: "运行结果与任务目标不一致",
  transfer_missing_statement: "从积木转写到Python时遗漏了语句",
  transfer_order_mismatch: "Python语句顺序与积木不一致",
  transfer_structure_mismatch: "条件或循环结构的转写不一致",
};

const eventLabels: Record<string, string> = {
  task_open: "打开任务",
  task_exit: "离开任务",
  stage_enter: "进入阶段",
  stage_exit: "离开阶段",
  subtask_click: "查看任务步骤",
  block_click: "查看积木说明",
  a_hint_request: "请求积木提示",
  c_hint_request: "请求代码提示",
  a_workspace_reset: "清空积木工作区",
  a_submit: "提交积木程序",
  c_run: "运行Python代码",
  i_run: "运行拓展代码",
  i_collab_start: "开始拓展讨论",
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  isArray: (name) => ["block", "value", "statement", "next"].includes(name),
});

function parseJson(value: unknown, fallback: any = {}) {
  if (value == null) return fallback;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function humanDuration(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds === 0) return "暂无有效时长";
  if (seconds < 60) return `${seconds}秒`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}分${rest}秒` : `${minutes}分钟`;
}

function blockDescriptors(xml: string) {
  const descriptors: Array<{ id: string; type: string; label: string }> = [];
  const counts: Record<string, number> = {};
  let parsed: any;
  try { parsed = parser.parse(xml); } catch { return descriptors; }
  const visit = (block: any) => {
    if (!block) return;
    counts[block.type] = (counts[block.type] || 0) + 1;
    const base = blockLabels[block.type] || "积木";
    descriptors.push({ id: String(block.id || ""), type: block.type, label: `第${counts[block.type]}个${base}` });
    for (const value of block.value || []) visit(value.block?.[0]);
    for (const statement of block.statement || []) visit(statement.block?.[0]);
    visit(block.next?.[0]?.block?.[0]);
  };
  for (const root of parsed?.xml?.block || []) visit(root);
  return descriptors;
}

function diagnosticsOf(detail: Record<string, any>) {
  return Array.isArray(detail.diagnostics) ? detail.diagnostics : [];
}

function problemLocation(detail: Record<string, any>) {
  if (detail.error_line) return `Python第${detail.error_line}行`;
  const diagnostic = diagnosticsOf(detail)[0];
  const blockId = diagnostic?.block_id || detail.block_id;
  if (!blockId) return "整体运行结果";
  const xml = String(detail.blockly_xml || detail.xml || "");
  const block = blockDescriptors(xml).find((item) => item.id === String(blockId));
  return block?.label || "相关积木";
}

function diagnosisText(detail: Record<string, any>, result: string) {
  const messages = diagnosticsOf(detail).map((item: any) =>
    String(item.message || diagnosisLabels[item.code] || "")
  ).filter(Boolean);
  if (messages.length) return [...new Set(messages)].join("；");
  return resultLabels[result] || "已记录本次结果";
}

function eventSummary(action: any) {
  const detail = parseJson(action.action_detail);
  switch (action.action_type) {
    case "task_open": return "进入本任务开始学习";
    case "task_exit": return action.duration_ms ? `本次在任务中停留约${humanDuration(Number(action.duration_ms))}` : "离开本任务";
    case "stage_enter": return `进入${stageLabels[action.stage] || action.stage}`;
    case "stage_exit": return action.duration_ms ? `在${stageLabels[action.stage] || action.stage}停留约${humanDuration(Number(action.duration_ms))}` : `离开${stageLabels[action.stage] || action.stage}`;
    case "subtask_click": return `查看步骤：${detail.subtask_title || "任务步骤"}`;
    case "block_click": return `查看${blockLabels[String(detail.block_type)] || "积木"}的对应关系`;
    case "a_hint_request":
    case "c_hint_request": return "主动向学习助手请求提示";
    case "a_workspace_reset": return "清空积木工作区，重新搭建";
    case "i_collab_start": return "开始规划拓展任务并与学习助手讨论";
    case "a_submit":
    case "c_run":
    case "i_run": {
      const result = String(detail.result || detail.outcome || "");
      const resultLabel = resultLabels[result] || "完成一次运行";
      const diagnosis = diagnosisText(detail, result);
      return diagnosis === resultLabel ? resultLabel : `${resultLabel}；${diagnosis}`;
    }
    default: return "";
  }
}

function meaningfulTimeline(actions: any[]) {
  // Stage duration is already summarized in the overview. Keeping every
  // enter/exit pair here makes a teacher hunt through navigation noise.
  const allowed = new Set(Object.keys(eventLabels).filter((type) =>
    !["task_open", "task_exit", "stage_enter", "stage_exit"].includes(type)
  ));
  return actions.filter((action) => allowed.has(action.action_type)).map((action) => ({
    id: action.id,
    timestamp: action.timestamp,
    stage: action.stage,
    stage_label: stageLabels[action.stage] || "平台",
    title: eventLabels[action.action_type] || action.action_type,
    summary: eventSummary(action),
    duration_ms: ["stage_exit", "task_exit"].includes(action.action_type) ? action.duration_ms : null,
  })).filter((item) => item.summary);
}

function latestEvidenceAt(rows: any[]) {
  const values = rows.map((row) => new Date(row.timestamp || row.created_at || row.updated_at || 0).getTime());
  const latest = Math.max(0, ...values.filter(Number.isFinite));
  return latest ? new Date(latest).toISOString() : null;
}

export async function buildTeacherStudentReport(studentId: string) {
  const [students] = await pool.query<any[]>("SELECT id, name, created_at FROM users WHERE id=? AND role='student'", [studentId]);
  if (!students.length) return null;
  const [tasks] = await pool.query<any[]>("SELECT id,title,description,sort_order FROM tasks ORDER BY sort_order");
  const [actions] = await pool.query<any[]>(
    `SELECT a.*, t.title AS task_title FROM user_actions a LEFT JOIN tasks t ON t.id=a.task_id
     WHERE a.user_id=? ORDER BY a.timestamp,a.id`, [studentId]
  );
  const [messages] = await pool.query<any[]>(
    `SELECT c.id,c.task_id,c.stage,c.role,c.content,c.message_type,c.created_at,t.title AS task_title
     FROM chat_messages c LEFT JOIN tasks t ON t.id=c.task_id WHERE c.user_id=? ORDER BY c.created_at,c.id`, [studentId]
  );
  const [states] = await pool.query<any[]>("SELECT * FROM learner_states WHERE user_id=? ORDER BY knowledge_component", [studentId]);
  const [taskStates] = await pool.query<any[]>("SELECT * FROM student_task_states WHERE user_id=?", [studentId]);
  const [interventions] = await pool.query<any[]>("SELECT * FROM agent_interventions WHERE user_id=? ORDER BY created_at,id", [studentId]);
  const [reports] = await pool.query<any[]>(
    `SELECT r.* FROM teacher_evidence_reports r JOIN (
       SELECT task_id,MAX(id) id FROM teacher_evidence_reports WHERE student_id=? GROUP BY task_id
     ) latest ON latest.id=r.id`, [studentId]
  );
  const learningProfiles = await getTeacherLearningProfiles(studentId);

  const taskReports = tasks.map((task) => {
    const taskActions = actions.filter((item) => Number(item.task_id) === Number(task.id));
    const taskMessages = messages.filter((item) => Number(item.task_id) === Number(task.id));
    const taskInterventions = interventions.filter((item) => Number(item.task_id) === Number(task.id));
    const taskState = taskStates.find((item) => Number(item.task_id) === Number(task.id));
    const attempts = taskActions.filter((item) => ["a_submit", "c_run", "i_run"].includes(item.action_type)).map((action) => {
      const detail = parseJson(action.action_detail);
      const result = String(detail.result || detail.outcome || "");
      return {
        id: action.id,
        timestamp: action.timestamp,
        stage: action.stage,
        stage_label: stageLabels[action.stage] || action.stage,
        result,
        result_label: resultLabels[result] || result,
        location: problemLocation(detail),
        diagnosis: diagnosisText(detail, result),
        blockly_xml: action.stage === "A" ? String(detail.blockly_xml || detail.xml || "") : "",
        highlighted_block_id: diagnosticsOf(detail)[0]?.block_id || detail.block_id || null,
        generated_code: action.stage === "A" ? String(detail.generated_code || "") : "",
        code: action.stage === "C" || action.stage === "I" ? String(detail.code || "") : "",
        input: String(detail.stdin || detail.input || ""),
        stdout: String(detail.stdout || ""),
      };
    });
    const activeByStage: Record<string, number> = { P: 0, A: 0, C: 0, I: 0 };
    for (const action of taskActions.filter((item) => item.action_type === "active_learning_slice")) {
      activeByStage[action.stage] = (activeByStage[action.stage] || 0) + Number(action.duration_ms || 0);
    }
    const historicalByStage: Record<string, number> = { P: 0, A: 0, C: 0, I: 0 };
    for (const action of taskActions.filter((item) => item.action_type === "stage_exit")) {
      historicalByStage[action.stage] = (historicalByStage[action.stage] || 0) + Number(action.duration_ms || 0);
    }
    const difficultyCounts = new Map<string, number>();
    for (const attempt of attempts.filter((item) => item.result !== "target_met")) {
      difficultyCounts.set(attempt.diagnosis, (difficultyCounts.get(attempt.diagnosis) || 0) + 1);
    }
    const difficulties = [...difficultyCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([label, count]) => ({ label, count }));
    const evidenceUpdatedAt = latestEvidenceAt([...taskActions, ...taskMessages, ...taskInterventions]);
    const latestReport = reports.find((item) => Number(item.task_id) === Number(task.id));
    return {
      id: Number(task.id),
      title: task.title,
      description: task.description,
      active_time_ms: Object.values(activeByStage).reduce((sum, value) => sum + value, 0),
      active_time_label: humanDuration(Object.values(activeByStage).reduce((sum, value) => sum + value, 0)),
      stage_times: Object.entries(activeByStage).map(([stage, value]) => ({
        stage, label: stageLabels[stage], active_ms: value, active_label: humanDuration(value),
        historical_ms: historicalByStage[stage] || 0,
      })),
      a_completed: Boolean(taskState?.a_completed_at),
      c_completed: Boolean(taskState?.c_completed_at),
      attempt_count: attempts.length,
      hint_count: taskActions.filter((item) => ["a_hint_request", "c_hint_request"].includes(item.action_type)).length,
      difficulties,
      timeline: meaningfulTimeline(taskActions),
      attempts,
      conversations: taskMessages.map((item) => ({
        id: item.id, stage: item.stage, stage_label: stageLabels[item.stage] || item.stage,
        role: item.role, content: item.content, created_at: item.created_at,
      })),
      interventions: taskInterventions.map((item) => ({
        id: item.intervention_id,
        stage: item.stage,
        stage_label: stageLabels[item.stage] || item.stage,
        created_at: item.created_at,
        trigger_label: item.trigger_type === "hint_request" ? "学生主动求助" : item.trigger_type === "run_feedback" ? "运行后过程支持" : "学习过程支持",
        support_label: item.support_level >= 3 ? "分步策略" : item.support_level === 2 ? "定位提示" : "概念提醒",
        diagnosis: diagnosisLabels[item.diagnosis_code] || "需要过程支持",
        message: item.message || "",
        outcome_label: item.outcome === "adopted" ? "学生随后解决了问题" : item.outcome === "partially_adopted" ? "学生修改了相关位置，问题仍存在" : item.outcome === "ignored" ? "后续修改未涉及提示位置" : "提示后暂无可观察操作",
      })),
      learner_states: states.filter((item) => Number(item.last_task_id) === Number(task.id)).map((item) => ({
        knowledge_component: readableKnowledgeComponent(item.knowledge_component),
        state: item.state,
        success_count: Number(item.success_count || 0),
        error_count: Number(item.error_count || 0),
      })),
      evidence_updated_at: evidenceUpdatedAt,
      latest_advice: latestReport ? {
        report_id: latestReport.report_id,
        created_at: latestReport.created_at,
        content: sanitizeTeacherAdviceContent(parseJson(latestReport.report_json)),
        stale: Boolean(evidenceUpdatedAt && latestReport.evidence_updated_at && new Date(evidenceUpdatedAt) > new Date(latestReport.evidence_updated_at)),
      } : null,
      stage_summaries: learningProfiles.stage_summaries
        .filter((item) => Number(item.task_id) === Number(task.id))
        .map(sanitizeLearningSummaryRecord),
      task_profile: sanitizeLearningSummaryRecord(
        learningProfiles.task_profiles.find((item) => Number(item.task_id) === Number(task.id)) || null
      ),
    };
  });
  return {
    student: students[0],
    total_active_time_ms: taskReports.reduce((sum, item) => sum + item.active_time_ms, 0),
    total_active_time_label: humanDuration(taskReports.reduce((sum, item) => sum + item.active_time_ms, 0)),
    last_activity: latestEvidenceAt(actions),
    course_profile: sanitizeLearningSummaryRecord(learningProfiles.course_profile),
    tasks: taskReports,
  };
}

export function evidenceHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
