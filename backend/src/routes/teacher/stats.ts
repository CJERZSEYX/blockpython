import { Router, Request, Response } from "express";
import pool from "../../config/database";

export const teacherStatsRouter = Router();

teacherStatsRouter.get("/stats", async (_req: Request, res: Response) => {
  try {
    const [studentRows] = await pool.query<any[]>("SELECT COUNT(*) as total FROM users WHERE role='student'");
    const [activeRows] = await pool.query<any[]>("SELECT COUNT(DISTINCT user_id) as cnt FROM user_progress");
    const [completedRows] = await pool.query<any[]>("SELECT COUNT(*) as cnt FROM user_progress WHERE status='completed'");

    const [taskStats] = await pool.query<any[]>(`
      SELECT t.id, t.title, t.sort_order,
        COUNT(DISTINCT up.user_id) as started_count,
        SUM(CASE WHEN up.status='completed' THEN 1 ELSE 0 END) as completed_count
      FROM tasks t LEFT JOIN user_progress up ON t.id = up.task_id
      GROUP BY t.id, t.title, t.sort_order ORDER BY t.sort_order
    `);

    const totalStudents = studentRows[0]?.total || 0;
    const activeCount = activeRows[0]?.cnt || 0;
    const completedCount = completedRows[0]?.cnt || 0;
    const [totalTasks] = await pool.query<any[]>("SELECT COUNT(*) as cnt FROM tasks");
    const taskCount = totalTasks[0]?.cnt || 4;

    res.json({
      totalStudents, activeStudents: activeCount, completedTasks: completedCount,
      completionRate: totalStudents > 0 ? Math.round((completedCount / (totalStudents * taskCount)) * 100) : 0,
      taskStats,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: "获取失败" }); }
});

teacherStatsRouter.get("/recent-actions", async (_req: Request, res: Response) => {
  try {
    const [actions] = await pool.query<any[]>(`
      SELECT a.user_id, u.name as user_name, a.task_id, t.title as task_title,
        a.stage, a.action_type, a.timestamp
      FROM user_actions a
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN tasks t ON a.task_id = t.id
      ORDER BY a.timestamp DESC LIMIT 30
    `);
    res.json({ actions });
  } catch (err) { res.status(500).json({ error: "获取失败" }); }
});

teacherStatsRouter.get("/stats/charts", async (_req: Request, res: Response) => {
  try {
    const [stageTime] = await pool.query<any[]>(`
      SELECT stage, ROUND(AVG(duration_ms)/1000,1) as avg_seconds, COUNT(*) as count
      FROM user_actions WHERE duration_ms > 0 AND stage IS NOT NULL GROUP BY stage
    `);
    const [stageActions] = await pool.query<any[]>(`
      SELECT stage, action_type, COUNT(*) as count
      FROM user_actions WHERE stage IS NOT NULL AND action_type NOT IN ('stage_enter','stage_exit','button_click','llm_system_trigger')
      GROUP BY stage, action_type ORDER BY stage, count DESC
    `);
    const [aSubmitStats] = await pool.query<any[]>(`
      SELECT SUM(CASE WHEN JSON_EXTRACT(action_detail, '$.passed') = true THEN 1 ELSE 0 END) as passed,
             SUM(CASE WHEN JSON_EXTRACT(action_detail, '$.passed') = false THEN 1 ELSE 0 END) as failed
      FROM user_actions WHERE action_type = 'a_submit'
    `);
    res.json({ stageTime, stageActions, aSubmitStats: aSubmitStats[0] });
  } catch (err) { res.status(500).json({ error: "获取失败" }); }
});
