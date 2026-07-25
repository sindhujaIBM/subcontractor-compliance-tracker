import type { OnboardingCascadeStage, RecurringCascadeStage } from '../types/domain';

function daysBetween(from: string, to: Date): number {
  const start = new Date(from);
  const ms = to.getTime() - start.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export interface OnboardingCascadeDecision {
  nextStage: OnboardingCascadeStage;
  action: 'reminder' | 'escalate' | 'none';
  /** true when this reminder follows an earlier one that didn't fully resolve things — copy should acknowledge the resubmission, not repeat the first message verbatim */
  isFollowUp: boolean;
}

/**
 * Onboarding cascade: day 1 (immediate) -> day 8 -> day 11 -> escalate day 14.
 * `cascadeStartedAt` is the timestamp the cascade began (first missing/invalid
 * detection) — missing and invalid docs share this one cascade, no separate
 * treatment track for either failure mode.
 */
export function checkOnboardingCascade(
  cascadeStartedAt: string,
  currentStage: OnboardingCascadeStage | undefined,
  today: Date = new Date()
): OnboardingCascadeDecision {
  const elapsed = daysBetween(cascadeStartedAt, today);

  if (!currentStage) {
    return { nextStage: 'day1', action: 'reminder', isFollowUp: false };
  }
  if (currentStage === 'day1' && elapsed >= 8) {
    return { nextStage: 'day8', action: 'reminder', isFollowUp: true };
  }
  if (currentStage === 'day8' && elapsed >= 11) {
    return { nextStage: 'day11', action: 'reminder', isFollowUp: true };
  }
  if (currentStage === 'day11' && elapsed >= 14) {
    return { nextStage: 'escalated', action: 'escalate', isFollowUp: true };
  }
  // Still waiting inside the current window — no action due yet.
  return { nextStage: currentStage, action: 'none', isFollowUp: false };
}

export interface RecurringCascadeDecision {
  nextStage: RecurringCascadeStage;
  action: 'reminder' | 'escalate' | 'none';
  isFollowUp: boolean;
}

export interface RecurringCascadeOffsets {
  /** days before the due date the first reminder goes out (2 for payroll, 5 for workforce) */
  earlyReminderDaysBefore: number;
  /** days after the due date the final check/escalation trigger fires (1 for payroll's "next day", 3 for workforce's "in 3 days") */
  finalCheckDaysAfter: number;
}

export const PAYROLL_OFFSETS: RecurringCascadeOffsets = { earlyReminderDaysBefore: 2, finalCheckDaysAfter: 1 };
export const WORKFORCE_OFFSETS: RecurringCascadeOffsets = { earlyReminderDaysBefore: 5, finalCheckDaysAfter: 3 };

/**
 * Recurring (payroll/workforce) cascade: early reminder -> end-of-due-day
 * reminder -> final check -> escalate. Driven by a due date rather than a
 * cascade-start timestamp, since these recur on their own schedule.
 *
 * On a resubmission that doesn't fully resolve things but the window hasn't
 * run out yet, this returns `action: 'reminder'` with `isFollowUp: true`
 * rather than escalating — the escalation and reminder clocks are the same
 * clock, not two separate tracks.
 */
export function checkRecurringCascade(
  dueDate: string,
  currentStage: RecurringCascadeStage | undefined,
  offsets: RecurringCascadeOffsets,
  today: Date = new Date()
): RecurringCascadeDecision {
  const daysFromDue = daysBetween(dueDate, today); // negative = before due date

  if (!currentStage) {
    if (daysFromDue >= -offsets.earlyReminderDaysBefore) {
      return { nextStage: 'reminderEarly', action: 'reminder', isFollowUp: false };
    }
    return { nextStage: 'reminderEarly', action: 'none', isFollowUp: false };
  }
  if (currentStage === 'reminderEarly') {
    if (daysFromDue >= 0) {
      return { nextStage: 'reminderEndOfDay', action: 'reminder', isFollowUp: true };
    }
    return { nextStage: currentStage, action: 'none', isFollowUp: false };
  }
  if (currentStage === 'reminderEndOfDay') {
    if (daysFromDue >= offsets.finalCheckDaysAfter) {
      return { nextStage: 'escalated', action: 'escalate', isFollowUp: true };
    }
    if (daysFromDue > 0) {
      // Past due, inside the "is this still missing?" check window — this is
      // a silent state transition, not another reminder (the flowchart's
      // "the next day?" node is a check, not a third send).
      return { nextStage: 'finalCheck', action: 'none', isFollowUp: false };
    }
    return { nextStage: currentStage, action: 'none', isFollowUp: false };
  }
  if (currentStage === 'finalCheck') {
    if (daysFromDue >= offsets.finalCheckDaysAfter) {
      return { nextStage: 'escalated', action: 'escalate', isFollowUp: true };
    }
    return { nextStage: currentStage, action: 'none', isFollowUp: false };
  }
  // escalated — terminal, waiting on a human decision
  return { nextStage: currentStage, action: 'none', isFollowUp: false };
}

/** 5 late (eventually received) or 3 fully missing -> suspend becomes a human-available option. Never auto-triggered. */
export function isSuspendEligible(lateCount: number, missingCount: number): boolean {
  return lateCount >= 5 || missingCount >= 3;
}
