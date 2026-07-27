import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { withSubAuth, ok, getDynamo, TABLE, ValidationError, NotFoundError, getUploadPresignedUrl } from '@compliance-tracker/shared';

const BUCKET = process.env.UPLOAD_BUCKET!;

export const handler = withSubAuth(async (event, subId) => {
  const projectId = event.pathParameters?.projectId;
  const docType = event.pathParameters?.docType;
  if (!projectId) throw new ValidationError('projectId is required');
  if (docType !== 'PAYROLL' && docType !== 'WORKFORCE') throw new ValidationError('docType must be PAYROLL or WORKFORCE');

  const body = event.body ? JSON.parse(event.body) : {};
  const period: string = body.period;
  const dueDate: string = body.dueDate;
  const contentType: string = body.contentType ?? 'application/pdf';
  const filename: string = (body.filename ?? 'document').replace(/[^a-zA-Z0-9._-]/g, '_');
  if (!period || !dueDate) throw new ValidationError('period and dueDate are required');

  const db = getDynamo();
  const assignment = await db.send(new GetCommand({ TableName: TABLE, Key: { PK: `PROJECT#${projectId}`, SK: `SUB#${subId}` } }));
  if (!assignment.Item) throw new NotFoundError('You are not assigned to this project');

  // dueDate travels in the key so the S3-triggered processor can determine
  // lateness without a second lookup.
  const key = `project/${projectId}/${subId}/${docType}/${period}/${encodeURIComponent(dueDate)}/${Date.now()}-${filename}`;
  const uploadUrl = await getUploadPresignedUrl(BUCKET, key, contentType);

  return ok({ uploadUrl, key });
});
