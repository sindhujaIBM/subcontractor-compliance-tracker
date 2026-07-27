import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { withSubAuth, ok, getDynamo, TABLE, onboardingColor } from '@compliance-tracker/shared';

/**
 * GSI2 (PK=subId, SK=projectId) is sparse on *any* item that happens to
 * carry both attributes — that includes recurring-document and action-log
 * rows under a project (they're written with subId/projectId set too), not
 * just the one true assignment row. An assignment row's SK is exactly
 * `SUB#<subId>`; a doc/action row's SK has extra `#`-separated segments
 * after that. Checking the segment count is what actually distinguishes them.
 */
function isAssignmentRow(sk: unknown): boolean {
  return typeof sk === 'string' && sk.split('#').length === 2 && sk.startsWith('SUB#');
}

function isProjectDocRow(sk: unknown): boolean {
  return typeof sk === 'string' && /^SUB#[^#]+#DOC#/.test(sk);
}

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

  const projectRows = projectsResult.Items ?? [];
  const projectDocs = projectRows.filter((i) => isProjectDocRow(i.SK)).sort((a, b) => String(b.SK).localeCompare(String(a.SK)));

  const projects = projectRows.filter((i) => isAssignmentRow(i.SK)).map((i) => ({
    projectId: i.projectId,
    mobilizedDate: i.mobilizedDate,
    suspended: i.suspended,
    paymentWithheld: i.paymentWithheld,
    lateCount: i.lateCount,
    missingCount: i.missingCount,
    payrollCascadeStage: i.payrollCascadeStage,
    workforceCascadeStage: i.workforceCascadeStage,
    documents: projectDocs.filter((d) => d.projectId === i.projectId),
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
