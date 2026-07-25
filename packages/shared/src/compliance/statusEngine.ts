import type { Subcontractor, ProjectSubcontractor, ComplianceColor } from '../types/domain';

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
