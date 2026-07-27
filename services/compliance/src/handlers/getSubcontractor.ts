import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { withComplianceAuth, ok, getDynamo, TABLE, ValidationError, NotFoundError, onboardingColor } from '@compliance-tracker/shared';

export const handler = withComplianceAuth(async (event) => {
  const subId = event.pathParameters?.subId;
  if (!subId) throw new ValidationError('subId is required');

  const db = getDynamo();

  const [subResult, projectsResult] = await Promise.all([
    db.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': `SUB#${subId}` },
      })
    ),
    db.send(
      new QueryCommand({
        TableName: TABLE,
        IndexName: 'GSI2-subId-projectId',
        KeyConditionExpression: 'subId = :s',
        ExpressionAttributeValues: { ':s': subId },
      })
    ),
  ]);

  const items = subResult.Items ?? [];
  const metadata = items.find((i) => i.SK === 'METADATA');
  if (!metadata) throw new NotFoundError('Subcontractor not found');

  const documents = items
    .filter((i) => typeof i.SK === 'string' && i.SK.startsWith('DOC#'))
    .sort((a, b) => String(b.SK).localeCompare(String(a.SK)));

  const actionLog = items
    .filter((i) => typeof i.SK === 'string' && i.SK.startsWith('ACTION#'))
    .sort((a, b) => String(b.SK).localeCompare(String(a.SK)));

  const projects = (projectsResult.Items ?? [])
    .filter((i) => typeof i.SK === 'string' && i.SK.startsWith('SUB#')) // assignment rows only
    .map((i) => ({
      projectId: i.projectId,
      mobilizedDate: i.mobilizedDate,
      suspended: i.suspended,
      paymentWithheld: i.paymentWithheld,
      lateCount: i.lateCount,
      missingCount: i.missingCount,
    }));

  return ok({
    subcontractor: {
      subId: metadata.subId,
      name: metadata.name,
      trade: metadata.trade,
      contactEmail: metadata.contactEmail,
      contactName: metadata.contactName,
      onboardingStatus: metadata.onboardingStatus,
      onboardingCascadeStage: metadata.onboardingCascadeStage,
      suspended: metadata.suspended,
      suspendedReason: metadata.suspendedReason,
      color: onboardingColor({ suspended: metadata.suspended, onboardingStatus: metadata.onboardingStatus }),
    },
    documents,
    actionLog,
    projects,
  });
});
