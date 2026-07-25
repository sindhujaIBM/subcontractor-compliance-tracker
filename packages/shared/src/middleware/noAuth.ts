import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { toErrorResponse } from '../errors';

/**
 * This prototype has a single persona (compliance manager) and intentionally
 * skips real auth — the take-home explicitly says "does not need to be
 * production-ready." This wrapper keeps the exact same shape as a real
 * `withAuth` (CORS handling, error formatting) so swapping in real auth
 * later (Google OAuth + JWT, same pattern as the Library project) is a
 * drop-in change, not a rewrite.
 */
type Handler = (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;

const ALLOWED_ORIGINS = new Set(
  (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
);

export function corsOrigin(event: { headers?: Record<string, string | undefined> | null }): string {
  const origin = event.headers?.origin ?? event.headers?.Origin ?? '';
  if (ALLOWED_ORIGINS.has(origin)) return origin;
  return [...ALLOWED_ORIGINS][0];
}

export function withHandler(fn: Handler) {
  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const origin = corsOrigin(event);
    try {
      const result = await fn(event);
      return { ...result, headers: { ...result.headers, 'Access-Control-Allow-Origin': origin } };
    } catch (err) {
      return toErrorResponse(err, origin);
    }
  };
}

export function ok<T>(data: T, origin = 'http://localhost:5173'): APIGatewayProxyResult {
  return {
    statusCode: 200,
    headers: { 'Access-Control-Allow-Origin': origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  };
}

export function created<T>(data: T, origin = 'http://localhost:5173'): APIGatewayProxyResult {
  return {
    statusCode: 201,
    headers: { 'Access-Control-Allow-Origin': origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  };
}
