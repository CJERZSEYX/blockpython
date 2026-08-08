import { Router, Request, Response } from "express";
import { getLearningProfileBundle, refreshLearningProfiles } from "../services/learningProfiles";
import { getIDialogueState } from "../services/iDialogueState";
import { getStudentTaskState } from "../services/studentTaskState";

export const learningProfileRouter = Router();

learningProfileRouter.get("/:taskId", async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const taskId = Number(req.params.taskId);
    const stage = ["P", "A", "C", "I"].includes(String(req.query.stage))
      ? String(req.query.stage) as "P" | "A" | "C" | "I"
      : undefined;
    if (!Number.isInteger(taskId) || taskId < 1) {
      res.status(400).json({ error: "任务参数不正确" });
      return;
    }
    const state = await getStudentTaskState(session.user_id, taskId);
    let profiles = await getLearningProfileBundle(session.user_id, taskId, stage);
    if (state?.c_completed && !profiles.task_profile?.content.student_advice) {
      await refreshLearningProfiles(session.user_id, taskId, stage);
      profiles = await getLearningProfileBundle(session.user_id, taskId, stage);
    }
    const studentAdvice = state?.c_completed ? profiles.task_profile?.content.student_advice || null : null;
    res.json({
      student_advice: studentAdvice,
      student_advice_updated_at: studentAdvice ? profiles.task_profile?.created_at || null : null,
      i_dialogue_state: stage === "I" ? await getIDialogueState(session.user_id, taskId) : null,
    });
  } catch (error) {
    console.error("Learning profile error:", error);
    res.status(500).json({ error: "学习证据画像暂时无法加载" });
  }
});
