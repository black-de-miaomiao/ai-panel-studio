import type { Response } from 'express';
import type { ApiErrorBody, ApiErrorCode } from '@aps/shared';

export function sendApiError(
  response: Response,
  status: number,
  code: ApiErrorCode,
  message: string,
  details: unknown[] = []
): void {
  const body: ApiErrorBody = {
    error: { code, message, details }
  };
  response.status(status).json(body);
}
