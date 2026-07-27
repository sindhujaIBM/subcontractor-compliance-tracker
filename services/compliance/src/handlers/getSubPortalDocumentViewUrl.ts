import { withSubAuth, ok, ValidationError, ForbiddenError, getDownloadPresignedUrl } from '@compliance-tracker/shared';

const BUCKET = process.env.UPLOAD_BUCKET!;

export const handler = withSubAuth(async (event, subId) => {
  const key = event.queryStringParameters?.key;
  if (!key) throw new ValidationError('key is required');
  if (!key.includes(`/${subId}/`)) throw new ForbiddenError('That document does not belong to you');

  const url = await getDownloadPresignedUrl(BUCKET, key);
  return ok({ url });
});
