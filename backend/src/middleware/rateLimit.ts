import { Request, Response, NextFunction } from "express";

const store = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const session = (req as any).session;
    const key = session?.user_id
      ? `${session.role}:${session.user_id}`
      : req.ip || "unknown";
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || now > entry.resetAt) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (entry.count >= maxRequests) {
      res.status(429).json({ error: "请求过于频繁，请稍后再试" });
      return;
    }

    entry.count++;
    next();
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 60000);
