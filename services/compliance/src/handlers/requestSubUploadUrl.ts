import { withSubAuth, ok, ValidationError, getUploadPresignedUrl } from '@compliance-tracker/shared';

const BUCKET = process.env.UPLOAD_BUCKET!;

export const handler = withSubAuth(async (event, subId) => {
  const docType = event.pathParameters?.docType;
  if (docType !== 'COI' && docType !== 'W9') throw new ValidationError('docType must be COI or W9');

  const body = event.body ? JSON.parse(event.body) : {};
  const contentType: string = body.contentType ?? 'application/pdf';
  const filename: string = (body.filename ?? 'document').replace(/[^a-zA-Z0-9._-]/g, '_');

  // Key encodes everything the S3-triggered processor needs: which sub,
  // which document type. Timestamp keeps every attempt as its own object
  // rather than overwriting the last one.
  const key = `onboarding/${subId}/${docType}/${Date.now()}-${filename}`;
  const uploadUrl = await getUploadPresignedUrl(BUCKET, key, contentType);

  return ok({ uploadUrl, key });
});
