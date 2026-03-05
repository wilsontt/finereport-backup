/**
 * 統一回應格式
 */
import { Response } from 'express';

export function success(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ error: false, data });
}

export function error(
  res: Response,
  code: string,
  message: string,
  status = 500
): void {
  res.status(status).json({
    error: true,
    code,
    message,
  });
}
