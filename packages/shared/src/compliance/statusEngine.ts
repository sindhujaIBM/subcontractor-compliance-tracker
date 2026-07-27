import type { Subcontractor, ProjectSubcontractor, ComplianceColor, RecurringCascadeStage } from '../types/domain';
import { isSuspendEligible } from './cascadeEngine';

/**
 * Red/yellow/green is always computed on read, never stored — mirrors the
 * Library project's "overdue" principle. Storing the color directly would
 * drift the moment a day passes without a write; deriving it from stored
 * facts (suspended, paymentWithheld, cascade stage) + the current date is
 * the only way it stays accurate without a background job.
 */

/** Onboarding-level color: red = suspended, yellow = in reminder cascade, green = onboarded. */
export function onboardingColor(sub: Pick<Subcontractor, 'suspended' | 'onboardingStatus'>): ComplianceColor {
  if (sub.suspended) return 'red';
  if (sub.onboardingStatus === 'onboarded') return 'green';
  return 'yellow';
}

/**
 * Project-assignment color for the recurring (post-mobilization) compliance
 * loop. Suspension is the only thing that turns this red. A withheld payment
 * is a serious, visible state, but it is a distinct human lever from
 * suspension — deliberately not folded into the color itself (see
 * SubcontractorStatusSummary.paymentWithheld), so the two decisions stay
 * visually independent, which is the point the seeded "withheld but not
 * suspended" scenario exists to demonstrate.
 */
export function projectAssignmentColor(
  assignment: Pick<ProjectSubcontractor, 'suspended' | 'payrollCascadeStage' | 'workforceCascadeStage' | 'paymentWithheld'>
): ComplianceColor {
  if (assignment.suspended) return 'red';
  const inCascade = Boolean(assignment.payrollCascadeStage || assignment.workforceCascadeStage);
  if (inCascade || assignment.paymentWithheld) return 'yellow';
  return 'green';
}

/** A sub's overall color on a summary view is the worst color across every signal shown for it. */
export function worstColor(colors: ComplianceColor[]): ComplianceColor {
  if (colors.includes('red')) return 'red';
  if (colors.includes('yellow')) return 'yellow';
  return 'green';
}

export interface ProjectIssueSignal {
  projectId: string;
  suspended: boolean;
  suspendedReason?: string;
  paymentWithheld: boolean;
  paymentWithheldReason?: string;
  payrollCascadeStage?: RecurringCascadeStage;
  workforceCascadeStage?: RecurringCascadeStage;
  lateCount: number;
  missingCount: number;
}

const CASCADE_STAGE_LABEL: Record<RecurringCascadeStage, string> = {
  reminderEarly: 'early reminder sent',
  reminderEndOfDay: 'due-date reminder sent',
  finalCheck: 'in final check window',
  escalated: 'escalated — awaiting decision',
};

/**
 * The single most important thing to tell a human about this sub, across
 * onboarding and every project assignment — worst issue first. A "needs
 * attention" pill should never appear without an answer to "attention to
 * what?" right next to it.
 */
export function describeTopIssue(
  sub: Pick<Subcontractor, 'suspended' | 'suspendedReason' | 'onboardingStatus'>,
  projects: ProjectIssueSignal[]
): string | null {
  if (sub.suspended) {
    return `Onboarding suspended${sub.suspendedReason ? ` — ${sub.suspendedReason}` : ''}.`;
  }

  const suspendedProject = projects.find((p) => p.suspended);
  if (suspendedProject) {
    return `Suspended on ${suspendedProject.projectId}${suspendedProject.suspendedReason ? ` — ${suspendedProject.suspendedReason}` : ''}.`;
  }

  const withheldProject = projects.find((p) => p.paymentWithheld);
  if (withheldProject) {
    return `Payment withheld on ${withheldProject.projectId}${withheldProject.paymentWithheldReason ? ` — ${withheldProject.paymentWithheldReason}` : ''}.`;
  }

  const cascadeProject = projects.find((p) => p.payrollCascadeStage || p.workforceCascadeStage);
  if (cascadeProject) {
    const docLabel = cascadeProject.payrollCascadeStage ? 'Certified Payroll' : 'Monthly Workforce Report';
    const stage = (cascadeProject.payrollCascadeStage ?? cascadeProject.workforceCascadeStage) as RecurringCascadeStage;
    const eligible = isSuspendEligible(cascadeProject.lateCount, cascadeProject.missingCount);
    return `${docLabel} on ${cascadeProject.projectId}: ${CASCADE_STAGE_LABEL[stage]} (${cascadeProject.lateCount} late, ${cascadeProject.missingCount} missing)${eligible ? ' — suspension now available' : ''}.`;
  }

  if (sub.onboardingStatus !== 'onboarded') {
    return 'Still onboarding — waiting on COI/W-9.';
  }

  return null;
}
