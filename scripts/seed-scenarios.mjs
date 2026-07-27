/**
 * Scenario seed — the "system that's been running" historic data.
 * Run AFTER seed.mjs.
 *
 * Dates are always computed relative to seed-time (daysAgo/daysFromNow),
 * never hardcoded, so the demo looks current and cascade math stays
 * internally consistent no matter when this is run.
 *
 * Usage:
 *   node scripts/seed-scenarios.mjs
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const TABLE = process.env.DYNAMO_TABLE || 'compliance-tracker-prod';
const REGION = process.env.AWS_REGION || 'ca-west-1';

const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true },
});

const DAY = 24 * 60 * 60 * 1000;
const now = new Date();

function daysAgo(n) { return new Date(now - n * DAY).toISOString(); }
function daysFromNow(n) { return new Date(now.getTime() + n * DAY).toISOString(); }

async function put(item) {
  await db.send(new PutCommand({ TableName: TABLE, Item: item }));
}
async function update(pk, sk, expr, values) {
  await db.send(new UpdateCommand({ TableName: TABLE, Key: { PK: pk, SK: sk }, UpdateExpression: expr, ExpressionAttributeValues: values }));
}

function onboardingAction(subId, timestamp, actor, action, detail, reason) {
  return { PK: `SUB#${subId}`, SK: `ACTION#${timestamp}`, subId, timestamp, actor, action, detail, reason };
}
function projectAction(projectId, subId, timestamp, actor, action, detail, reason) {
  return { PK: `PROJECT#${projectId}`, SK: `SUB#${subId}#ACTION#${timestamp}`, projectId, subId, timestamp, actor, action, detail, reason };
}

/** Weekly payroll history, going back `weeks` from today, minus the periods listed as late/missing. */
async function seedPayrollHistory(projectId, subId, weeks, { lateWeeksAgo = [], missingWeeksAgo = [] } = {}) {
  for (let w = weeks; w >= 1; w--) {
    const weekEndingDate = daysAgo(w * 7).slice(0, 10);
    const dueDate = daysAgo(w * 7 - 2); // due 2 days after the week ends, matching the reminder cadence's "2 days before" framing in reverse
    if (missingWeeksAgo.includes(w)) {
      // Never submitted — its own dated row (no submittedAt), not just a bump to missingCount.
      await put({
        PK: `PROJECT#${projectId}`,
        SK: `SUB#${subId}#DOC#PAYROLL#${weekEndingDate}`,
        projectId,
        subId,
        docType: 'PAYROLL',
        period: weekEndingDate,
        dueDate,
        status: 'missing',
      });
      continue;
    }
    const late = lateWeeksAgo.includes(w);
    const submittedAt = late ? new Date(new Date(dueDate).getTime() + 2 * DAY).toISOString() : dueDate;
    await put({
      PK: `PROJECT#${projectId}`,
      SK: `SUB#${subId}#DOC#PAYROLL#${weekEndingDate}`,
      projectId,
      subId,
      docType: 'PAYROLL',
      period: weekEndingDate,
      dueDate,
      submittedAt,
      status: 'valid',
      late,
    });
  }
}

async function seedWorkforceHistory(projectId, subId, months) {
  for (let m = months; m >= 1; m--) {
    const period = daysAgo(m * 30).slice(0, 7); // yyyy-mm
    const dueDate = daysAgo(m * 30 - 5);
    await put({
      PK: `PROJECT#${projectId}`,
      SK: `SUB#${subId}#DOC#WORKFORCE#${period}`,
      projectId,
      subId,
      docType: 'WORKFORCE',
      period,
      dueDate,
      submittedAt: dueDate,
      status: 'valid',
      late: false,
    });
  }
}

async function onboardSub(subId, { coiExpiresInMonths = 10, extraExpiredCoi = false } = {}) {
  const coiSubmittedAt = daysAgo(60);
  if (extraExpiredCoi) {
    await put({
      PK: `SUB#${subId}`,
      SK: `DOC#COI#${daysAgo(420)}`,
      subId,
      docType: 'COI',
      submittedAt: daysAgo(420),
      status: 'valid',
      expiresAt: daysAgo(60), // expired 2 months ago, prompting the renewal below
    });
    await put(onboardingAction(subId, daysAgo(60), 'ai', 'document_validated', 'COI renewal received ahead of expiration.'));
  }
  await put({
    PK: `SUB#${subId}`,
    SK: `DOC#COI#${coiSubmittedAt}`,
    subId,
    docType: 'COI',
    submittedAt: coiSubmittedAt,
    status: 'valid',
    expiresAt: daysFromNow(coiExpiresInMonths * 30),
  });
  const w9SubmittedAt = daysAgo(300);
  await put({ PK: `SUB#${subId}`, SK: `DOC#W9#${w9SubmittedAt}`, subId, docType: 'W9', submittedAt: w9SubmittedAt, status: 'valid' });
  await update(`SUB#${subId}`, 'METADATA', 'SET onboardingStatus = :s', { ':s': 'onboarded' });
  await put(onboardingAction(subId, w9SubmittedAt, 'ai', 'document_validated', 'W-9 on file.'));
  await put(onboardingAction(subId, coiSubmittedAt, 'ai', 'document_validated', 'COI passed field validation.'));
}

async function main() {
  // ── Green: fully onboarded, clean history ──────────────────────────────
  await onboardSub('apex-electrical');
  await onboardSub('bedrock-concrete', { extraExpiredCoi: true });
  await onboardSub('cornerstone-plumbing');
  await onboardSub('summit-hvac');
  await onboardSub('evergreen-landscaping');
  await onboardSub('freshcoat-painting');
  await onboardSub('clearview-glazing');

  await seedPayrollHistory('riverside-tower', 'apex-electrical', 10);
  await seedWorkforceHistory('riverside-tower', 'apex-electrical', 3);
  await seedPayrollHistory('elm-street-water-plant', 'apex-electrical', 6);
  await seedWorkforceHistory('elm-street-water-plant', 'apex-electrical', 2);

  await seedPayrollHistory('riverside-tower', 'bedrock-concrete', 10);
  await seedWorkforceHistory('riverside-tower', 'bedrock-concrete', 3);
  await seedPayrollHistory('elm-street-water-plant', 'bedrock-concrete', 6);
  await seedWorkforceHistory('elm-street-water-plant', 'bedrock-concrete', 2);

  await seedPayrollHistory('riverside-tower', 'cornerstone-plumbing', 10);
  await seedWorkforceHistory('riverside-tower', 'cornerstone-plumbing', 3);
  await seedPayrollHistory('riverside-tower', 'summit-hvac', 10);
  await seedWorkforceHistory('riverside-tower', 'summit-hvac', 3);

  console.log('Seeded 7 green subcontractors with clean history.');

  // ── Yellow: onboarding cascade in progress ──────────────────────────────
  await put({ PK: 'SUB#precision-drywall', SK: `DOC#W9#${daysAgo(1)}`, subId: 'precision-drywall', docType: 'W9', submittedAt: daysAgo(1), status: 'invalid', rejectionReason: 'Tax ID is missing or not a valid EIN format' });
  await update('SUB#precision-drywall', 'METADATA', 'SET onboardingCascadeStage = :s, onboardingCascadeStartedAt = :t', { ':s': 'day1', ':t': daysAgo(1) });
  await put(onboardingAction('precision-drywall', daysAgo(1), 'ai', 'reminder_sent', 'Stage day1: Action needed: W9 required before you can be onboarded'));

  await put({ PK: 'SUB#ironline-steel', SK: `DOC#COI#${daysAgo(9)}`, subId: 'ironline-steel', docType: 'COI', submittedAt: daysAgo(9), status: 'invalid', rejectionReason: 'Coverage limit below the required $1M minimum' });
  await update('SUB#ironline-steel', 'METADATA', 'SET onboardingCascadeStage = :s, onboardingCascadeStartedAt = :t', { ':s': 'day8', ':t': daysAgo(9) });
  await put(onboardingAction('ironline-steel', daysAgo(1), 'ai', 'reminder_sent', 'Stage day8: Following up: COI still outstanding'));
  await put(onboardingAction('ironline-steel', daysAgo(9), 'ai', 'reminder_sent', 'Stage day1: Action needed: COI required before you can be onboarded'));

  await put({ PK: 'SUB#northgate-roofing', SK: `DOC#COI#${daysAgo(12)}`, subId: 'northgate-roofing', docType: 'COI', submittedAt: daysAgo(12), status: 'missing' });
  await update('SUB#northgate-roofing', 'METADATA', 'SET onboardingCascadeStage = :s, onboardingCascadeStartedAt = :t', { ':s': 'day11', ':t': daysAgo(12) });
  await put(onboardingAction('northgate-roofing', daysAgo(1), 'ai', 'reminder_sent', 'Stage day11: Following up: COI still outstanding'));
  await put(onboardingAction('northgate-roofing', daysAgo(4), 'ai', 'reminder_sent', 'Stage day8: Following up: COI still outstanding'));
  await put(onboardingAction('northgate-roofing', daysAgo(12), 'ai', 'reminder_sent', 'Stage day1: Action needed: COI required before you can be onboarded'));

  console.log('Seeded 3 subcontractors mid onboarding-cascade.');

  // ── Yellow: guardian-fire-safety — onboarded, but active payroll cascade + suspend-eligible on lateCount ──
  await onboardSub('guardian-fire-safety');
  await seedPayrollHistory('elm-street-water-plant', 'guardian-fire-safety', 9, { lateWeeksAgo: [2, 3, 5, 6, 8], missingWeeksAgo: [9] });
  await update('PROJECT#elm-street-water-plant', 'SUB#guardian-fire-safety', 'SET lateCount = :l, missingCount = :m, payrollCascadeStage = :s', { ':l': 5, ':m': 1, ':s': 'reminderEndOfDay' });
  await put(projectAction('elm-street-water-plant', 'guardian-fire-safety', daysAgo(0), 'ai', 'reminder_sent', 'Certified Payroll Report due today — reminder sent.'));
  await seedWorkforceHistory('elm-street-water-plant', 'guardian-fire-safety', 2);
  console.log('Seeded guardian-fire-safety: active payroll cascade, suspend-eligible on late count (not yet suspended).');

  // ── Yellow: sentinel-security — payment withheld, NOT suspended (independent levers) ──
  await onboardSub('sentinel-security');
  await seedPayrollHistory('riverside-tower', 'sentinel-security', 8, { lateWeeksAgo: [1, 2] });
  await update('PROJECT#riverside-tower', 'SUB#sentinel-security', 'SET paymentWithheld = :true, paymentWithheldReason = :r, lateCount = :l', {
    ':true': true,
    ':r': 'Certified payroll for the last 2 weeks has not yet been verified.',
    ':l': 2,
  });
  await put(projectAction('riverside-tower', 'sentinel-security', daysAgo(2), 'human', 'payment_withheld', undefined, 'Certified payroll for the last 2 weeks has not yet been verified.'));
  console.log('Seeded sentinel-security: payment withheld, not suspended — demonstrates the two human levers are independent.');

  // ── Green: clearview-glazing — Harbor, clean, no recurring docs (private project) ──
  console.log('clearview-glazing, evergreen-landscaping, freshcoat-painting: onboarded, no recurring compliance (private-funded project).');

  // ── Red: delta-excavation — onboarding escalated then suspended by a human, never assigned to a project ──
  await put({ PK: 'SUB#delta-excavation', SK: `DOC#COI#${daysAgo(20)}`, subId: 'delta-excavation', docType: 'COI', submittedAt: daysAgo(20), status: 'missing' });
  await update('SUB#delta-excavation', 'METADATA', 'SET onboardingCascadeStage = :s, onboardingCascadeStartedAt = :t, suspended = :true, suspendedReason = :r, onboardingStatus = :os', {
    ':s': 'escalated',
    ':t': daysAgo(20),
    ':true': true,
    ':r': 'No response after 14 days of reminders — escalated with no COI or W-9 ever received.',
    ':os': 'suspended',
  });
  await put(onboardingAction('delta-excavation', daysAgo(20), 'ai', 'reminder_sent', 'Stage day1: Action needed: COI and W9 required before you can be onboarded'));
  await put(onboardingAction('delta-excavation', daysAgo(13), 'ai', 'reminder_sent', 'Stage day8: Following up: COI and W9 still outstanding'));
  await put(onboardingAction('delta-excavation', daysAgo(10), 'ai', 'reminder_sent', 'Stage day11: Following up: COI and W9 still outstanding'));
  await put(onboardingAction('delta-excavation', daysAgo(7), 'ai', 'escalated', 'Onboarding reminder cascade exhausted — awaiting a human decision.'));
  await put(onboardingAction('delta-excavation', daysAgo(6), 'human', 'suspended', undefined, 'No response after 14 days of reminders — escalated with no COI or W-9 ever received.'));
  console.log('Seeded delta-excavation: onboarding-level suspension (never assigned to a project).');

  // ── Red: titan-masonry — onboarded fine, but project-suspended after 3 missing payroll submissions ──
  await onboardSub('titan-masonry');
  await seedPayrollHistory('riverside-tower', 'titan-masonry', 8, { lateWeeksAgo: [1], missingWeeksAgo: [4, 5, 6] });
  await update('PROJECT#riverside-tower', 'SUB#titan-masonry', 'SET missingCount = :m, lateCount = :l, suspended = :true, suspendedReason = :r', {
    ':m': 3,
    ':l': 1,
    ':true': true,
    ':r': 'Missed 3 consecutive certified payroll submissions.',
  });
  await put(projectAction('riverside-tower', 'titan-masonry', daysAgo(28), 'ai', 'escalated', 'Certified Payroll for period escalated (never submitted) — awaiting a human decision.'));
  await put(projectAction('riverside-tower', 'titan-masonry', daysAgo(27), 'human', 'suspended', undefined, 'Missed 3 consecutive certified payroll submissions.'));
  console.log('Seeded titan-masonry: project-level suspension after crossing the 3-missing threshold.');
}

main().then(() => console.log('Scenario seed complete.')).catch((err) => {
  console.error(err);
  process.exit(1);
});
