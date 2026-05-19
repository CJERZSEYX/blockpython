import pool from "../config/database";
import { inferBlocksFromCode } from "../services/blockInference";

// 启动时自动为所有已有 Python 代码但未推断过的任务进行积木推断
export async function autoInferAllTasks() {
  try {
    const [rows] = await pool.query<any[]>(
      "SELECT id, content_json FROM tasks WHERE content_json IS NOT NULL"
    );

    for (const row of rows) {
      const content = row.content_json;
      const pythonCode = content?.a_stage?.python_code;

      if (!pythonCode) continue;
      if (content?.inferred_blocks) continue; // 已经推断过

      console.log(`[AutoInfer] Task ${row.id}: inferring from "${pythonCode.substring(0, 40)}..."`);

      try {
        const result = await inferBlocksFromCode(pythonCode);

        const updated = {
          ...content,
          inferred_blocks: result.blocks,
        };

        await pool.query("UPDATE tasks SET content_json = ? WHERE id = ?", [
          JSON.stringify(updated),
          row.id,
        ]);

        console.log(`[AutoInfer] Task ${row.id}: OK → ${Object.keys(result.blocks).join(", ")}`);
      } catch (err: any) {
        console.error(`[AutoInfer] Task ${row.id}: failed → ${err.message}`);
      }
    }
  } catch (err) {
    console.error("AutoInfer error:", err);
  }
}
