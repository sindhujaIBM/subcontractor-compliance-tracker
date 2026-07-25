import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

let client: DynamoDBDocumentClient | null = null;

export function getDynamo(): DynamoDBDocumentClient {
  if (!client) {
    const base = new DynamoDBClient({ region: process.env.AWS_REGION || 'ca-west-1' });
    client = DynamoDBDocumentClient.from(base, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return client;
}

export const TABLE = process.env.DYNAMO_TABLE || 'compliance-tracker-prod';
