import { Router, Request, Response } from "express";
import {
  canAccessStage,
  getRecentStudentTaskState,
  getStudentTaskState,
  saveStudentDraft,
  setCurrentStage,
  type StudentStage,
} from "../services/studentTaskState";

export const learningStateRouter = Router();

function taskIdOf(req: Request) {
  const taskId = Number(req.params.taskId);
  return Number.isInteger(taskId) && taskId > 0 ? taskId : 0;
}

learningStateRouter.get("/recent", async (req: Request, res: Response) => {
  const session = (req as any).session;
  const state = await getRecentStudentTaskState(session.user_id);
  res.json({ state });
});

learningStateRouter.get("/:taskId", async (req: Request, res: Response) => {
  const taskId = taskIdOf(req);
  if (!taskId) return void res.status(400).json({ error: "任务编号不正确" });
  const session = (req as any).session;
  const state = await getStudentTaskState(session.user_id, taskId);
  if (!state) return void res.status(404).json({ error: "任务不存在" });
  res.json({ state });
});

learningStateRouter.put("/:taskId/stage", async (req: Request, res: Response) => {
  const taskId = taskIdOf(req);
  const stage = String(req.body?.stage || "") as StudentStage;
  if (!taskId || !["P", "A", "C", "I"].includes(stage)) {
    return void res.status(400).json({ error: "任务或阶段参数不正确" });
  }
  const session = (req as any).session;
  const state = await setCurrentStage(session.user_id, taskId, stage);
  if (!state) return void res.status(403).json({ error: "请先完成前一个学习阶段" });
  res.json({ state });
});

learningStateRouter.put("/:taskId/draft", async (req: Request, res: Response) => {
  const taskId = taskIdOf(req);
  const stage = String(req.body?.stage || "") as "A" | "C" | "I";
  const content = typeof req.body?.content === "string" ? req.body.content : null;
  if (!taskId || !["A", "C", "I"].includes(stage) || content == null) {
    return void res.status(400).json({ error: "草稿参数不正确" });
  }
  const session = (req as any).session;
  if (!(await canAccessStage(session.user_id, taskId, stage))) {
    return void res.status(403).json({ error: "请先完成前一个学习阶段" });
  }
  const state = await saveStudentDraft({
    userId: session.user_id,
    sessionId: session.session_id,
    taskId,
    stage,
    content,
  });
  res.json({ state });
});
