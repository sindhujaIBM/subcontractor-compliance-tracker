import type { APIGatewayProxyResult } from 'aws-lambda';

export class AppError extends Error {
  constructor(
    public readonly message: string,
    public readonly statusCode: number,
    public readonly code: string
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') { super(message, 404, 'NOT_FOUND'); }
}

export class ValidationError extends AppError {
  constructor(message: string) { super(message, 400, 'VALIDATION_ERROR'); }
}

export class ConflictError extends AppError {
  constructor(message: string) { super(message, 409, 'CONFLICT'); }
}

export function toErrorResponse(err: unknown, origin: string): APIGatewayProxyResult {
  const corsHeaders = {
    'Access-Control-Allow-Origin': origin,
    'Content-Type': 'application/json',
  };
  if (err instanceof AppError) {
    return {
      statusCode: err.statusCode,
      headers: corsHeaders,
      body: JSON.stringify({ error: { code: err.code, message: err.message, statusCode: err.statusCode } }),
    };
  }
  console.error('Unhandled error:', err);
  return {
    statusCode: 500,
    headers: corsHeaders,
    body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred', statusCode: 500 } }),
  };
}
