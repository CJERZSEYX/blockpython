import { createHash } from "crypto";
import pool from "../config/database";
import type { IDialoguePhase, IDialogueState } from "./agentTypes";

function parseArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch { return []; }
}

function questionKey(text: string) {
  const normalized = text.replace(/[\s，。！？、：；"'“”‘’]/g, "").toLowerCase();
  return createHash("sha256").update(normalized).digest("hex").slice(0, 24);
}

function questionTopic(text: string) {
  const normalized = text.replace(/\s+/g, "");
  if (/先.*(哪|什么)|哪.*先|第一步|从哪.*开始/.test(normalized)) return "topic:starting-step";
  if (/作用|为什么|用来做什么/.test(normalized)) return "topic:explain-role";
  if (/预测|会发生什么|会怎样变化/.test(normalized)) return "topic:prediction";
  if (/运行|验证|结果/.test(normalized) && /一致|不同|比较|符合/.test(normalized)) return "topic:run-reflection";
  if (/总结|一句话|学会/.test(normalized)) return "topic:summary";
  return `question:${questionKey(text)}`;
}

function nextStudentPhase(phase: IDialoguePhase): IDialoguePhase {
  if (phase === "review") return "explain";
  if (phase === "explain") return "challenge";
  if (phase === "challenge") return "revise";
  if (phase === "reflect") return "summary";
  return phase;
}

export async function getIDialogueState(userId: string, taskId: number): Promise<IDialogueState> {
  const [rows] = await pool.query<any[]>(
    "SELECT * FROM i_dialogue_states WHERE user_id=? AND task_id=? LIMIT 1",
    [userId, taskId]
  );
  if (!rows.length) {
    return {
      phase: "review",
      focus: [],
      discussed_topics: [],
      resolved_topics: [],
      student_decisions: [],
      turn_count: 0,
    };
  }
  const row = rows[0];
  return {
    phase: row.phase,
    focus: parseArray(row.focus_json),
    discussed_topics: parseArray(row.discussed_json),
    resolved_topics: parseArray(row.resolved_json),
    student_decisions: parseArray(row.student_decisions_json),
    current_question: row.current_question || undefined,
    current_question_key: row.current_question_key || undefined,
    latest_run_evidence_id: row.latest_run_evidence_id || undefined,
    turn_count: Number(row.turn_count || 0),
  };
}

async function saveState(userId: string, taskId: number, state: IDialogueState, evidenceHash?: string) {
  await pool.query(
    `INSERT INTO i_dialogue_states
      (user_id,task_id,phase,focus_json,discussed_json,resolved_json,
       student_decisions_json,current_question,current_question_key,
       latest_run_evidence_id,evidence_hash,turn_count)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE phase=VALUES(phase),focus_json=VALUES(focus_json),
       discussed_json=VALUES(discussed_json),resolved_json=VALUES(resolved_json),
       student_decisions_json=VALUES(student_decisions_json),
       current_question=VALUES(current_question),current_question_key=VALUES(current_question_key),
       latest_run_evidence_id=VALUES(latest_run_evidence_id),evidence_hash=VALUES(evidence_hash),
       turn_count=VALUES(turn_count)`,
    [userId, taskId, state.phase, JSON.stringify(state.focus), JSON.stringify(state.discussed_topics),
      JSON.stringify(state.resolved_topics), JSON.stringify(state.student_decisions),
      state.current_question || null, state.current_question_key || null,
      state.latest_run_evidence_id || null, evidenceHash || null, state.turn_count]
  );
}

export async function initializeIDialogueFocus(userId: string, taskId: number, focus: string[]) {
  const state = await getIDialogueState(userId, taskId);
  if (state.focus.length === 0 && focus.length > 0) {
    state.focus = [...new Set(focus)].slice(0, 2);
    await saveState(userId, taskId, state);
  }
  return state;
}

export async function recordStudentDialogueTurn(userId: string, taskId: number, content: string) {
  const state = await getIDialogueState(userId, taskId);
  const decision = content.trim().slice(0, 160);
  if (decision && !state.student_decisions.includes(decision)) {
    state.student_decisions = [...state.student_decisions, decision].slice(-8);
  }
  if (state.current_question_key && !state.resolved_topics.includes(state.current_question_key)) {
    state.resolved_topics.push(state.current_question_key);
  }
  if (state.current_question) {
    const topic = questionTopic(state.current_question);
    if (!state.resolved_topics.includes(topic)) state.resolved_topics.push(topic);
  }
  state.phase = nextStudentPhase(state.phase);
  state.turn_count += 1;
  state.current_question = undefined;
  state.current_question_key = undefined;
  await saveState(userId, taskId, state);
  return state;
}

export async function recordAssistantDialogueTurn(userId: string, taskId: number, content: string) {
  const state = await getIDialogueState(userId, taskId);
  const questions = content.match(/[^。！？\n]*[？?]/g) || [];
  const question = questions.at(-1)?.trim();
  if (question) {
    const key = questionKey(question);
    state.current_question = question;
    state.current_question_key = key;
    if (!state.discussed_topics.includes(key)) state.discussed_topics.push(key);
    const topic = questionTopic(question);
    if (!state.discussed_topics.includes(topic)) state.discussed_topics.push(topic);
  }
  await saveState(userId, taskId, state);
  return state;
}

export async function recordIDialogueRun(userId: string, taskId: number, evidenceId?: string) {
  const state = await getIDialogueState(userId, taskId);
  state.phase = "reflect";
  state.latest_run_evidence_id = evidenceId || state.latest_run_evidence_id;
  state.current_question = undefined;
  state.current_question_key = undefined;
  await saveState(userId, taskId, state, evidenceId);
  return state;
}

export function repeatsCurrentQuestion(reply: string, state: IDialogueState | null) {
  if (!state) return false;
  const questions = reply.match(/[^。！？\n]*[？?]/g) || [];
  const previous = new Set([
    state.current_question_key || "",
    ...state.discussed_topics,
    ...state.resolved_topics,
  ].filter(Boolean));
  return questions.some((question) =>
    previous.has(questionKey(question))
    || previous.has(`question:${questionKey(question)}`)
    || previous.has(questionTopic(question))
  );
}

export function buildIDialogueFallback(state: IDialogueState | null, hasCode: boolean) {
  const focus = state?.focus?.[0] || "本次程序的关键结构";
  switch (state?.phase || "review") {
    case "review":
      return `先回顾一下你刚才的真实尝试。请用自己的话说说，${focus}在程序里起了什么作用？`;
    case "explain":
      return `我已经记下了你的解释。接下来请预测一下：如果只改变${focus}相关的部分，运行结果会发生什么变化？`;
    case "challenge":
      return hasCode
        ? "你已经写下了Python代码。先检查它是否表达了刚才的思路，然后运行一次验证。"
        : "请把刚才的思路写成Python程序。左侧积木只供参考，代码写好后再运行验证。";
    case "revise":
      return hasCode
        ? "现在运行一次程序，用真实结果检查刚才的思路。运行后我们再比较预测和结果。"
        : "请先在Python编辑区写出一个可运行版本，再用运行结果检查你的思路。";
    case "reflect":
      return "结合刚才的运行结果，说说哪一步和你的预测一致，哪一步需要调整？";
    case "summary":
      return `这轮我们已经完成了回顾、解释和运行验证。最后请用一句话总结你现在对${focus}的理解。`;
  }
}
