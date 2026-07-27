import { QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { withComplianceAuth, ok, getDynamo, TABLE, ValidationError, validateOnboardingDoc } from '@compliance-tracker/shared';

/**
 * Manual-entry path — lets the compliance manager key in fields directly
 * (or is used by the Loom demo without a physical file). Real subcontractor
 * uploads go through requestSubUploadUrl -> S3 -> processUploadedDocument,
 * which runs the exact same validateOnboardingDoc rule, just fed by
 * AI-extracted fields instead of a typed request body.
 */
export const handler = withComplianceAuth(async (event) => {
  const { subId, docType } = event.pathParameters ?? {};
  if (!subId || !docType) throw new ValidationError('subId and docType are required');
  if (docType !== 'COI' && docType !== 'W9') throw new ValidationError('docType must be COI or W9');

  const body = event.body ? JSON.parse(event.body) : {};
  const { valid, reason } = validateOnboardingDoc(docType, body);
  const now = new Date().toISOString();
  const docExpiresAt = docType === 'COI' ? body.expiresAt : undefined;

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
              expiresAt: docExpiresAt,
              rejectionReason: valid ? undefined : reason,
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
              detail: `${docType} ${valid ? 'passed' : 'failed'} field validation${reason ? `: ${reason}` : ''}`,
            },
          },
        },
      ],
    })
  );

  // Onboarding only completes once BOTH COI and W-9 have a currently-valid submission.
  let onboarded = false;
  if (valid) {
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
    const latestOther = history.Items?.[0];
    onboarded = Boolean(latestOther && latestOther.status === 'valid');
  }

  if (onboarded) {
    await db.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: TABLE,
              Key: { PK: `SUB#${subId}`, SK: 'METADATA' },
              UpdateExpression:
                'SET onboardingStatus = :status REMOVE onboardingCascadeStage, onboardingCascadeStartedAt',
              ExpressionAttributeValues: { ':status': 'onboarded' },
            },
          },
        ],
      })
    );
  }

  return ok({ subId, docType, valid, reason, onboarded });
});
