import { Router, Request, Response } from "express";
import pool from "../config/database";
import { createSession } from "../middleware/auth";
import { hashPassword, verifyPassword } from "../utils/hash";

export const authRouter = Router();

authRouter.post("/login", async (req: Request, res: Response) => {
  try {
    const { student_id, password, role } = req.body;

    if (role === "teacher") {
      const teacherUser = process.env.TEACHER_USER || "admin";
      const teacherPass = process.env.TEACHER_PASS || "admin123";

      if (student_id !== teacherUser) {
        res.status(401).json({ error: "账号或密码错误" });
        return;
      }

      // 优先查 users 表中的哈希密码（教师修改密码后存在这里）
      const [tRows] = await pool.query<any[]>("SELECT password_hash FROM users WHERE id = ? AND role = 'teacher'", [teacherUser]);
      if (tRows.length > 0 && tRows[0].password_hash) {
        if (verifyPassword(password, tRows[0].password_hash)) {
          const token = createSession(teacherUser, "teacher", "教师");
          res.json({ user: { id: teacherUser, name: "教师", role: "teacher" }, session_id: token });
          return;
        }
        res.status(401).json({ error: "账号或密码错误" });
        return;
      }

      // 回退到 .env 中的明文密码
      if (password === teacherPass) {
        const token = createSession(teacherUser, "teacher", "教师");
        res.json({ user: { id: teacherUser, name: "教师", role: "teacher" }, session_id: token });
        return;
      }
      res.status(401).json({ error: "账号或密码错误" });
      return;
    }

    if (!student_id || !password) {
      res.status(400).json({ error: "学号和密码不能为空" });
      return;
    }

    const [rows] = await pool.query<any[]>(
      "SELECT * FROM users WHERE id = ?",
      [student_id]
    );

    if (rows.length === 0) {
      const hashed = hashPassword(password);
      await pool.query(
        "INSERT INTO users (id, name, grade, role, password_hash) VALUES (?, ?, ?, ?, ?)",
        [student_id, student_id, null, "student", hashed]
      );
      const token = createSession(student_id, "student", student_id);
      res.json({ user: { id: student_id, name: student_id, role: "student" }, session_id: token });
      return;
    }

    const user = rows[0];
    if (user.password_hash) {
      if (!verifyPassword(password, user.password_hash)) {
        res.status(401).json({ error: "密码错误" });
        return;
      }
    } else {
      // 迁移旧数据：无密码哈希的旧用户，首次登录时自动哈希
      if (password !== user.password_hash) {
        // 旧用户无密码 → 任何密码首次登录即设置
        const hashed = hashPassword(password);
        await pool.query("UPDATE users SET password_hash = ? WHERE id = ?", [hashed, student_id]);
      }
    }

    const token = createSession(user.id, user.role || "student", user.name || user.id);
    res.json({ user: { id: user.id, name: user.name || user.id, role: user.role || "student" }, session_id: token });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "登录失败" });
  }
});
