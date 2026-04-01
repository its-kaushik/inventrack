import { Hono } from 'hono';
import { z } from 'zod';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { s3 } from '../config/s3.js';
import { env } from '../config/env.js';
import { authMiddleware } from '../middleware/auth.js';
import { tenantScope } from '../middleware/tenant-scope.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { success } from '../lib/response.js';
import { ValidationError } from '../lib/errors.js';
import type { AppEnv } from '../types/hono.js';

const uploadsRouter = new Hono<AppEnv>();

uploadsRouter.use('*', authMiddleware, tenantScope, requireRole('owner', 'manager'));

const presignSchema = z.object({
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  purpose: z.string().min(1),
});

uploadsRouter.post('/presign', validate(presignSchema), async (c) => {
  if (!s3) {
    throw new ValidationError('File storage is not configured');
  }

  const { tenantId } = c.get('tenant');
  const { fileName, contentType, purpose } = c.get('validatedBody') as z.infer<typeof presignSchema>;

  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (!allowed.includes(contentType)) {
    throw new ValidationError(`Unsupported file type: ${contentType}. Allowed: ${allowed.join(', ')}`);
  }

  const key = `${tenantId}/${purpose}/${randomUUID()}/${fileName}`;

  const url = await getSignedUrl(s3, new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    ContentType: contentType,
  }), { expiresIn: 300 });

  return c.json(success({ url, key }));
});

export default uploadsRouter;
