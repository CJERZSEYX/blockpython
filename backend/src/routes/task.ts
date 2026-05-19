import { Router, Request, Response } from "express";
import pool from "../config/database";

export const taskRouter = Router();

taskRouter.get("/list", async (_req: Request, res: Response) => {
  try {
    const [tasks] = await pool.query<any[]>(
      "SELECT id, title, description, sort_order FROM tasks ORDER BY sort_order"
    );
    res.json({ tasks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "获取任务列表失败" });
  }
});

taskRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<any[]>(
      "SELECT * FROM tasks WHERE id = ?",
      [req.params.id]
    );
    if (rows.length === 0) { res.status(404).json({ error: "任务不存在" }); return; }
    res.json({ task: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "获取任务详情失败" });
  }
});

taskRouter.get("/progress/:userId", async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    if (session && session.user_id !== req.params.userId) {
      res.status(403).json({ error: "无权查看其他用户的进度" });
      return;
    }
    const [rows] = await pool.query<any[]>(
      `SELECT up.task_id, up.current_stage, up.status, up.completed_at
       FROM user_progress up WHERE up.user_id = ? ORDER BY up.task_id`,
      [req.params.userId]
    );
    res.json({ progress: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "获取进度失败" });
  }
});

taskRouter.post("/start", async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const user_id = session?.user_id || req.body.user_id;
    const { task_id } = req.body;
    // 仅在未开始时插入，已进行中或已完成则不重置
    await pool.query(
      `INSERT INTO user_progress (user_id, task_id, current_stage, status, started_at)
       VALUES (?, ?, 'P', 'in_progress', NOW())
       ON DUPLICATE KEY UPDATE
         current_stage = IF(status = 'not_started' OR status IS NULL, 'P', current_stage),
         status = IF(status = 'not_started' OR status IS NULL, 'in_progress', status),
         started_at = IF(started_at IS NULL, NOW(), started_at)`,
      [user_id, task_id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "开始任务失败" });
  }
});

taskRouter.post("/updateStage", async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const user_id = session?.user_id || req.body.user_id;
    const { task_id, stage } = req.body;
    await pool.query(
      "UPDATE user_progress SET current_stage = ? WHERE user_id = ? AND task_id = ?",
      [stage, user_id, task_id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "更新阶段失败" });
  }
});

taskRouter.post("/complete", async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const user_id = session?.user_id || req.body.user_id;
    const { task_id } = req.body;
    await pool.query(
      "UPDATE user_progress SET status = 'completed', completed_at = NOW() WHERE user_id = ? AND task_id = ?",
      [user_id, task_id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "标记完成失败" });
  }
});
