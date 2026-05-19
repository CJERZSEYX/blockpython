import { Router, Request, Response } from "express";
import { getCachedPrompts, getCachedBlockNames } from "../services/configCache";

export const chatRouter = Router();

const DEEPSEEK_API_URL =
  process.env.DEEPSEEK_API_URL || "https://api.deepseek.com/v1/chat/completions";

chatRouter.post("/send", async (req: Request, res: Response) => {
  try {
    const { messages, stage } = req.body;
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) { res.status(500).json({ error: "API key not configured" }); return; }

    const prompts = await getCachedPrompts();
    const blockNames = await getCachedBlockNames();
    const basePrompt = prompts[stage] || prompts.P;
    const systemPrompt = `${basePrompt}\n\n${blockNames}`;

    const response = await fetch(DEEPSEEK_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        temperature: 0.7,
        max_tokens: 1024,
      }),
    });

    const data: any = await response.json();
    res.json(data);
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ error: "对话请求失败" });
  }
});
