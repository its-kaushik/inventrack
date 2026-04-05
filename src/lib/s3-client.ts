import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env.js';

const s3 = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
  forcePathStyle: true, // Required for MinIO / R2 compatibility
});

export async function getUploadUrl(key: string, contentType: string) {
  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    ContentType: contentType,
  });
  const url = await getSignedUrl(s3, command, { expiresIn: 300 });
  return { uploadUrl: url, key, publicUrl: `${env.S3_PUBLIC_URL}/${key}` };
}

export async function downloadFromS3(key: string): Promise<Buffer> {
  const command = new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key });
  const response = await s3.send(command);
  const chunks: Uint8Array[] = [];
  for await (const chunk of response.Body as any) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function uploadToS3(key: string, body: Buffer, contentType: string): Promise<void> {
  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
  });
  await s3.send(command);
}
