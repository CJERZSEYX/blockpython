import { Router, Request, Response } from "express";
import pool from "../../config/database";

export const teacherStudentsRouter = Router();

teacherStudentsRouter.get("/students", async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<any[]>(`
      SELECT u.id, u.name, u.role, u.student_group, u.created_at,
        COUNT(DISTINCT up.task_id) as tasks_started,
        SUM(CASE WHEN up.status='completed' THEN 1 ELSE 0 END) as tasks_completed
      FROM users u LEFT JOIN user_progress up ON u.id = up.user_id
      WHERE u.role = 'student' GROUP BY u.id ORDER BY u.created_at DESC
    `);
    res.json({ students: rows });
  } catch (err) { console.error(err); res.status(500).json({ error: "获取学生列表失败" }); }
});

teacherStudentsRouter.get("/students/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [progress] = await pool.query<any[]>(`
      SELECT up.task_id, t.title as task_title, up.current_stage, up.status, up.started_at, up.completed_at
      FROM user_progress up JOIN tasks t ON up.task_id = t.id
      WHERE up.user_id = ? ORDER BY t.sort_order
    `, [id]);
    const [actions] = await pool.query<any[]>(`
      SELECT task_id, stage, action_type, action_detail, timestamp, duration_ms
      FROM user_actions WHERE user_id = ? ORDER BY timestamp DESC LIMIT 200
    `, [id]);
    const [stats] = await pool.query<any[]>(`
      SELECT stage, action_type, COUNT(*) as cnt
      FROM user_actions WHERE user_id = ? GROUP BY stage, action_type ORDER BY stage, action_type
    `, [id]);
    res.json({ progress, actions, stats });
  } catch (err) { console.error(err); res.status(500).json({ error: "获取学生详情失败" }); }
});

teacherStudentsRouter.get("/students/:id/export", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query<any[]>(`
      SELECT user_id, session_id, task_id, stage, action_type,
        JSON_UNQUOTE(JSON_EXTRACT(action_detail, '$')) as detail, timestamp, duration_ms
      FROM user_actions WHERE user_id = ? ORDER BY timestamp
    `, [id]);
    const csv = [
      "user_id,session_id,task_id,stage,action_type,detail,timestamp,duration_ms",
      ...rows.map((r) => [r.user_id, r.session_id, r.task_id, r.stage, r.action_type,
        `"${(r.detail || "").replace(/"/g, '""')}"`, r.timestamp, r.duration_ms].join(",")),
    ].join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=student_${id}.csv`);
    res.send("\uFEFF" + csv);
  } catch (err) { console.error(err); res.status(500).json({ error: "导出失败" }); }
});

teacherStudentsRouter.get("/export-all", async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<any[]>(`
      SELECT user_id, session_id, task_id, stage, action_type,
        JSON_UNQUOTE(JSON_EXTRACT(action_detail, '$')) as detail, timestamp, duration_ms
      FROM user_actions ORDER BY user_id, timestamp
    `);
    const csv = [
      "user_id,session_id,task_id,stage,action_type,detail,timestamp,duration_ms",
      ...rows.map((r) => [r.user_id, r.session_id, r.task_id, r.stage, r.action_type,
        `"${(r.detail || "").replace(/"/g, '""')}"`, r.timestamp, r.duration_ms].join(",")),
    ].join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=all_data.csv");
    res.send("\uFEFF" + csv);
  } catch (err) { console.error(err); res.status(500).json({ error: "导出失败" }); }
});

teacherStudentsRouter.put("/students/:id/group", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { group } = req.body;
    await pool.query("UPDATE users SET student_group = ? WHERE id = ?", [group, id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "修改失败" }); }
});

teacherStudentsRouter.delete("/students/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM user_actions WHERE user_id = ?", [id]);
    await pool.query("DELETE FROM user_progress WHERE user_id = ?", [id]);
    await pool.query("DELETE FROM users WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "删除失败" }); }
});
