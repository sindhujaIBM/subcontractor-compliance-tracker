import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { withSubAuth, ok, getDynamo, TABLE, onboardingColor } from '@compliance-tracker/shared';

/**
 * A sub's own view of their compliance state — deliberately narrower than
 * the compliance-manager's getSubcontractor endpoint (no other subs'
 * information is reachable from here, and withSubAuth already guarantees
 * the authenticated sub can only ever request their own subId).
 */
export const handler = withSubAuth(async (_event, subId) => {
  const db = getDynamo();
  const [subResult, projectsResult] = await Promise.all([
    db.send(new QueryCommand({ TableName: TABLE, KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': `SUB#${subId}` } })),
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
  const metadata = items.find((i) => i.SK === 'METADATA')!;
  const documents = items.filter((i) => typeof i.SK === 'string' && i.SK.startsWith('DOC#')).sort((a, b) => String(b.SK).localeCompare(String(a.SK)));

  const projects = (projectsResult.Items ?? [])
    .filter((i) => typeof i.SK === 'string' && i.SK.startsWith('SUB#'))
    .map((i) => ({
      projectId: i.projectId,
      mobilizedDate: i.mobilizedDate,
      suspended: i.suspended,
      paymentWithheld: i.paymentWithheld,
      lateCount: i.lateCount,
      missingCount: i.missingCount,
      payrollCascadeStage: i.payrollCascadeStage,
      workforceCascadeStage: i.workforceCascadeStage,
    }));

  return ok({
    subcontractor: {
      subId: metadata.subId,
      name: metadata.name,
      trade: metadata.trade,
      onboardingStatus: metadata.onboardingStatus,
      suspended: metadata.suspended,
      color: onboardingColor({ suspended: metadata.suspended, onboardingStatus: metadata.onboardingStatus }),
    },
    documents,
    projects,
  });
});
