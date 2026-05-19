import { Router, Request, Response } from "express";
import pool from "../config/database";
import { inferBlocksFromCode, inferConnectedXml, InferResult } from "../services/blockInference";
import { blocksToXml } from "../services/blockXml";

export const inferRouter = Router();

// POST /api/task/infer/:id - 对指定任务的A阶段代码进行积木推断
inferRouter.post("/infer/:taskId", async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;

    const [rows] = await pool.query<any[]>(
      "SELECT content_json FROM tasks WHERE id = ?",
      [taskId]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "任务不存在" });
      return;
    }

    const content = rows[0].content_json;
    const pythonCode = content?.a_stage?.python_code;

    if (!pythonCode) {
      res.status(400).json({ error: "该任务没有 A 阶段 Python 代码" });
      return;
    }

    const result: InferResult = await inferBlocksFromCode(pythonCode);

    // 缓存到 content_json.inferred_blocks
    const updated = {
      ...content,
      inferred_blocks: result.blocks,
    };

    await pool.query("UPDATE tasks SET content_json = ? WHERE id = ?", [
      JSON.stringify(updated),
      taskId,
    ]);

    res.json({ success: true, blocks: result.blocks, note: result.note });
  } catch (err: any) {
    console.error("Infer error:", err);
    res.status(500).json({ error: err.message || "推断失败" });
  }
});

// GET /api/task/:taskId/cstage - 获取 C 阶段只读积木 XML
inferRouter.get("/:taskId/cstage", async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;

    const [rows] = await pool.query<any[]>(
      "SELECT content_json FROM tasks WHERE id = ?",
      [taskId]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: "任务不存在" });
      return;
    }

    const content = rows[0].content_json;

    // 如果已有缓存，直接返回
    if (content?.c_stage?.blocks_xml) {
      res.json({ blocks_xml: content.c_stage.blocks_xml });
      return;
    }

    // 优先用 c_stage 专用的 Python 答案代码推断，否则用 a_stage 的
    const pythonCode = content?.c_stage?.answer_code || content?.a_stage?.python_code;
    if (!pythonCode) {
      res.status(400).json({ error: "该任务没有可用于推断的 Python 代码" });
      return;
    }

    // 调用 LLM 生成拼接好的完整积木 XML
    const xml = await inferConnectedXml(pythonCode);

    // 缓存
    const updated = {
      ...content,
      c_stage: {
        ...(content.c_stage || {}),
        blocks_xml: xml,
      },
      inferred_blocks: content.inferred_blocks || undefined,
    };

    await pool.query("UPDATE tasks SET content_json = ? WHERE id = ?", [
      JSON.stringify(updated),
      taskId,
    ]);

    res.json({ blocks_xml: xml });
  } catch (err: any) {
    console.error("CStage error:", err);
    res.status(500).json({ error: err.message || "获取失败" });
  }
});
