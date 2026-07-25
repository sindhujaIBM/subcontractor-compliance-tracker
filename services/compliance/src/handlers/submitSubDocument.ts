import { QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { withHandler, ok, getDynamo, TABLE, ValidationError } from '@compliance-tracker/shared';

/**
 * Simulates the "AI scans for relevant fields" step with a simple,
 * deterministic, explainable rule rather than a real document-AI call —
 * building real OCR/extraction was an explicit, disclosed scope cut for
 * this prototype (see README). A resubmission always re-runs this check;
 * nothing is auto-accepted just because a file arrived.
 */
function validateOnboardingDoc(docType: 'COI' | 'W9', fields: Record<string, unknown>): { valid: boolean; reason?: string } {
  if (docType === 'COI') {
    const coverageLimit = Number(fields.coverageLimit ?? 0);
    const expiresAt = fields.expiresAt ? new Date(String(fields.expiresAt)) : null;
    if (coverageLimit < 1_000_000) return { valid: false, reason: 'Coverage limit below the required $1M minimum' };
    if (!expiresAt || expiresAt.getTime() < Date.now()) return { valid: false, reason: 'Certificate is expired or missing an expiration date' };
    return { valid: true };
  }
  const taxId = String(fields.taxId ?? '');
  if (!/^\d{2}-?\d{7}$/.test(taxId)) return { valid: false, reason: 'Tax ID is missing or not a valid EIN format' };
  return { valid: true };
}

export const handler = withHandler(async (event) => {
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
