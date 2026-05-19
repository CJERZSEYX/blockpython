import { Router, Request, Response } from "express";
import pool from "../../config/database";

export const teacherTasksRouter = Router();

teacherTasksRouter.post("/tasks", async (req: Request, res: Response) => {
  try {
    const { title, description, content_json, sort_order } = req.body;
    const [result] = await pool.query<any>(
      "INSERT INTO tasks (title, description, content_json, sort_order) VALUES (?, ?, ?, ?)",
      [title || "新任务", description || "", JSON.stringify(content_json || {}), sort_order || 1]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) { console.error(err); res.status(500).json({ error: "创建失败" }); }
});

teacherTasksRouter.put("/tasks/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { content_json, title, description, sort_order } = req.body;

    if (content_json?.a_stage?.python_code || content_json?.c_stage?.answer_code) {
      const [rows] = await pool.query<any[]>("SELECT content_json FROM tasks WHERE id = ?", [id]);
      if (rows.length > 0) {
        const current = rows[0].content_json || {};
        const updated = {
          ...current, ...content_json,
          inferred_blocks: undefined,
          c_stage: { ...(current.c_stage || {}), ...(content_json.c_stage || {}), blocks_xml: undefined },
        };
        const setFields: string[] = ["content_json = ?"];
        const setValues: any[] = [JSON.stringify(updated)];
        if (title !== undefined) { setFields.push("title = ?"); setValues.push(title); }
        if (description !== undefined) { setFields.push("description = ?"); setValues.push(description); }
        if (sort_order !== undefined) { setFields.push("sort_order = ?"); setValues.push(sort_order); }
        setValues.push(id);
        await pool.query(`UPDATE tasks SET ${setFields.join(", ")} WHERE id = ?`, setValues);
        res.json({ success: true, note: "推断缓存已清除，需点击刷新推断重新生成" });
        return;
      }
    }

    const updates: string[] = [];
    const values: any[] = [];
    if (title !== undefined) { updates.push("title = ?"); values.push(title); }
    if (description !== undefined) { updates.push("description = ?"); values.push(description); }
    if (content_json !== undefined) { updates.push("content_json = ?"); values.push(JSON.stringify(content_json)); }
    if (sort_order !== undefined) { updates.push("sort_order = ?"); values.push(sort_order); }
    if (updates.length > 0) { values.push(id); await pool.query(`UPDATE tasks SET ${updates.join(", ")} WHERE id = ?`, values); }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "更新失败" }); }
});

teacherTasksRouter.delete("/tasks/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM user_progress WHERE task_id = ?", [id]);
    await pool.query("DELETE FROM user_actions WHERE task_id = ?", [id]);
    await pool.query("DELETE FROM tasks WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "删除失败" }); }
});

teacherTasksRouter.post("/preview-blocks-xml", async (req: Request, res: Response) => {
  try {
    const { code } = req.body;
    if (!code) { res.status(400).json({ error: "代码不能为空" }); return; }
    const { inferConnectedXml } = await import("../../services/blockInference");
    const xml = await inferConnectedXml(code);
    res.json({ xml });
  } catch (err: any) { res.status(500).json({ error: err.message || "生成失败" }); }
});

teacherTasksRouter.post("/preview-blocks", async (req: Request, res: Response) => {
  try {
    const { code } = req.body;
    if (!code) { res.status(400).json({ error: "代码不能为空" }); return; }
    const { inferBlocksFromCode } = await import("../../services/blockInference");
    const result = await inferBlocksFromCode(code);
    res.json({ blocks: result.blocks });
  } catch (err: any) { res.status(500).json({ error: err.message || "推断失败" }); }
});
