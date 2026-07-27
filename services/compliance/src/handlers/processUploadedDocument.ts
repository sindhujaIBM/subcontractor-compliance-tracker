import type { S3Event } from 'aws-lambda';
import { QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import {
  getDynamo,
  TABLE,
  getObjectAsBase64,
  extractDocumentFields,
  validateOnboardingDoc,
  validateRecurringDoc,
} from '@compliance-tracker/shared';

async function processOnboardingUpload(bucket: string, key: string, subId: string, docType: 'COI' | 'W9') {
  const { base64, mediaType } = await getObjectAsBase64(bucket, key);
  const fields = await extractDocumentFields(docType, mediaType, base64);
  const { valid, reason } = validateOnboardingDoc(docType, fields);

  const now = new Date().toISOString();
  const db = getDynamo();

  await db.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: TABLE,
            Item: {
              PK: `SUB#${subId}`,
              SK: `DOC#${docType}#${now}`,
              subId,
              docType,
              submittedAt: now,
              status: valid ? 'valid' : 'invalid',
              expiresAt: docType === 'COI' ? fields.expiresAt : undefined,
              rejectionReason: valid ? undefined : reason,
              sourceKey: key,
            },
          },
        },
        {
          Put: {
            TableName: TABLE,
            Item: {
              PK: `SUB#${subId}`,
              SK: `ACTION#${now}`,
              subId,
              timestamp: now,
              actor: 'ai',
              action: valid ? 'document_validated' : 'document_submitted',
              detail: `${docType} upload ${valid ? 'passed' : 'failed'} AI field extraction and validation${reason ? `: ${reason}` : ''}`,
            },
          },
        },
      ],
    })
  );

  if (!valid) return;

  const other = docType === 'COI' ? 'W9' : 'COI';
  const history = await db.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: { ':pk': `SUB#${subId}`, ':prefix': `DOC#${other}#` },
      ScanIndexForward: false,
      Limit: 1,
    })
  );
  const otherValid = history.Items?.[0]?.status === 'valid';
  if (otherValid) {
    await db.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: TABLE,
              Key: { PK: `SUB#${subId}`, SK: 'METADATA' },
              UpdateExpression: 'SET onboardingStatus = :status REMOVE onboardingCascadeStage, onboardingCascadeStartedAt',
              ExpressionAttributeValues: { ':status': 'onboarded' },
            },
          },
        ],
      })
    );
  }
}

async function processProjectUpload(
  bucket: string,
  key: string,
  projectId: string,
  subId: string,
  docType: 'PAYROLL' | 'WORKFORCE',
  period: string,
  dueDate: string
) {
  const { base64, mediaType } = await getObjectAsBase64(bucket, key);
  const fields = await extractDocumentFields(docType, mediaType, base64);
  const { valid, reason } = validateRecurringDoc(docType, fields);

  const now = new Date().toISOString();
  const late = now > dueDate;
  const cascadeField = docType === 'PAYROLL' ? 'payrollCascadeStage' : 'workforceCascadeStage';
  const db = getDynamo();

  await db.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: TABLE,
            Item: {
              PK: `PROJECT#${projectId}`,
              SK: `SUB#${subId}#DOC#${docType}#${period}`,
              projectId,
              subId,
              docType,
              period,
              dueDate,
              submittedAt: now,
              status: valid ? 'valid' : 'invalid',
              late,
              sourceKey: key,
            },
          },
        },
        {
          Update: {
            TableName: TABLE,
            Key: { PK: `PROJECT#${projectId}`, SK: `SUB#${subId}` },
            UpdateExpression: valid ? `REMOVE ${cascadeField} SET lateCount = lateCount + :lateDelta` : `SET lateCount = lateCount + :lateDelta`,
            ExpressionAttributeValues: { ':lateDelta': late ? 1 : 0 },
          },
        },
        {
          Put: {
            TableName: TABLE,
            Item: {
              PK: `PROJECT#${projectId}`,
              SK: `SUB#${subId}#ACTION#${now}`,
              projectId,
              subId,
              timestamp: now,
              actor: 'ai',
              action: 'document_submitted',
              detail: `${docType} upload for ${period} ${valid ? 'passed' : 'failed'} AI field extraction and validation${late ? ' (late)' : ''}${reason ? `: ${reason}` : ''}`,
            },
          },
        },
      ],
    })
  );
}

export const handler = async (event: S3Event) => {
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
    const parts = key.split('/');

    if (parts[0] === 'onboarding') {
      const [, subId, docType] = parts;
      if (docType === 'COI' || docType === 'W9') {
        await processOnboardingUpload(bucket, key, subId, docType);
      }
    } else if (parts[0] === 'project') {
      const [, projectId, subId, docType, period, encodedDueDate] = parts;
      if (docType === 'PAYROLL' || docType === 'WORKFORCE') {
        await processProjectUpload(bucket, key, projectId, subId, docType, period, decodeURIComponent(encodedDueDate));
      }
    } else {
      console.error(`Unrecognized upload key structure: ${key}`);
    }
  }
};
