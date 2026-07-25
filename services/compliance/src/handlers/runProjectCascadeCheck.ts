import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import {
  withHandler,
  ok,
  getDynamo,
  TABLE,
  ValidationError,
  NotFoundError,
  checkRecurringCascade,
  recurringReminderCopy,
  sendReminderEmail,
  PAYROLL_OFFSETS,
  WORKFORCE_OFFSETS,
} from '@compliance-tracker/shared';

interface SubContact {
  contactEmail: string;
  name: string;
}

export const handler = withHandler(async (event) => {
  const { projectId, subId } = event.pathParameters ?? {};
  if (!projectId || !subId) throw new ValidationError('projectId and subId are required');

  const body = event.body ? JSON.parse(event.body) : {};
  const docType: 'PAYROLL' | 'WORKFORCE' = body.docType;
  const period: string = body.period;
  const dueDate: string = body.dueDate;
  if (!docType || !period || !dueDate) throw new ValidationError('docType, period, and dueDate are required');
  if (docType !== 'PAYROLL' && docType !== 'WORKFORCE') throw new ValidationError('docType must be PAYROLL or WORKFORCE');

  const db = getDynamo();
  const [assignmentResult, subResult] = await Promise.all([
    db.send(new GetCommand({ TableName: TABLE, Key: { PK: `PROJECT#${projectId}`, SK: `SUB#${subId}` } })),
    db.send(new GetCommand({ TableName: TABLE, Key: { PK: `SUB#${subId}`, SK: 'METADATA' } })),
  ]);
  const assignment = assignmentResult.Item;
  const sub = subResult.Item as SubContact | undefined;
  if (!assignment) throw new NotFoundError('Subcontractor is not assigned to this project');
  if (!sub) throw new NotFoundError('Subcontractor not found');

  if (assignment.suspended) {
    return ok({ projectId, subId, action: 'none', reason: 'suspended' });
  }

  const cascadeField = docType === 'PAYROLL' ? 'payrollCascadeStage' : 'workforceCascadeStage';
  const offsets = docType === 'PAYROLL' ? PAYROLL_OFFSETS : WORKFORCE_OFFSETS;
  const currentStage = assignment[cascadeField];
  const now = new Date();
  const decision = checkRecurringCascade(dueDate, currentStage, offsets, now);
  const nowIso = now.toISOString();

  if (decision.action === 'none') {
    return ok({ projectId, subId, action: 'none', stage: decision.nextStage });
  }

  if (decision.action === 'escalate') {
    // Genuinely missing (never submitted for this period) vs. late-but-received
    // are tracked as separate counters — check whether a submission actually
    // exists for this period before deciding which counter this affects.
    const docResult = await db.send(
      new GetCommand({ TableName: TABLE, Key: { PK: `PROJECT#${projectId}`, SK: `SUB#${subId}#DOC#${docType}#${period}` } })
    );
    const neverSubmitted = !docResult.Item;

    await db.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: TABLE,
              Key: { PK: `PROJECT#${projectId}`, SK: `SUB#${subId}` },
              UpdateExpression: neverSubmitted
                ? `SET ${cascadeField} = :stage, missingCount = missingCount + :one`
                : `SET ${cascadeField} = :stage`,
              ExpressionAttributeValues: neverSubmitted ? { ':stage': decision.nextStage, ':one': 1 } : { ':stage': decision.nextStage },
            },
          },
          {
            Put: {
              TableName: TABLE,
              Item: {
                PK: `PROJECT#${projectId}`,
                SK: `SUB#${subId}#ACTION#${nowIso}`,
                projectId,
                subId,
                timestamp: nowIso,
                actor: 'ai',
                action: 'escalated',
                detail: `${docType} for ${period} escalated${neverSubmitted ? ' (never submitted)' : ''} — awaiting a human decision.`,
              },
            },
          },
        ],
      })
    );

    return ok({ projectId, subId, action: 'escalate', stage: 'escalated', neverSubmitted });
  }

  // action === 'reminder'
  const docLabel = docType === 'PAYROLL' ? 'Certified Payroll Report' : 'Monthly Workforce Report';
  const copy = recurringReminderCopy({ subName: sub.name, docType: docLabel, period, isFollowUp: decision.isFollowUp });
  await sendReminderEmail({ to: sub.contactEmail, subject: copy.subject, body: copy.body });

  await db.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: TABLE,
            Key: { PK: `PROJECT#${projectId}`, SK: `SUB#${subId}` },
            UpdateExpression: `SET ${cascadeField} = :stage`,
            ExpressionAttributeValues: { ':stage': decision.nextStage },
          },
        },
        {
          Put: {
            TableName: TABLE,
            Item: {
              PK: `PROJECT#${projectId}`,
              SK: `SUB#${subId}#ACTION#${nowIso}`,
              projectId,
              subId,
              timestamp: nowIso,
              actor: 'ai',
              action: 'reminder_sent',
              detail: `Stage ${decision.nextStage}: ${copy.subject}`,
            },
          },
        },
      ],
    })
  );

  return ok({ projectId, subId, action: 'reminder', stage: decision.nextStage, emailSentTo: sub.contactEmail });
});
