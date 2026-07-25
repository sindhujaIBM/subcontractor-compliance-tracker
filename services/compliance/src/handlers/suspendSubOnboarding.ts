import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { withHandler, ok, getDynamo, TABLE, ValidationError } from '@compliance-tracker/shared';

/**
 * Onboarding-level suspension is always a human decision — the system never
 * auto-suspends, even once escalated. There is no server-side gate requiring
 * the cascade to have reached "escalated" first: a human may have an
 * out-of-band reason to suspend earlier. The system informs that judgment
 * (via the escalation state), it never overrides it.
 */
export const handler = withHandler(async (event) => {
  const subId = event.pathParameters?.subId;
  if (!subId) throw new ValidationError('subId is required');

  const body = event.body ? JSON.parse(event.body) : {};
  const reason: string = body.reason ?? 'No reason provided';
  const actorName: string = body.actorName ?? 'Compliance Manager';
  const now = new Date().toISOString();

  const db = getDynamo();
  await db.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: TABLE,
            Key: { PK: `SUB#${subId}`, SK: 'METADATA' },
            UpdateExpression: 'SET suspended = :true, suspendedReason = :reason, onboardingStatus = :status',
            ExpressionAttributeValues: { ':true': true, ':reason': reason, ':status': 'suspended' },
          },
        },
        {
          Put: {
            TableName: TABLE,
            Item: {
              PK: `SUB#${subId}`,
              SK: `ACTION#${now}`,
              subId,
              timestamp: now,
              actor: 'human',
              actorName,
              action: 'suspended',
              reason,
            },
          },
        },
      ],
    })
  );

  return ok({ subId, suspended: true, reason });
});
