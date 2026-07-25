import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { withHandler, ok, getDynamo, TABLE, ValidationError } from '@compliance-tracker/shared';

export const handler = withHandler(async (event) => {
  const { projectId, subId } = event.pathParameters ?? {};
  if (!projectId || !subId) throw new ValidationError('projectId and subId are required');

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
            Key: { PK: `PROJECT#${projectId}`, SK: `SUB#${subId}` },
            UpdateExpression: 'SET suspended = :false REMOVE suspendedReason',
            ExpressionAttributeValues: { ':false': false },
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
              action: 'reinstated',
            },
          },
        },
      ],
    })
  );

  return ok({ projectId, subId, suspended: false });
});
