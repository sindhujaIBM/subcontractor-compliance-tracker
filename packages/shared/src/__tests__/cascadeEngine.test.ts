import { describe, it, expect } from 'vitest';
import {
  checkOnboardingCascade,
  checkRecurringCascade,
  isSuspendEligible,
  PAYROLL_OFFSETS,
  WORKFORCE_OFFSETS,
} from '../compliance/cascadeEngine';

describe('checkOnboardingCascade', () => {
  const start = '2026-01-01T00:00:00.000Z';

  it('sends the immediate reminder when there is no stage yet', () => {
    const decision = checkOnboardingCascade(start, undefined, new Date('2026-01-01T00:00:00.000Z'));
    expect(decision).toEqual({ nextStage: 'day1', action: 'reminder', isFollowUp: false });
  });

  it('does nothing between day 1 and day 8', () => {
    const decision = checkOnboardingCascade(start, 'day1', new Date('2026-01-05T00:00:00.000Z'));
    expect(decision.action).toBe('none');
  });

  it('sends the day 8 follow-up reminder once 8 days have elapsed', () => {
    const decision = checkOnboardingCascade(start, 'day1', new Date('2026-01-09T00:00:00.000Z'));
    expect(decision).toEqual({ nextStage: 'day8', action: 'reminder', isFollowUp: true });
  });

  it('sends the day 11 final reminder once 11 days have elapsed', () => {
    const decision = checkOnboardingCascade(start, 'day8', new Date('2026-01-12T00:00:00.000Z'));
    expect(decision).toEqual({ nextStage: 'day11', action: 'reminder', isFollowUp: true });
  });

  it('escalates once 14 days have elapsed past day 11', () => {
    const decision = checkOnboardingCascade(start, 'day11', new Date('2026-01-15T00:00:00.000Z'));
    expect(decision).toEqual({ nextStage: 'escalated', action: 'escalate', isFollowUp: true });
  });

  it('does nothing once escalated — a human must act next', () => {
    const decision = checkOnboardingCascade(start, 'escalated', new Date('2026-02-01T00:00:00.000Z'));
    expect(decision.action).toBe('none');
    expect(decision.nextStage).toBe('escalated');
  });
});

describe('checkRecurringCascade (payroll: 2 days before / next-day final check)', () => {
  const dueDate = '2026-01-10T00:00:00.000Z';

  it('does nothing more than 2 days before due', () => {
    const decision = checkRecurringCascade(dueDate, undefined, PAYROLL_OFFSETS, new Date('2026-01-07T00:00:00.000Z'));
    expect(decision.action).toBe('none');
  });

  it('sends the early reminder 2 days before due', () => {
    const decision = checkRecurringCascade(dueDate, undefined, PAYROLL_OFFSETS, new Date('2026-01-08T00:00:00.000Z'));
    expect(decision).toEqual({ nextStage: 'reminderEarly', action: 'reminder', isFollowUp: false });
  });

  it('sends the end-of-day reminder on the due date', () => {
    const decision = checkRecurringCascade(dueDate, 'reminderEarly', PAYROLL_OFFSETS, new Date('2026-01-10T00:00:00.000Z'));
    expect(decision).toEqual({ nextStage: 'reminderEndOfDay', action: 'reminder', isFollowUp: true });
  });

  it('escalates the day after due (final check window for payroll is 1 day)', () => {
    const decision = checkRecurringCascade(dueDate, 'finalCheck', PAYROLL_OFFSETS, new Date('2026-01-11T00:00:00.000Z'));
    expect(decision).toEqual({ nextStage: 'escalated', action: 'escalate', isFollowUp: true });
  });
});

describe('checkRecurringCascade (workforce: 5 days before / 3-day final check)', () => {
  const dueDate = '2026-01-31T00:00:00.000Z';

  it('sends the early reminder 5 days before due', () => {
    const decision = checkRecurringCascade(dueDate, undefined, WORKFORCE_OFFSETS, new Date('2026-01-26T00:00:00.000Z'));
    expect(decision).toEqual({ nextStage: 'reminderEarly', action: 'reminder', isFollowUp: false });
  });

  it('does not escalate before the 3-day final-check window has elapsed', () => {
    const decision = checkRecurringCascade(dueDate, 'finalCheck', WORKFORCE_OFFSETS, new Date('2026-02-02T00:00:00.000Z'));
    expect(decision.action).toBe('none');
  });

  it('escalates once 3 days past due', () => {
    const decision = checkRecurringCascade(dueDate, 'finalCheck', WORKFORCE_OFFSETS, new Date('2026-02-03T00:00:00.000Z'));
    expect(decision).toEqual({ nextStage: 'escalated', action: 'escalate', isFollowUp: true });
  });
});

describe('isSuspendEligible', () => {
  it('is not eligible below both thresholds', () => {
    expect(isSuspendEligible(2, 1)).toBe(false);
  });

  it('is eligible at 5 late submissions', () => {
    expect(isSuspendEligible(5, 0)).toBe(true);
  });

  it('is eligible at 3 fully missing submissions', () => {
    expect(isSuspendEligible(0, 3)).toBe(true);
  });

  it('late and missing counters are independent — 4 late + 2 missing is not yet eligible', () => {
    expect(isSuspendEligible(4, 2)).toBe(false);
  });
});
