import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { withHandler, ok, getDynamo, TABLE, ValidationError, NotFoundError, projectAssignmentColor } from '@compliance-tracker/shared';

function isAssignmentRow(sk: unknown): boolean {
  return typeof sk === 'string' && sk.split('#').length === 2 && sk.startsWith('SUB#');
}

export const handler = withHandler(async (event) => {
  const projectId = event.pathParameters?.projectId;
  if (!projectId) throw new ValidationError('projectId is required');

  const db = getDynamo();
  const result = await db.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': `PROJECT#${projectId}` },
    })
  );

  const items = result.Items ?? [];
  const metadata = items.find((i) => i.SK === 'METADATA');
  if (!metadata) throw new NotFoundError('Project not found');

  const assignments = items.filter((i) => isAssignmentRow(i.SK)).map((a) => ({
    subId: a.subId,
    subName: a.subName,
    subTrade: a.subTrade,
    mobilizedDate: a.mobilizedDate,
    suspended: a.suspended,
    suspendedReason: a.suspendedReason,
    paymentWithheld: a.paymentWithheld,
    paymentWithheldReason: a.paymentWithheldReason,
    lateCount: a.lateCount,
    missingCount: a.missingCount,
    payrollCascadeStage: a.payrollCascadeStage,
    workforceCascadeStage: a.workforceCascadeStage,
    color: projectAssignmentColor({
      suspended: a.suspended,
      payrollCascadeStage: a.payrollCascadeStage,
      workforceCascadeStage: a.workforceCascadeStage,
      paymentWithheld: a.paymentWithheld,
    }),
  }));

  return ok({
    project: {
      projectId: metadata.projectId,
      name: metadata.name,
      address: metadata.address,
      payrollDueWeekday: metadata.payrollDueWeekday,
      workforceReportDueDay: metadata.workforceReportDueDay,
      isPublicFunded: metadata.isPublicFunded,
    },
    assignments,
  });
});
