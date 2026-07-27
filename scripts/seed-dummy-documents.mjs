/**
 * Backfills a real S3 object behind every historical document row that
 * doesn't have one yet (the scenario seed wrote DB records directly,
 * without an actual file — this gives every submission something a sub or
 * compliance manager can actually open via the "View document" link).
 *
 * Usage:
 *   node scripts/seed-dummy-documents.mjs
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const TABLE = process.env.DYNAMO_TABLE || 'compliance-tracker-prod';
const BUCKET = process.env.UPLOAD_BUCKET || 'compliance-tracker-uploads-prod-946839354953';
const REGION = process.env.AWS_REGION || 'ca-west-1';

const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), { marshallOptions: { removeUndefinedValues: true } });
const s3 = new S3Client({ region: REGION });

function coiText(item) {
  return [
    'CERTIFICATE OF LIABILITY INSURANCE',
    '',
    `Named Insured: ${item.subId}`,
    'Producer: Placeholder Insurance Brokers',
    '',
    'Coverage: Commercial General Liability',
    `Each Occurrence Limit: $${item.status === 'valid' ? '2,000,000' : '500,000'}`,
    '',
    `Policy Effective Date: ${item.submittedAt?.slice(0, 10) ?? ''}`,
    `Policy Expiration Date: ${item.expiresAt?.slice(0, 10) ?? '(none on file)'}`,
    '',
    item.status === 'valid' ? 'STATUS: Meets contract minimum coverage.' : `STATUS: ${item.rejectionReason ?? 'Did not pass validation.'}`,
  ].join('\n');
}

function w9Text(item) {
  return [
    'FORM W-9 — Request for Taxpayer Identification Number and Certification',
    '',
    `Business Name: ${item.subId}`,
    `Tax ID: ${item.status === 'valid' ? '87-1234567' : '(missing or invalid format)'}`,
    '',
    item.status === 'valid' ? 'STATUS: Valid EIN format on file.' : `STATUS: ${item.rejectionReason ?? 'Did not pass validation.'}`,
  ].join('\n');
}

function payrollText(item) {
  return [
    'CERTIFIED PAYROLL REPORT (WH-347 style)',
    '',
    `Contractor: ${item.subId}`,
    `Project: ${item.projectId}`,
    `Week Ending: ${item.period}`,
    `Submitted: ${item.submittedAt?.slice(0, 10) ?? ''}${item.late ? ' (LATE)' : ''}`,
    '',
    'Employee            Classification        Hours    Rate      Gross Wages',
    'J. Alvarez          Journeyman             40      $38.50    $1,540.00',
    'M. Chen              Apprentice             38      $27.00    $1,026.00',
    '',
    'STATEMENT OF COMPLIANCE: I certify the above is true and accurate under penalty of perjury.',
  ].join('\n');
}

function workforceText(item) {
  return [
    'MONTHLY WORKFORCE PARTICIPATION REPORT',
    '',
    `Contractor: ${item.subId}`,
    `Project: ${item.projectId}`,
    `Reporting Period: ${item.period}`,
    `Submitted: ${item.submittedAt?.slice(0, 10) ?? ''}`,
    '',
    'MWBE Participation This Period: 22.5%',
    'Contract-to-Date Participation: 19.8% (goal: 20%)',
  ].join('\n');
}

async function backfill(pk, sk, key, content) {
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: content, ContentType: 'text/plain' }));
  await db.send(new UpdateCommand({ TableName: TABLE, Key: { PK: pk, SK: sk }, UpdateExpression: 'SET sourceKey = :k', ExpressionAttributeValues: { ':k': key } }));
}

async function main() {
  const subs = await db.send(
    new QueryCommand({ TableName: TABLE, IndexName: 'GSI1-entityType-name', KeyConditionExpression: 'entityType = :t', ExpressionAttributeValues: { ':t': 'SUBCONTRACTOR' } })
  );

  let onboardingCount = 0;
  for (const sub of subs.Items ?? []) {
    const items = await db.send(new QueryCommand({ TableName: TABLE, KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': `SUB#${sub.subId}` } }));
    for (const item of items.Items ?? []) {
      if (typeof item.SK !== 'string' || !item.SK.startsWith('DOC#') || item.sourceKey) continue;
      const docType = item.docType;
      const key = `onboarding/${sub.subId}/${docType}/backfill-${item.SK.split('#').pop()}.txt`;
      const content = docType === 'COI' ? coiText(item) : w9Text(item);
      await backfill(item.PK, item.SK, key, content);
      onboardingCount++;
    }
  }
  console.log(`Backfilled ${onboardingCount} onboarding document(s) with a real S3 file.`);

  const projects = await db.send(
    new QueryCommand({ TableName: TABLE, IndexName: 'GSI1-entityType-name', KeyConditionExpression: 'entityType = :t', ExpressionAttributeValues: { ':t': 'PROJECT' } })
  );

  let projectCount = 0;
  for (const project of projects.Items ?? []) {
    const items = await db.send(new QueryCommand({ TableName: TABLE, KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': `PROJECT#${project.projectId}` } }));
    for (const item of items.Items ?? []) {
      if (typeof item.SK !== 'string' || !/^SUB#[^#]+#DOC#/.test(item.SK) || item.sourceKey) continue;
      const docType = item.docType;
      const key = `project/${project.projectId}/${item.subId}/${docType}/${item.period}/backfill-${item.SK.split('#').pop()}.txt`;
      const content = docType === 'PAYROLL' ? payrollText(item) : workforceText(item);
      await backfill(item.PK, item.SK, key, content);
      projectCount++;
    }
  }
  console.log(`Backfilled ${projectCount} project document(s) with a real S3 file.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
