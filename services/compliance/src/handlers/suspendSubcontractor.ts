import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { withHandler, ok, getDynamo, TABLE, ValidationError } from '@compliance-tracker/shared';

/**
 * Project-level suspension. The 5-late/3-missing threshold only makes the
 * "Suspend" action available in the UI as a recommendation — it is never
 * enforced server-side. A human may suspend earlier for an out-of-band
 * reason (e.g. a safety incident); the system informs that judgment, it
 * never gates it.
 */
export const handler = withHandler(async (event) => {
  const { projectId, subId } = event.pathParameters ?? {};
  if (!projectId || !subId) throw new ValidationError('projectId and subId are required');

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
            Key: { PK: `PROJECT#${projectId}`, SK: `SUB#${subId}` },
            UpdateExpression: 'SET suspended = :true, suspendedReason = :reason',
            ExpressionAttributeValues: { ':true': true, ':reason': reason },
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

  return ok({ projectId, subId, suspended: true, reason });
});
