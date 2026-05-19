import { Router, Request, Response } from "express";
import pool from "../config/database";

export const trackRouter = Router();

trackRouter.post("/action", async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const {
      task_id, stage, action_type, action_detail, duration_ms,
    } = req.body;

    await pool.query(
      `INSERT INTO user_actions (user_id, session_id, task_id, stage, action_type, action_detail, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        session.user_id,
        session.session_id,
        task_id || null,
        stage || null,
        action_type,
        JSON.stringify(action_detail || {}),
        duration_ms || 0,
      ]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Track error:", err);
    res.status(500).json({ error: "记录行为失败" });
  }
});

trackRouter.post("/batch", async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const { actions } = req.body;
    if (!Array.isArray(actions)) {
      res.status(400).json({ error: "actions must be an array" });
      return;
    }

    const values = actions.map((a: any) => [
      session.user_id,
      session.session_id,
      a.task_id || null,
      a.stage || null,
      a.action_type,
      JSON.stringify(a.action_detail || {}),
      a.duration_ms || 0,
    ]);

    await pool.query(
      `INSERT INTO user_actions (user_id, session_id, task_id, stage, action_type, action_detail, duration_ms)
       VALUES ?`,
      [values]
    );

    res.json({ success: true, count: actions.length });
  } catch (err) {
    console.error("Track batch error:", err);
    res.status(500).json({ error: "批量记录行为失败" });
  }
});
