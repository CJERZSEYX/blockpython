import { Router, Request, Response } from "express";
import { getCachedPrompts, getCachedBlockNames, savePromptsToDb, saveBlockNamesToDb, refreshConfigCache } from "../../services/configCache";

export const teacherPromptsRouter = Router();

teacherPromptsRouter.get("/prompts", async (_req: Request, res: Response) => {
  try {
    const prompts = await getCachedPrompts();
    res.json({ prompts });
  } catch (err) { console.error(err); res.status(500).json({ error: "读取提示词失败" }); }
});

teacherPromptsRouter.put("/prompts", async (req: Request, res: Response) => {
  try {
    const { stage, content } = req.body;
    if (!stage || !content) { res.status(400).json({ error: "stage 和 content 不能为空" }); return; }
    const prompts = await getCachedPrompts();
    prompts[stage] = content;
    await savePromptsToDb(prompts);
    refreshConfigCache();
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "更新提示词失败" }); }
});

teacherPromptsRouter.post("/prompts/test", async (req: Request, res: Response) => {
  try {
    const { stage, message } = req.body;
    if (!stage || !message) { res.status(400).json({ error: "stage 和 message 不能为空" }); return; }
    const prompts = await getCachedPrompts();
    const response = await fetch(
      process.env.DEEPSEEK_API_URL || "https://api.deepseek.com/v1/chat/completions",
      { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
        body: JSON.stringify({ model: "deepseek-chat", messages: [{ role: "system", content: prompts[stage] }, { role: "user", content: message }], temperature: 0.7, max_tokens: 512 }) }
    );
    const data = await response.json();
    res.json(data);
  } catch (err) { res.status(500).json({ error: "测试失败" }); }
});

teacherPromptsRouter.get("/system-prompts", async (_req: Request, res: Response) => {
  try {
    const names = await getCachedBlockNames();
    res.json({ blockNames: names });
  } catch (err) { res.status(500).json({ error: "读取失败" }); }
});

teacherPromptsRouter.put("/system-prompts/names", async (req: Request, res: Response) => {
  try {
    const { content } = req.body;
    await saveBlockNamesToDb(content);
    refreshConfigCache();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "保存失败" }); }
});

teacherPromptsRouter.get("/system-prompts/defaults", async (_req: Request, res: Response) => {
  const defaultNames = [
    "  controls_if = 如果/否则积木（蓝色-控制类）",
    "  controls_repeat_ext = 重复N次积木（蓝色-控制类）",
    "  controls_whileUntil = 当条件重复积木（蓝色-控制类）",
    "  variables_set = 变量赋值积木（橙色-数据类）",
    "  math_number = 数字积木（橙色-数据类）",
    "  math_arithmetic = 加减乘除取余积木（橙色-数据类）",
    "  logic_compare = 比较运算积木（橙色-数据类）",
    "  logic_operation = 且/或运算积木（橙色-数据类）",
    "  logic_negate = 非运算积木（橙色-数据类）",
    "  math_random_int = 随机整数积木（橙色-数据类）",
    "  sensing_ask = 询问并等待积木（绿色-输入输出类）",
    "  text_print = 输出积木（绿色-输入输出类）",
    "  text = 文本内容积木（紫色-文本类）",
    "  text_join = 文本拼接积木（紫色-文本类）",
    "  text_length = 字符串长度积木（紫色-文本类）",
  ].join("\n");
  res.json({ defaultNames });
});
