import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  withComplianceAuth,
  ok,
  getDynamo,
  TABLE,
  ValidationError,
  NotFoundError,
  onboardingColor,
  projectAssignmentColor,
  worstColor,
  describeTopIssue,
} from '@compliance-tracker/shared';

/**
 * GSI2 (PK=subId, SK=projectId) is sparse on *any* item with both
 * attributes set — recurring-document and action-log rows under a project
 * carry them too, not just the one true assignment row. An assignment
 * row's SK is exactly `SUB#<subId>`; doc/action rows have extra segments.
 */
function isAssignmentRow(sk: unknown): boolean {
  return typeof sk === 'string' && sk.split('#').length === 2 && sk.startsWith('SUB#');
}

function isProjectDocRow(sk: unknown): boolean {
  return typeof sk === 'string' && /^SUB#[^#]+#DOC#/.test(sk);
}

/** Chronological sort key for a doc row: when it happened (submitted), or when it was due if it never was. */
function docDateKey(doc: { submittedAt?: string; dueDate?: string }): string {
  return doc.submittedAt ?? doc.dueDate ?? '';
}

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
    .sort((a, b) => docDateKey(b).localeCompare(docDateKey(a)));

  const actionLog = items
    .filter((i) => typeof i.SK === 'string' && i.SK.startsWith('ACTION#'))
    .sort((a, b) => String(b.SK).localeCompare(String(a.SK)));

  const projectRows = projectsResult.Items ?? [];
  const projectDocs = projectRows.filter((i) => isProjectDocRow(i.SK)).sort((a, b) => docDateKey(b).localeCompare(docDateKey(a)));

  const projects = projectRows.filter((i) => isAssignmentRow(i.SK)).map((i) => ({
    projectId: i.projectId,
    mobilizedDate: i.mobilizedDate,
    suspended: i.suspended,
    suspendedReason: i.suspendedReason,
    paymentWithheld: i.paymentWithheld,
    paymentWithheldReason: i.paymentWithheldReason,
    payrollCascadeStage: i.payrollCascadeStage,
    workforceCascadeStage: i.workforceCascadeStage,
    lateCount: i.lateCount,
    missingCount: i.missingCount,
    color: projectAssignmentColor({
      suspended: i.suspended,
      payrollCascadeStage: i.payrollCascadeStage,
      workforceCascadeStage: i.workforceCascadeStage,
      paymentWithheld: i.paymentWithheld,
    }),
    documents: projectDocs.filter((d) => d.projectId === i.projectId),
  }));

  const subForColor = { suspended: metadata.suspended, suspendedReason: metadata.suspendedReason, onboardingStatus: metadata.onboardingStatus };

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
      color: worstColor([onboardingColor(subForColor), ...projects.map((p) => p.color)]),
    },
    topIssue: describeTopIssue(subForColor, projects),
    documents,
    actionLog,
    projects,
  });
});
