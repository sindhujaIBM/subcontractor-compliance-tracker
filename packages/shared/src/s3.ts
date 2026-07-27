import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

let client: S3Client | null = null;
function getS3(): S3Client {
  if (!client) client = new S3Client({ region: process.env.AWS_REGION || 'ca-west-1' });
  return client;
}

export async function getObjectAsBase64(bucket: string, key: string): Promise<{ base64: string; mediaType: string }> {
  const res = await getS3().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const bytes = await res.Body!.transformToByteArray();
  const base64 = Buffer.from(bytes).toString('base64');
  const mediaType = res.ContentType || guessMediaType(key);
  return { base64, mediaType };
}

function guessMediaType(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

export async function getUploadPresignedUrl(bucket: string, key: string, contentType: string): Promise<string> {
  const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
  return getSignedUrl(getS3(), command, { expiresIn: 300 });
}

export async function getDownloadPresignedUrl(bucket: string, key: string): Promise<string> {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(getS3(), command, { expiresIn: 300 });
}
