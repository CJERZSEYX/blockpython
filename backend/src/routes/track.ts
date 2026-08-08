import { Router, Request, Response } from "express";
import pool from "../config/database";
import { processTrackedLearningAction } from "../services/learningEventProcessor";

export const trackRouter = Router();

trackRouter.post("/action", async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const {
      event_id,
      task_id,
      stage,
      action_type,
      action_detail,
      duration_ms,
      prompt_version,
    } = req.body;

    await pool.query(
      `INSERT IGNORE INTO user_actions
        (event_id, user_id, session_id, task_id, stage, action_type, action_detail, duration_ms, prompt_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event_id || null,
        session.user_id,
        session.session_id,
        task_id || null,
        stage || null,
        action_type,
        JSON.stringify(action_detail || {}),
        duration_ms ?? null,
        prompt_version || null,
      ]
    );

    await processTrackedLearningAction(session, {
      action_type,
      task_id,
      stage,
      action_detail,
    });

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
    if (actions.length === 0) {
      res.json({ success: true, count: 0 });
      return;
    }

    const values = actions.map((action: any) => [
      action.event_id || null,
      session.user_id,
      session.session_id,
      action.task_id || null,
      action.stage || null,
      action.action_type,
      JSON.stringify(action.action_detail || {}),
      action.duration_ms ?? null,
      action.prompt_version || null,
    ]);

    await pool.query(
      `INSERT IGNORE INTO user_actions
        (event_id, user_id, session_id, task_id, stage, action_type, action_detail, duration_ms, prompt_version)
       VALUES ?`,
      [values]
    );

    for (const action of actions) {
      try {
        await processTrackedLearningAction(session, action);
      } catch (error) {
        console.error("Learning action processing failed:", error);
      }
    }

    res.json({ success: true, count: actions.length });
  } catch (err) {
    console.error("Track batch error:", err);
    res.status(500).json({ error: "批量记录行为失败" });
  }
});
