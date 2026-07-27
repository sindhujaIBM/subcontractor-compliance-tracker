import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { withComplianceAuth, ok, getDynamo, TABLE, ValidationError } from '@compliance-tracker/shared';

export const handler = withComplianceAuth(async (event) => {
  const subId = event.pathParameters?.subId;
  if (!subId) throw new ValidationError('subId is required');

  const body = event.body ? JSON.parse(event.body) : {};
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
            UpdateExpression: 'SET suspended = :false, onboardingStatus = :status REMOVE suspendedReason',
            ExpressionAttributeValues: { ':false': false, ':status': 'pending' },
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
              action: 'reinstated',
            },
          },
        },
      ],
    })
  );

  return ok({ subId, suspended: false });
});
