import type { NextFunction, Request, Response } from "express";
import pool from "../config/database";

interface CapturedResponse {
  status: number;
  body: unknown;
}

const inFlight = new Map<string, Promise<CapturedResponse>>();

async function completedOperation(userId: string, operationType: string, operationId: string) {
  const [rows] = await pool.query<any[]>(
    `SELECT status_code, response_json
     FROM operation_requests
     WHERE user_id=? AND operation_type=? AND operation_id=? AND status='completed'
     LIMIT 1`,
    [userId, operationType, operationId],
  );
  if (!rows.length) return null;
  const body = typeof rows[0].response_json === "string"
    ? JSON.parse(rows[0].response_json)
    : rows[0].response_json;
  return { status: Number(rows[0].status_code || 200), body } as CapturedResponse;
}

async function waitForCompletedOperation(userId: string, operationType: string, operationId: string) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const completed = await completedOperation(userId, operationType, operationId);
    if (completed) return completed;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

export function idempotentRequest(
  operationType: "execute" | "agent",
  getOperationId: (req: Request) => unknown,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const session = (req as any).session;
    const operationId = String(getOperationId(req) || "").slice(0, 80);
    if (!session?.user_id || !operationId) {
      next();
      return;
    }

    const mapKey = `${session.user_id}:${operationType}:${operationId}`;
    const active = inFlight.get(mapKey);
    if (active) {
      const captured = await active;
      res.status(captured.status).json({ ...(captured.body as object), deduplicated: true });
      return;
    }

    // Reserve synchronously before the first await. Otherwise simultaneous
    // requests can all pass the database lookup before one becomes visible.
    let resolveResponse!: (value: CapturedResponse) => void;
    const promise = new Promise<CapturedResponse>((resolve) => { resolveResponse = resolve; });
    inFlight.set(mapKey, promise);

    const completed = await completedOperation(session.user_id, operationType, operationId);
    if (completed) {
      const capturedResponse = completed;
      resolveResponse(capturedResponse);
      inFlight.delete(mapKey);
      res.status(capturedResponse.status).json({ ...(capturedResponse.body as object), deduplicated: true });
      return;
    }
    const [reservation] = await pool.query<any>(
      `INSERT INTO operation_requests
        (user_id, operation_type, operation_id, status)
       VALUES (?, ?, ?, 'processing')
       ON DUPLICATE KEY UPDATE operation_id = operation_id`,
      [session.user_id, operationType, operationId],
    );
    if (Number(reservation.affectedRows || 0) === 0) {
      const capturedResponse = await waitForCompletedOperation(
        session.user_id,
        operationType,
        operationId,
      );
      if (capturedResponse) {
        resolveResponse(capturedResponse);
        inFlight.delete(mapKey);
        res.status(capturedResponse.status).json({ ...(capturedResponse.body as object), deduplicated: true });
        return;
      }
      resolveResponse({ status: 409, body: { error: "相同操作仍在处理中，请稍后重试" } });
      inFlight.delete(mapKey);
      res.status(409).json({ error: "相同操作仍在处理中，请稍后重试", deduplicated: true });
      return;
    }

    const originalJson = res.json.bind(res);
    let captured = false;
    res.json = ((body: unknown) => {
      if (!captured) {
        captured = true;
        const status = res.statusCode;
        resolveResponse({ status, body });
        // Keep the resolved promise briefly so requests that arrive just after
        // the response but before the database update still reuse it.
        setTimeout(() => inFlight.delete(mapKey), 5000);
        if (status < 500) {
          void pool.query(
            `UPDATE operation_requests
             SET status = 'completed', status_code = ?, response_json = ?, updated_at = CURRENT_TIMESTAMP(3)
             WHERE user_id = ? AND operation_type = ? AND operation_id = ?`,
            [status, JSON.stringify(body), session.user_id, operationType, operationId],
          );
        } else {
          void pool.query(
            `DELETE FROM operation_requests
             WHERE user_id = ? AND operation_type = ? AND operation_id = ?`,
            [session.user_id, operationType, operationId],
          );
        }
      }
      return originalJson(body);
    }) as Response["json"];

    next();
  };
}
