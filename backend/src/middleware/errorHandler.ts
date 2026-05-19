import { Request, Response, NextFunction } from "express";

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  console.error("[Error]", err.message);
  res.status(500).json({ error: "服务器内部错误" });
}

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: "接口不存在" });
}
