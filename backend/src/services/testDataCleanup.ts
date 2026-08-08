import pool from "../config/database";

const dependentTables: Array<{ table: string; column: "user_id" | "student_id" }> = [
  { table: "teacher_evidence_reports", column: "student_id" },
  { table: "i_dialogue_states", column: "user_id" },
  { table: "learning_summaries", column: "user_id" },
  { table: "student_task_states", column: "user_id" },
  { table: "operation_requests", column: "user_id" },
  { table: "agent_interventions", column: "user_id" },
  { table: "learner_states", column: "user_id" },
  { table: "artifact_snapshots", column: "user_id" },
  { table: "chat_messages", column: "user_id" },
  { table: "user_actions", column: "user_id" },
  { table: "sessions", column: "user_id" },
];

export async function deleteStudentsByIds(userIds: string[]) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return 0;
  const connection = await pool.getConnection();
  const placeholders = ids.map(() => "?").join(",");
  try {
    await connection.beginTransaction();
    for (const item of dependentTables) {
      await connection.query(
        `DELETE FROM ${item.table} WHERE ${item.column} IN (${placeholders})`,
        ids,
      );
    }
    const [result] = await connection.query<any>(
      `DELETE FROM users WHERE role='student' AND id IN (${placeholders})`,
      ids,
    );
    await connection.commit();
    return Number(result.affectedRows || 0);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function findDisposableStudentIds() {
  const [rows] = await pool.query<any[]>(
    `SELECT id FROM users
     WHERE role='student' AND (
       id LIKE 'qa\\_learning\\_state\\_%' ESCAPE '\\\\'
       OR id LIKE 'test\\_%' ESCAPE '\\\\'
       OR id LIKE 'student\\_smoke\\_%' ESCAPE '\\\\'
       OR id='·'
     )`,
  );
  return rows.map((row) => String(row.id));
}
