import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { toErrorResponse, UnauthorizedError, ForbiddenError } from '../errors';
import { getDynamo, TABLE } from '../dynamo';
import { verifyPassword } from '../passwords';
import { corsOrigin } from './noAuth';

type Handler = (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
type SubHandler = (event: APIGatewayProxyEvent, subId: string) => Promise<APIGatewayProxyResult>;

function parseBasicAuth(event: { headers?: Record<string, string | undefined> | null }): { username: string; password: string } | null {
  const header = event.headers?.Authorization || event.headers?.authorization;
  if (!header || !header.startsWith('Basic ')) return null;
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const idx = decoded.indexOf(':');
  if (idx === -1) return null;
  return { username: decoded.slice(0, idx), password: decoded.slice(idx + 1) };
}

function unauthorizedResponse(origin: string): APIGatewayProxyResult {
  const res = toErrorResponse(new UnauthorizedError('Invalid or missing credentials'), origin);
  return { ...res, headers: { ...res.headers, 'WWW-Authenticate': 'Basic realm="Compliance Tracker"' } };
}

/**
 * Single compliance-manager identity — credentials come from env vars set
 * via SSM at deploy time (see serverless.yml), not hardcoded in the repo.
 * There's exactly one persona here, so one shared login is proportionate;
 * this is intentionally the simplest thing that actually gates access, not
 * a full user-management system.
 */
export function withComplianceAuth(fn: Handler) {
  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const origin = corsOrigin(event);
    const creds = parseBasicAuth(event);
    const expectedUser = process.env.COMPLIANCE_USERNAME;
    const expectedPass = process.env.COMPLIANCE_PASSWORD;
    if (!creds || !expectedUser || !expectedPass || creds.username !== expectedUser || creds.password !== expectedPass) {
      return unauthorizedResponse(origin);
    }
    try {
      const result = await fn(event);
      return { ...result, headers: { ...result.headers, 'Access-Control-Allow-Origin': origin } };
    } catch (err) {
      return toErrorResponse(err, origin);
    }
  };
}

/**
 * Per-subcontractor identity — username is the subId, password is a
 * per-sub hash stored on the Subcontractor record. A sub can only ever
 * act on their own resources: the handler receives the *authenticated*
 * subId, and any subId in the path must match it or the request is
 * rejected — a sub logging in as themselves can't reach into another
 * sub's documents by editing the URL.
 */
export function withSubAuth(fn: SubHandler) {
  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const origin = corsOrigin(event);
    const creds = parseBasicAuth(event);
    if (!creds) return unauthorizedResponse(origin);

    try {
      const db = getDynamo();
      const result = await db.send(new GetCommand({ TableName: TABLE, Key: { PK: `SUB#${creds.username}`, SK: 'METADATA' } }));
      const sub = result.Item;
      if (!sub || !sub.passwordHash || !verifyPassword(creds.password, sub.passwordHash)) {
        return unauthorizedResponse(origin);
      }

      const pathSubId = event.pathParameters?.subId;
      if (pathSubId && pathSubId !== creds.username) {
        return toErrorResponse(new ForbiddenError('You can only act on your own records'), origin);
      }

      const res = await fn(event, creds.username);
      return { ...res, headers: { ...res.headers, 'Access-Control-Allow-Origin': origin } };
    } catch (err) {
      return toErrorResponse(err, origin);
    }
  };
}
