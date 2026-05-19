import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";
import pool from "../config/database";

interface Session {
  user_id: string;
  role: string;
  name: string;
  session_id: string;
}

const sessionStore = new Map<string, Session>();

setInterval(() => { sessionStore.clear(); }, 86400_000);

export function createSession(user_id: string, role: string, name: string): string {
  const token = uuidv4();
  sessionStore.set(token, { user_id, role, name, session_id: token });
  return token;
}

export function getSession(token: string): Session | undefined {
  return sessionStore.get(token);
}

export function requireAuth(role?: "student" | "teacher") {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers["x-session-token"] as string;
    if (!token) { res.status(401).json({ error: "未登录" }); return; }

    const session = sessionStore.get(token);
    if (!session) { res.status(401).json({ error: "会话已过期，请重新登录" }); return; }

    const [rows] = await pool.query<any[]>("SELECT id, role FROM users WHERE id = ?", [session.user_id]);
    if (rows.length === 0) { sessionStore.delete(token); res.status(401).json({ error: "账号不存在" }); return; }

    if (role && session.role !== role) {
      res.status(403).json({ error: role === "teacher" ? "需要教师权限" : "需要学生权限" });
      return;
    }

    (req as any).session = session;
    next();
  };
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.headers["x-session-token"] as string;
  if (token && sessionStore.has(token)) {
    (req as any).session = sessionStore.get(token);
  }
  next();
}
