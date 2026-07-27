import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { withComplianceAuth, ok, getDynamo, TABLE } from '@compliance-tracker/shared';

export const handler = withComplianceAuth(async () => {
  const db = getDynamo();
  const result = await db.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: 'GSI1-entityType-name',
      KeyConditionExpression: 'entityType = :t',
      ExpressionAttributeValues: { ':t': 'PROJECT' },
    })
  );

  const projects = (result.Items ?? []).map((item) => ({
    projectId: item.projectId,
    name: item.name,
    address: item.address,
    isPublicFunded: item.isPublicFunded,
  }));

  return ok({ projects });
});
