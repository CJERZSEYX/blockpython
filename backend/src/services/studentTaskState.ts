import pool from "../config/database";
import { saveArtifactSnapshot } from "./artifactEvidence";

export type StudentStage = "P" | "A" | "C" | "I";

export interface StudentTaskState {
  task_id: number;
  last_stage: StudentStage;
  a_completed: boolean;
  c_completed: boolean;
  a_reference_hidden: boolean;
  drafts: { A: string; C: string; I: string };
  updated_at: string | null;
}

function parseStage(value: unknown): StudentStage {
  return ["P", "A", "C", "I"].includes(String(value))
    ? String(value) as StudentStage
    : "P";
}

async function initializeFromHistory(userId: string, taskId: number) {
  const [stateRows] = await pool.query<any[]>(
    "SELECT history_initialized FROM student_task_states WHERE user_id = ? AND task_id = ? LIMIT 1",
    [userId, taskId]
  );
  if (Number(stateRows[0]?.history_initialized || 0) === 1) return;

  const [successRows] = await pool.query<any[]>(
    `SELECT stage, MAX(timestamp) AS completed_at
     FROM user_actions
     WHERE user_id = ? AND task_id = ? AND stage IN ('A','C')
       AND action_type IN ('a_submit','c_run')
       AND JSON_UNQUOTE(JSON_EXTRACT(action_detail, '$.result')) = 'target_met'
     GROUP BY stage`,
    [userId, taskId]
  );
  const aCompletedAt = successRows.find((row) => row.stage === "A")?.completed_at || null;
  const historicalCCompletedAt = successRows.find((row) => row.stage === "C")?.completed_at || null;
  const cCompletedAt = aCompletedAt
    && historicalCCompletedAt
    && new Date(historicalCCompletedAt).getTime() >= new Date(aCompletedAt).getTime()
    ? historicalCCompletedAt
    : null;

  const [stageRows] = await pool.query<any[]>(
    `SELECT stage FROM user_actions
     WHERE user_id = ? AND task_id = ? AND action_type = 'stage_enter'
       AND stage IN ('P','A','C','I')
     ORDER BY id DESC LIMIT 1`,
    [userId, taskId]
  );
  const [enteredAdvancedRows] = await pool.query<any[]>(
    `SELECT 1 AS entered
     FROM user_actions
     WHERE user_id = ? AND task_id = ? AND action_type = 'stage_enter'
       AND stage IN ('C','I')
     LIMIT 1`,
    [userId, taskId]
  );
  let lastStage = parseStage(stageRows[0]?.stage);
  if (lastStage === "I" && !cCompletedAt) lastStage = aCompletedAt ? "C" : "A";
  if (lastStage === "C" && !aCompletedAt) lastStage = "A";

  const [snapshotRows] = await pool.query<any[]>(
    `SELECT stage, snapshot_id FROM artifact_snapshots s
     WHERE user_id = ? AND task_id = ? AND stage IN ('A','C','I')
       AND id = (
         SELECT MAX(s2.id) FROM artifact_snapshots s2
         WHERE s2.user_id = s.user_id AND s2.task_id = s.task_id AND s2.stage = s.stage
       )`,
    [userId, taskId]
  );
  const snapshot = (stage: StudentStage) =>
    snapshotRows.find((row) => row.stage === stage)?.snapshot_id || null;
  const hasEnteredC = enteredAdvancedRows.length > 0;

  await pool.query(
    `UPDATE student_task_states
     SET last_stage = ?, a_completed_at = COALESCE(a_completed_at, ?),
         c_completed_at = COALESCE(c_completed_at, ?),
         a_reference_hidden = IF(a_reference_hidden = 1 OR (? IS NOT NULL AND ? = 1), 1, 0),
         a_snapshot_id = COALESCE(a_snapshot_id, ?),
         c_snapshot_id = COALESCE(c_snapshot_id, ?),
         i_snapshot_id = COALESCE(i_snapshot_id, ?),
         history_initialized = 1
     WHERE user_id = ? AND task_id = ?`,
    [
      lastStage, aCompletedAt, cCompletedAt, aCompletedAt, hasEnteredC ? 1 : 0,
      snapshot("A"), snapshot("C"), snapshot("I"), userId, taskId,
    ]
  );
}

async function repairStageHierarchy(userId: string, taskId: number) {
  await pool.query(
    `UPDATE student_task_states
     SET c_completed_at = CASE WHEN a_completed_at IS NULL THEN NULL ELSE c_completed_at END,
         a_reference_hidden = CASE WHEN a_completed_at IS NULL THEN 0 ELSE a_reference_hidden END,
         last_stage = CASE
           WHEN a_completed_at IS NULL AND last_stage IN ('C','I') THEN 'A'
           WHEN a_completed_at IS NOT NULL AND c_completed_at IS NULL AND last_stage = 'I' THEN 'C'
           ELSE last_stage
         END
     WHERE user_id = ? AND task_id = ?`,
    [userId, taskId]
  );
}

async function ensureState(userId: string, taskId: number) {
  await pool.query(
    `INSERT IGNORE INTO student_task_states (user_id, task_id)
     SELECT ?, id FROM tasks WHERE id = ?`,
    [userId, taskId]
  );
  await initializeFromHistory(userId, taskId);
  await repairStageHierarchy(userId, taskId);
}

export async function getStudentTaskState(userId: string, taskId: number): Promise<StudentTaskState | null> {
  await ensureState(userId, taskId);
  const [rows] = await pool.query<any[]>(
    `SELECT s.*, a.content AS a_draft, c.content AS c_draft, i.content AS i_draft
     FROM student_task_states s
     LEFT JOIN artifact_snapshots a ON a.snapshot_id = s.a_snapshot_id
     LEFT JOIN artifact_snapshots c ON c.snapshot_id = s.c_snapshot_id
     LEFT JOIN artifact_snapshots i ON i.snapshot_id = s.i_snapshot_id
     WHERE s.user_id = ? AND s.task_id = ? LIMIT 1`,
    [userId, taskId]
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    task_id: Number(row.task_id),
    last_stage: parseStage(row.last_stage),
    a_completed: Boolean(row.a_completed_at),
    c_completed: Boolean(row.c_completed_at),
    a_reference_hidden: Boolean(row.a_reference_hidden),
    drafts: { A: row.a_draft || "", C: row.c_draft || "", I: row.i_draft || "" },
    updated_at: row.updated_at || null,
  };
}

export async function getRecentStudentTaskState(userId: string) {
  const [taskRows] = await pool.query<any[]>("SELECT id FROM tasks ORDER BY sort_order");
  for (const task of taskRows) await ensureState(userId, Number(task.id));
  const [rows] = await pool.query<any[]>(
    `SELECT s.task_id
     FROM student_task_states s
     LEFT JOIN (
       SELECT task_id, MAX(timestamp) AS last_activity
       FROM user_actions WHERE user_id = ? AND task_id IS NOT NULL GROUP BY task_id
     ) activity ON activity.task_id = s.task_id
     WHERE s.user_id = ? AND activity.last_activity IS NOT NULL
     ORDER BY activity.last_activity DESC, s.updated_at DESC
     LIMIT 1`,
    [userId, userId]
  );
  return rows.length ? getStudentTaskState(userId, Number(rows[0].task_id)) : null;
}

export async function canAccessStage(userId: string, taskId: number, stage: StudentStage) {
  if (stage === "P" || stage === "A") return true;
  const state = await getStudentTaskState(userId, taskId);
  if (!state) return false;
  return stage === "C" ? state.a_completed : state.c_completed;
}

export async function setCurrentStage(userId: string, taskId: number, stage: StudentStage) {
  if (!(await canAccessStage(userId, taskId, stage))) return null;
  await ensureState(userId, taskId);
  await pool.query(
    `UPDATE student_task_states
     SET last_stage = ?, a_reference_hidden = IF(? IN ('C','I'), 1, a_reference_hidden)
     WHERE user_id = ? AND task_id = ?`,
    [stage, stage, userId, taskId]
  );
  return getStudentTaskState(userId, taskId);
}

export async function saveStudentDraft(args: {
  userId: string;
  sessionId: string;
  taskId: number;
  stage: "A" | "C" | "I";
  content: string;
}) {
  await ensureState(args.userId, args.taskId);
  const saved = await saveArtifactSnapshot({
    userId: args.userId,
    sessionId: args.sessionId,
    taskId: args.taskId,
    stage: args.stage,
    artifactType: args.stage === "A" ? "blockly" : "python",
    content: args.content,
    sourceAction: "resume_draft",
  });
  const column = args.stage === "A" ? "a_snapshot_id" : args.stage === "C" ? "c_snapshot_id" : "i_snapshot_id";
  await pool.query(
    `UPDATE student_task_states SET ${column} = ? WHERE user_id = ? AND task_id = ?`,
    [saved.snapshot.snapshot_id, args.userId, args.taskId]
  );
  return getStudentTaskState(args.userId, args.taskId);
}

export async function markStageCompleted(
  userId: string,
  taskId: number,
  stage: "A" | "C",
  snapshotId?: string
) {
  await ensureState(userId, taskId);
  if (stage === "A") {
    await pool.query(
      `UPDATE student_task_states
       SET a_completed_at = COALESCE(a_completed_at, CURRENT_TIMESTAMP(3)),
           a_snapshot_id = COALESCE(?, a_snapshot_id)
       WHERE user_id = ? AND task_id = ?`,
      [snapshotId || null, userId, taskId]
    );
  } else {
    await pool.query(
      `UPDATE student_task_states
       SET c_completed_at = COALESCE(c_completed_at, CURRENT_TIMESTAMP(3)),
           c_snapshot_id = COALESCE(?, c_snapshot_id)
       WHERE user_id = ? AND task_id = ? AND a_completed_at IS NOT NULL`,
      [snapshotId || null, userId, taskId]
    );
  }
  return getStudentTaskState(userId, taskId);
}
