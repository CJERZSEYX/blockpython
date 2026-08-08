import { Router, Request, Response } from "express";
import pool from "../config/database";
import { CURRICULUM_VERSION } from "../tasks/curriculum";
import { queueLearningProfileRefresh } from "../services/learningProfiles";

export const taskRouter = Router();

taskRouter.get("/list", async (req: Request, res: Response) => {
  try {
    const [tasks] = await pool.query<any[]>(
      `SELECT id, title, description, sort_order, version, suggested_lessons
       FROM tasks WHERE version = ? ORDER BY sort_order`,
      [CURRICULUM_VERSION]
    );
    const session = (req as any).session;
    if (session?.user_id) {
      const [completedRows] = await pool.query<any[]>(
        `SELECT task_id FROM student_task_states
         WHERE user_id=? AND c_completed_at IS NOT NULL`,
        [session.user_id]
      );
      const [adviceRows] = await pool.query<any[]>(
        `SELECT task_id, MAX(created_at) AS advice_updated_at
         FROM learning_summaries
         WHERE user_id=? AND scope='task' AND is_stale=0
           AND JSON_EXTRACT(summary_json, '$.student_advice.achieved') IS NOT NULL
         GROUP BY task_id`,
        [session.user_id]
      );
      const adviceByTask = new Map(adviceRows.map((row) => [Number(row.task_id), row.advice_updated_at || null]));
      const completedTaskIds = new Set(completedRows.map((row) => Number(row.task_id)));
      completedTaskIds.forEach((taskId) => {
        if (!adviceByTask.has(taskId)) queueLearningProfileRefresh(session.user_id, taskId);
      });
      res.json({
        tasks: tasks.map((task) => ({
          ...task,
          has_learning_advice: completedTaskIds.has(Number(task.id)),
          learning_advice_updated_at: adviceByTask.get(Number(task.id)) || null,
        })),
      });
      return;
    }
    res.json({ tasks: tasks.map((task) => ({ ...task, has_learning_advice: false, learning_advice_updated_at: null })) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "获取任务列表失败" });
  }
});

taskRouter.get("/:id/cstage", async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<any[]>(
      "SELECT content_json FROM tasks WHERE id = ? AND version = ?",
      [req.params.id, CURRICULUM_VERSION]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: "任务不存在" });
      return;
    }
    res.json({ blocks_xml: rows[0].content_json?.c_stage?.blocks_xml || "" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "获取积木图示失败" });
  }
});

taskRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<any[]>(
      `SELECT id, title, description, sort_order, content_json, version, suggested_lessons
       FROM tasks WHERE id = ? AND version = ?`,
      [req.params.id, CURRICULUM_VERSION]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: "任务不存在" });
      return;
    }
    const task = rows[0];
    const { support: _privateSupport, ...studentContent } = task.content_json || {};
    res.json({
      task: {
        ...task,
        content_json: studentContent,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "获取任务详情失败" });
  }
});
