/**
 * Adds passwordHash to existing subcontractor records without touching
 * anything else — seed.mjs itself does a full PutCommand upsert, which
 * would reset onboardingStatus etc. back to their seed.mjs defaults and
 * wipe out the scenario data seed-scenarios.mjs already wrote. This uses
 * UpdateCommand instead, scoped to exactly one attribute.
 *
 * Usage:
 *   node scripts/set-sub-passwords.mjs
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { hashPassword } from '@compliance-tracker/shared';

const TABLE = process.env.DYNAMO_TABLE || 'compliance-tracker-prod';
const REGION = process.env.AWS_REGION || 'ca-west-1';
const DEMO_SUB_PASSWORD = 'Passw0rd!';

const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), { marshallOptions: { removeUndefinedValues: true } });

async function main() {
  const subs = await db.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: 'GSI1-entityType-name',
      KeyConditionExpression: 'entityType = :t',
      ExpressionAttributeValues: { ':t': 'SUBCONTRACTOR' },
    })
  );

  const passwordHash = hashPassword(DEMO_SUB_PASSWORD);
  for (const sub of subs.Items ?? []) {
    await db.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { PK: `SUB#${sub.subId}`, SK: 'METADATA' },
        UpdateExpression: 'SET passwordHash = :h',
        ExpressionAttributeValues: { ':h': passwordHash },
      })
    );
  }
  console.log(`Set passwordHash on ${subs.Items?.length ?? 0} subcontractors. Sub portal login: subId as username, password "${DEMO_SUB_PASSWORD}".`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
