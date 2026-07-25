/**
 * Base seed — idempotent. Populates projects, subcontractors, and
 * project<->subcontractor assignments.
 *
 * Usage:
 *   node scripts/seed.mjs
 *
 * Requires the table to already exist (deploy services/compliance first).
 * Run scripts/seed-scenarios.mjs afterward for realistic historic data.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const TABLE = process.env.DYNAMO_TABLE || 'compliance-tracker-prod';
const REGION = process.env.AWS_REGION || 'ca-west-1';

const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true },
});

const now = new Date().toISOString();

async function put(item) {
  await db.send(new PutCommand({ TableName: TABLE, Item: item }));
}

const PROJECTS = [
  {
    projectId: 'riverside-tower',
    name: 'Riverside Mixed-Use Tower',
    address: '480 Riverside Dr, Calgary, AB',
    payrollDueWeekday: 'friday',
    workforceReportDueDay: 1,
    isPublicFunded: true,
  },
  {
    projectId: 'elm-street-water-plant',
    name: 'Elm Street Municipal Water Plant',
    address: '12 Elm St, Calgary, AB',
    payrollDueWeekday: 'friday',
    workforceReportDueDay: 5,
    isPublicFunded: true,
  },
  {
    projectId: 'harbor-retail-fitout',
    name: 'Harbor District Retail Fit-Out',
    address: '900 Harbor Way, Calgary, AB',
    payrollDueWeekday: 'friday',
    workforceReportDueDay: 1,
    isPublicFunded: false,
  },
];

const SUBS = [
  { subId: 'apex-electrical', name: 'Apex Electrical Co.', trade: 'Electrical', contactName: 'Maria Santos', contactEmail: 'maria@apexelectrical.example.com' },
  { subId: 'bedrock-concrete', name: 'Bedrock Concrete Group', trade: 'Concrete', contactName: 'Tom Reyes', contactEmail: 'tom@bedrockconcrete.example.com' },
  { subId: 'cornerstone-plumbing', name: 'Cornerstone Plumbing', trade: 'Plumbing', contactName: 'Priya Nair', contactEmail: 'priya@cornerstoneplumbing.example.com' },
  { subId: 'precision-drywall', name: 'Precision Drywall LLC', trade: 'Drywall', contactName: 'Jake Miller', contactEmail: 'jake@precisiondrywall.example.com' },
  { subId: 'summit-hvac', name: 'Summit HVAC Services', trade: 'HVAC', contactName: 'Angela Wu', contactEmail: 'angela@summithvac.example.com' },
  { subId: 'ironline-steel', name: 'Ironline Steel Erectors', trade: 'Steel Erection', contactName: 'Derek Cole', contactEmail: 'derek@ironlinesteel.example.com' },
  { subId: 'northgate-roofing', name: 'Northgate Roofing', trade: 'Roofing', contactName: 'Lena Fischer', contactEmail: 'lena@northgateroofing.example.com' },
  { subId: 'guardian-fire-safety', name: 'Guardian Fire Safety', trade: 'Fire Safety', contactName: 'Omar Hassan', contactEmail: 'omar@guardianfiresafety.example.com' },
  { subId: 'evergreen-landscaping', name: 'Evergreen Landscaping', trade: 'Landscaping', contactName: 'Sofia Petrov', contactEmail: 'sofia@evergreenlandscaping.example.com' },
  { subId: 'freshcoat-painting', name: 'Fresh Coat Painting', trade: 'Painting', contactName: 'Ben Carter', contactEmail: 'ben@freshcoatpainting.example.com' },
  { subId: 'sentinel-security', name: 'Sentinel Site Security', trade: 'Site Security', contactName: 'Nadia Khan', contactEmail: 'nadia@sentinelsecurity.example.com' },
  { subId: 'clearview-glazing', name: 'ClearView Glass & Glazing', trade: 'Glass & Glazing', contactName: 'Marcus Webb', contactEmail: 'marcus@clearviewglazing.example.com' },
  { subId: 'delta-excavation', name: 'Delta Excavation', trade: 'Excavation', contactName: 'Roy Delgado', contactEmail: 'roy@deltaexcavation.example.com' },
  { subId: 'titan-masonry', name: 'Titan Masonry Works', trade: 'Masonry', contactName: 'Grace Kim', contactEmail: 'grace@titanmasonry.example.com' },
];

// projectId -> [{ subId, mobilizedDate }]
const ASSIGNMENTS = {
  'riverside-tower': ['apex-electrical', 'bedrock-concrete', 'cornerstone-plumbing', 'precision-drywall', 'summit-hvac', 'ironline-steel', 'sentinel-security', 'titan-masonry'],
  'elm-street-water-plant': ['apex-electrical', 'bedrock-concrete', 'northgate-roofing', 'guardian-fire-safety'],
  'harbor-retail-fitout': ['evergreen-landscaping', 'freshcoat-painting', 'clearview-glazing'],
};

async function main() {
  for (const project of PROJECTS) {
    await put({ PK: `PROJECT#${project.projectId}`, SK: 'METADATA', entityType: 'PROJECT', ...project, createdAt: now });
  }
  console.log(`Seeded ${PROJECTS.length} projects.`);

  for (const sub of SUBS) {
    await put({
      PK: `SUB#${sub.subId}`,
      SK: 'METADATA',
      entityType: 'SUBCONTRACTOR',
      ...sub,
      onboardingStatus: 'pending',
      suspended: false,
      createdAt: now,
    });
  }
  console.log(`Seeded ${SUBS.length} subcontractors.`);

  let assignmentCount = 0;
  for (const [projectId, subIds] of Object.entries(ASSIGNMENTS)) {
    for (const subId of subIds) {
      const sub = SUBS.find((s) => s.subId === subId);
      await put({
        PK: `PROJECT#${projectId}`,
        SK: `SUB#${subId}`,
        projectId,
        subId,
        subName: sub.name,
        subTrade: sub.trade,
        mobilizedDate: now,
        lateCount: 0,
        missingCount: 0,
        suspended: false,
        paymentWithheld: false,
      });
      assignmentCount++;
    }
  }
  console.log(`Seeded ${assignmentCount} project<->subcontractor assignments.`);
}

main().then(() => console.log('Base seed complete.')).catch((err) => {
  console.error(err);
  process.exit(1);
});
