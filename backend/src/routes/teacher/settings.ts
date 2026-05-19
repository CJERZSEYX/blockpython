import { Router, Request, Response } from "express";
import { hashPassword } from "../../utils/hash";
import pool from "../../config/database";

export const teacherSettingsRouter = Router();

teacherSettingsRouter.put("/change-password", async (req: Request, res: Response) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) { res.status(400).json({ error: "密码不能为空" }); return; }

    const currentPass = process.env.TEACHER_PASS || "admin123";
    if (oldPassword !== currentPass) { res.status(401).json({ error: "旧密码错误" }); return; }

    // 更新教师用户密码
    const teacherUser = process.env.TEACHER_USER || "admin";
    const hashed = hashPassword(newPassword);
    await pool.query(
      "INSERT INTO users (id, name, role, password_hash) VALUES (?, ?, 'teacher', ?) ON DUPLICATE KEY UPDATE password_hash = ?",
      [teacherUser, "教师", hashed, hashed]
    );

    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "修改失败" }); }
});
