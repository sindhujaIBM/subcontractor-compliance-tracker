import { GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import {
  withComplianceAuth,
  ok,
  getDynamo,
  TABLE,
  ValidationError,
  NotFoundError,
  checkOnboardingCascade,
  onboardingReminderCopy,
  sendReminderEmail,
} from '@compliance-tracker/shared';

async function missingOrInvalidDocTypes(db: ReturnType<typeof getDynamo>, subId: string): Promise<string[]> {
  const missing: string[] = [];
  for (const docType of ['COI', 'W9'] as const) {
    const history = await db.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: { ':pk': `SUB#${subId}`, ':prefix': `DOC#${docType}#` },
        ScanIndexForward: false,
        Limit: 1,
      })
    );
    const latest = history.Items?.[0];
    if (!latest || latest.status !== 'valid') missing.push(docType);
  }
  return missing;
}

export const handler = withComplianceAuth(async (event) => {
  const subId = event.pathParameters?.subId;
  if (!subId) throw new ValidationError('subId is required');

  const db = getDynamo();
  const subResult = await db.send(new GetCommand({ TableName: TABLE, Key: { PK: `SUB#${subId}`, SK: 'METADATA' } }));
  const sub = subResult.Item;
  if (!sub) throw new NotFoundError('Subcontractor not found');

  if (sub.suspended || sub.onboardingStatus === 'onboarded') {
    return ok({ subId, action: 'none', reason: sub.suspended ? 'suspended' : 'already onboarded' });
  }

  const now = new Date();
  const cascadeStartedAt: string = sub.onboardingCascadeStartedAt ?? now.toISOString();
  const decision = checkOnboardingCascade(cascadeStartedAt, sub.onboardingCascadeStage, now);

  if (decision.action === 'none') {
    return ok({ subId, action: 'none', stage: decision.nextStage });
  }

  const nowIso = now.toISOString();
  const updateExpressionParts = ['onboardingCascadeStage = :stage'];
  const values: Record<string, unknown> = { ':stage': decision.nextStage };
  if (!sub.onboardingCascadeStartedAt) {
    updateExpressionParts.push('onboardingCascadeStartedAt = :startedAt');
    values[':startedAt'] = cascadeStartedAt;
  }

  if (decision.action === 'escalate') {
    await db.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: TABLE,
              Key: { PK: `SUB#${subId}`, SK: 'METADATA' },
              UpdateExpression: `SET ${updateExpressionParts.join(', ')}`,
              ExpressionAttributeValues: values,
            },
          },
          {
            Put: {
              TableName: TABLE,
              Item: {
                PK: `SUB#${subId}`,
                SK: `ACTION#${nowIso}`,
                subId,
                timestamp: nowIso,
                actor: 'ai',
                action: 'escalated',
                detail: 'Onboarding reminder cascade exhausted — awaiting a human decision (suspend or continue waiting).',
              },
            },
          },
        ],
      })
    );
    return ok({ subId, action: 'escalate', stage: 'escalated' });
  }

  // action === 'reminder'
  const missingDocTypes = await missingOrInvalidDocTypes(db, subId);
  const copy = onboardingReminderCopy({
    subName: sub.name,
    missingDocTypes: missingDocTypes.length ? missingDocTypes : ['COI', 'W9'],
    isFollowUp: decision.isFollowUp,
  });

  await sendReminderEmail({ to: sub.contactEmail, subject: copy.subject, body: copy.body });

  await db.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: TABLE,
            Key: { PK: `SUB#${subId}`, SK: 'METADATA' },
            UpdateExpression: `SET ${updateExpressionParts.join(', ')}`,
            ExpressionAttributeValues: values,
          },
        },
        {
          Put: {
            TableName: TABLE,
            Item: {
              PK: `SUB#${subId}`,
              SK: `ACTION#${nowIso}`,
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

  return ok({ subId, action: 'reminder', stage: decision.nextStage, emailSentTo: sub.contactEmail });
});
