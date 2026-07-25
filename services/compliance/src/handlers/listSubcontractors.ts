import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { withHandler, ok, getDynamo, TABLE, onboardingColor } from '@compliance-tracker/shared';

export const handler = withHandler(async () => {
  const db = getDynamo();
  const result = await db.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: 'GSI1-entityType-name',
      KeyConditionExpression: 'entityType = :t',
      ExpressionAttributeValues: { ':t': 'SUBCONTRACTOR' },
    })
  );

  const subcontractors = (result.Items ?? []).map((item) => ({
    subId: item.subId,
    name: item.name,
    trade: item.trade,
    onboardingStatus: item.onboardingStatus,
    suspended: item.suspended,
    color: onboardingColor({ suspended: item.suspended, onboardingStatus: item.onboardingStatus }),
  }));

  return ok({ subcontractors });
});
