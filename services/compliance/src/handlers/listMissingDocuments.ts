import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { withHandler, ok, getDynamo, TABLE } from '@compliance-tracker/shared';

function isAssignmentRow(sk: unknown): boolean {
  return typeof sk === 'string' && sk.split('#').length === 2 && sk.startsWith('SUB#');
}

const STAGE_URGENCY: Record<string, number> = {
  day1: 1,
  reminderEarly: 1,
  day8: 2,
  reminderEndOfDay: 2,
  day11: 3,
  finalCheck: 3,
  escalated: 4,
};

interface MissingDocEntry {
  subId: string;
  subName: string;
  trade: string;
  projectId?: string;
  projectName?: string;
  reason: string;
  urgency: number;
  suspended: boolean;
  paymentWithheld: boolean;
}

export const handler = withHandler(async () => {
  const db = getDynamo();

  const [subsResult, projectsResult] = await Promise.all([
    db.send(
      new QueryCommand({
        TableName: TABLE,
        IndexName: 'GSI1-entityType-name',
        KeyConditionExpression: 'entityType = :t',
        ExpressionAttributeValues: { ':t': 'SUBCONTRACTOR' },
      })
    ),
    db.send(
      new QueryCommand({
        TableName: TABLE,
        IndexName: 'GSI1-entityType-name',
        KeyConditionExpression: 'entityType = :t',
        ExpressionAttributeValues: { ':t': 'PROJECT' },
      })
    ),
  ]);

  const entries: MissingDocEntry[] = [];

  // Onboarding-side gaps (COI/W-9 not yet cleared)
  for (const sub of subsResult.Items ?? []) {
    if (sub.onboardingStatus === 'pending' && !sub.suspended) {
      entries.push({
        subId: sub.subId,
        subName: sub.name,
        trade: sub.trade,
        reason: 'COI/W-9 not yet cleared for onboarding',
        urgency: STAGE_URGENCY[sub.onboardingCascadeStage] ?? 1,
        suspended: false,
        paymentWithheld: false,
      });
    }
    if (sub.suspended) {
      entries.push({
        subId: sub.subId,
        subName: sub.name,
        trade: sub.trade,
        reason: sub.suspendedReason ? `Suspended (onboarding): ${sub.suspendedReason}` : 'Suspended (onboarding)',
        urgency: 5,
        suspended: true,
        paymentWithheld: false,
      });
    }
  }

  // Recurring-compliance gaps, one project partition at a time
  const projects = projectsResult.Items ?? [];
  const projectPartitions = await Promise.all(
    projects.map((p) =>
      db.send(
        new QueryCommand({
          TableName: TABLE,
          KeyConditionExpression: 'PK = :pk',
          ExpressionAttributeValues: { ':pk': `PROJECT#${p.projectId}` },
        })
      )
    )
  );

  projects.forEach((project, idx) => {
    const assignments = (projectPartitions[idx].Items ?? []).filter((i) => isAssignmentRow(i.SK));
    for (const a of assignments) {
      if (a.suspended) {
        entries.push({
          subId: a.subId,
          subName: a.subName,
          trade: a.subTrade,
          projectId: project.projectId,
          projectName: project.name,
          reason: a.suspendedReason ? `Suspended: ${a.suspendedReason}` : 'Suspended from project',
          urgency: 5,
          suspended: true,
          paymentWithheld: Boolean(a.paymentWithheld),
        });
        continue;
      }
      if (a.paymentWithheld) {
        entries.push({
          subId: a.subId,
          subName: a.subName,
          trade: a.subTrade,
          projectId: project.projectId,
          projectName: project.name,
          reason: a.paymentWithheldReason ? `Payment withheld: ${a.paymentWithheldReason}` : 'Payment withheld',
          urgency: 4,
          suspended: false,
          paymentWithheld: true,
        });
      }
      if (a.payrollCascadeStage) {
        entries.push({
          subId: a.subId,
          subName: a.subName,
          trade: a.subTrade,
          projectId: project.projectId,
          projectName: project.name,
          reason: 'Certified Payroll Report overdue',
          urgency: STAGE_URGENCY[a.payrollCascadeStage] ?? 1,
          suspended: false,
          paymentWithheld: Boolean(a.paymentWithheld),
        });
      }
      if (a.workforceCascadeStage) {
        entries.push({
          subId: a.subId,
          subName: a.subName,
          trade: a.subTrade,
          projectId: project.projectId,
          projectName: project.name,
          reason: 'Monthly Workforce Report overdue',
          urgency: STAGE_URGENCY[a.workforceCascadeStage] ?? 1,
          suspended: false,
          paymentWithheld: Boolean(a.paymentWithheld),
        });
      }
    }
  });

  entries.sort((a, b) => b.urgency - a.urgency);

  return ok({ missingDocuments: entries });
});
