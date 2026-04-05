import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { productImages } from '../db/schema/products.js';
import { downloadFromS3, uploadToS3 } from '../lib/s3-client.js';
import { env } from '../config/env.js';
import { CONSTANTS } from '../config/constants.js';

export interface ResizeJobData {
  s3Key: string;
  productImageId: string;
}

export async function handleResizeProductImage(data: ResizeJobData): Promise<void> {
  try {
    // 1. Download original from S3
    const originalBuffer = await downloadFromS3(data.s3Key);

    // 2. Generate resized variants
    const thumbnail = await sharp(originalBuffer)
      .resize(CONSTANTS.IMAGES.THUMBNAIL.width, CONSTANTS.IMAGES.THUMBNAIL.height, { fit: 'cover' })
      .webp({ quality: CONSTANTS.IMAGES.THUMBNAIL.quality })
      .toBuffer();

    const medium = await sharp(originalBuffer)
      .resize(CONSTANTS.IMAGES.MEDIUM.width, CONSTANTS.IMAGES.MEDIUM.height, { fit: 'inside' })
      .webp({ quality: CONSTANTS.IMAGES.MEDIUM.quality })
      .toBuffer();

    // 3. Upload variants back to S3
    const basePath = data.s3Key.replace(/\.[^.]+$/, '');
    const thumbKey = `${basePath}_thumb.webp`;
    const mediumKey = `${basePath}_medium.webp`;

    await uploadToS3(thumbKey, thumbnail, 'image/webp');
    await uploadToS3(mediumKey, medium, 'image/webp');

    // 4. Update product_images record with variant URLs
    await db
      .update(productImages)
      .set({
        thumbnailUrl: `${env.S3_PUBLIC_URL}/${thumbKey}`,
        mediumUrl: `${env.S3_PUBLIC_URL}/${mediumKey}`,
      })
      .where(eq(productImages.id, data.productImageId));

    console.info(`[resize-product-image] Processed ${data.s3Key}`);
  } catch (error) {
    console.error(`[resize-product-image] Failed for ${data.s3Key}:`, error);
    throw error; // pg-boss will retry
  }
}
