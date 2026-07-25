import { describe, it, expect } from 'vitest';
import { onboardingColor, projectAssignmentColor, worstColor } from '../compliance/statusEngine';

describe('onboardingColor', () => {
  it('is green when onboarded', () => {
    expect(onboardingColor({ suspended: false, onboardingStatus: 'onboarded' })).toBe('green');
  });

  it('is yellow when pending (somewhere in the reminder cascade)', () => {
    expect(onboardingColor({ suspended: false, onboardingStatus: 'pending' })).toBe('yellow');
  });

  it('is red when suspended, regardless of onboardingStatus', () => {
    expect(onboardingColor({ suspended: true, onboardingStatus: 'pending' })).toBe('red');
  });
});

describe('projectAssignmentColor', () => {
  it('is green with no cascade and no withheld payment', () => {
    expect(
      projectAssignmentColor({ suspended: false, payrollCascadeStage: undefined, workforceCascadeStage: undefined, paymentWithheld: false })
    ).toBe('green');
  });

  it('is yellow when in an active cascade', () => {
    expect(
      projectAssignmentColor({ suspended: false, payrollCascadeStage: 'reminderEarly', workforceCascadeStage: undefined, paymentWithheld: false })
    ).toBe('yellow');
  });

  it('is yellow when payment is withheld but not suspended — the two levers are independent', () => {
    expect(
      projectAssignmentColor({ suspended: false, payrollCascadeStage: undefined, workforceCascadeStage: undefined, paymentWithheld: true })
    ).toBe('yellow');
  });

  it('is red when suspended, even if payment is not withheld', () => {
    expect(
      projectAssignmentColor({ suspended: true, payrollCascadeStage: undefined, workforceCascadeStage: undefined, paymentWithheld: false })
    ).toBe('red');
  });
});

describe('worstColor', () => {
  it('returns green when everything is green', () => {
    expect(worstColor(['green', 'green'])).toBe('green');
  });

  it('prefers yellow over green', () => {
    expect(worstColor(['green', 'yellow'])).toBe('yellow');
  });

  it('prefers red over yellow and green', () => {
    expect(worstColor(['green', 'yellow', 'red'])).toBe('red');
  });
});
