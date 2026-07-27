import { withComplianceAuth, ok, ValidationError, ForbiddenError, getDownloadPresignedUrl } from '@compliance-tracker/shared';

const BUCKET = process.env.UPLOAD_BUCKET!;

export const handler = withComplianceAuth(async (event) => {
  const subId = event.pathParameters?.subId;
  const key = event.queryStringParameters?.key;
  if (!subId) throw new ValidationError('subId is required');
  if (!key) throw new ValidationError('key is required');
  // The key always encodes the subId it belongs to (onboarding/<subId>/... or
  // project/<projectId>/<subId>/...) — cheap sanity check against someone
  // passing an arbitrary key for a different sub's file.
  if (!key.includes(`/${subId}/`)) throw new ForbiddenError('That document does not belong to this subcontractor');

  const url = await getDownloadPresignedUrl(BUCKET, key);
  return ok({ url });
});
