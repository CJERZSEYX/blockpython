import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";
import pool from "../config/database";

interface Session {
  user_id: string;
  role: string;
  name: string;
  session_id: string;
}

const SESSION_TTL_HOURS = 24;

export async function createSession(user_id: string, role: string, name: string): Promise<string> {
  const token = uuidv4();
  await pool.query(
    `INSERT INTO sessions (id, user_id, role, name, expires_at)
     VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))`,
    [token, user_id, role, name, SESSION_TTL_HOURS]
  );
  return token;
}

export async function getSession(token: string): Promise<Session | undefined> {
  const [rows] = await pool.query<any[]>(
    `SELECT id AS session_id, user_id, role, name
     FROM sessions
     WHERE id = ? AND expires_at > NOW()`,
    [token]
  );
  return rows[0] as Session | undefined;
}

export function requireAuth(role?: "student" | "teacher") {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = req.headers["x-session-token"] as string;
      if (!token) {
        res.status(401).json({ error: "未登录" });
        return;
      }

      const session = await getSession(token);
      if (!session) {
        res.status(401).json({ error: "登录已过期，请重新登录" });
        return;
      }

      const [rows] = await pool.query<any[]>(
        "SELECT id, role FROM users WHERE id = ?",
        [session.user_id]
      );
      if (rows.length === 0) {
        await pool.query("DELETE FROM sessions WHERE id = ?", [token]);
        res.status(401).json({ error: "账号不存在" });
        return;
      }

      if (role && session.role !== role) {
        res.status(403).json({ error: role === "teacher" ? "需要教师权限" : "需要学生权限" });
        return;
      }

      (req as any).session = session;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.headers["x-session-token"] as string;
    if (token) {
      const session = await getSession(token);
      if (session) (req as any).session = session;
    }
    next();
  } catch (error) {
    next(error);
  }
}
