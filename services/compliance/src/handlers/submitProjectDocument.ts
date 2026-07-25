import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { withHandler, ok, getDynamo, TABLE, ValidationError } from '@compliance-tracker/shared';

function validateRecurringDoc(docType: 'PAYROLL' | 'WORKFORCE', fields: Record<string, unknown>): { valid: boolean; reason?: string } {
  if (docType === 'PAYROLL') {
    if (!fields.totalHours || Number(fields.totalHours) <= 0) return { valid: false, reason: 'No hours reported' };
    return { valid: true };
  }
  if (fields.participationPercent === undefined) return { valid: false, reason: 'Missing participation percentage' };
  return { valid: true };
}

export const handler = withHandler(async (event) => {
  const { projectId, subId, docType } = event.pathParameters ?? {};
  if (!projectId || !subId || !docType) throw new ValidationError('projectId, subId, and docType are required');
  if (docType !== 'PAYROLL' && docType !== 'WORKFORCE') throw new ValidationError('docType must be PAYROLL or WORKFORCE');

  const body = event.body ? JSON.parse(event.body) : {};
  const period: string = body.period;
  const dueDate: string = body.dueDate;
  if (!period || !dueDate) throw new ValidationError('period and dueDate are required');

  const { valid, reason } = validateRecurringDoc(docType, body);
  const now = new Date().toISOString();
  const late = now > dueDate;
  const cascadeField = docType === 'PAYROLL' ? 'payrollCascadeStage' : 'workforceCascadeStage';

  const db = getDynamo();
  await db.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: TABLE,
            Item: {
              PK: `PROJECT#${projectId}`,
              SK: `SUB#${subId}#DOC#${docType}#${period}`,
              projectId,
              subId,
              docType,
              period,
              dueDate,
              submittedAt: now,
              status: valid ? 'valid' : 'invalid',
              late,
            },
          },
        },
        {
          Update: {
            TableName: TABLE,
            Key: { PK: `PROJECT#${projectId}`, SK: `SUB#${subId}` },
            // A valid, on-track submission clears that track's cascade; a
            // late-but-eventually-valid one still clears the cascade (the
            // reminders were about getting the document in, which just
            // happened) but bumps the late counter.
            UpdateExpression: valid
              ? `REMOVE ${cascadeField} SET lateCount = lateCount + :lateDelta`
              : `SET lateCount = lateCount + :lateDelta`,
            ExpressionAttributeValues: { ':lateDelta': late ? 1 : 0 },
          },
        },
        {
          Put: {
            TableName: TABLE,
            Item: {
              PK: `PROJECT#${projectId}`,
              SK: `SUB#${subId}#ACTION#${now}`,
              projectId,
              subId,
              timestamp: now,
              actor: 'ai',
              action: 'document_submitted',
              detail: `${docType} for ${period} ${valid ? 'passed' : 'failed'} validation${late ? ' (late)' : ''}${reason ? `: ${reason}` : ''}`,
            },
          },
        },
      ],
    })
  );

  return ok({ projectId, subId, docType, period, valid, late, reason });
});
