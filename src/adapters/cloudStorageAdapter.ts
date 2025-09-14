import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { lookup as lookupMime } from 'mime-types';

export interface CloudStorageAdapter {
  upload: (file: Buffer, originalName: string) => Promise<string>; // returns fileUrl
  download: (fileUrl: string) => Promise<Buffer>;
}

function ensureStorageDir(): string {
  const dir = process.env.STORAGE_DIR || path.join(process.cwd(), 'data', 'files');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function createMockCloudStorage(): CloudStorageAdapter {
  const baseDir = ensureStorageDir();
  return {
    async upload(file: Buffer, originalName: string): Promise<string> {
      const safe = originalName.replace(/[^a-zA-Z0-9_.-]/g, '_');
      const name = `${Date.now()}_${Math.random().toString(36).slice(2)}_${safe}`;
      const dest = path.join(baseDir, name);
      fs.writeFileSync(dest, file);
      return `local://files/${name}`;
    },
    async download(fileUrl: string): Promise<Buffer> {
      if (!fileUrl.startsWith('local://files/')) throw new Error('Unsupported fileUrl');
      const name = fileUrl.replace('local://files/', '');
      const p = path.join(baseDir, name);
      return fs.readFileSync(p);
    }
  };
}

export function createR2CloudStorage(): CloudStorageAdapter {
  const accountId = process.env.R2_ACCOUNT_ID as string;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID as string;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY as string;
  const bucket = process.env.R2_BUCKET as string;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error('R2 configuration missing: set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET');
  }
  const endpoint = process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`;
  const s3 = new S3Client({
    region: 'auto',
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey }
  });

  return {
    async upload(file: Buffer, originalName: string): Promise<string> {
      const safe = originalName.replace(/[^a-zA-Z0-9_.-]/g, '_');
      const key = `${Date.now()}_${Math.random().toString(36).slice(2)}/${safe}`;
      const contentType = lookupMime(originalName) || 'application/octet-stream';
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: file, ContentType: String(contentType) }));
      return `r2://${bucket}/${key}`;
    },
    async download(fileUrl: string): Promise<Buffer> {
      if (!fileUrl.startsWith('r2://')) throw new Error('Unsupported fileUrl');
      const [, , bucketAndKey] = fileUrl.split('/'); // r2:, , bucket
      const rest = fileUrl.replace('r2://', '');
      const idx = rest.indexOf('/');
      const b = rest.substring(0, idx);
      const key = rest.substring(idx + 1);
      const out = await s3.send(new GetObjectCommand({ Bucket: b, Key: key }));
      // @ts-expect-error - Body is a stream in node
      const stream = out.Body as NodeJS.ReadableStream;
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        stream.on('data', (d: Buffer) => chunks.push(d));
        stream.on('end', () => resolve());
        stream.on('error', reject);
      });
      return Buffer.concat(chunks);
    }
  };
}

export function getCloudStorageAdapter(): CloudStorageAdapter {
  const useMock = (process.env.USE_MOCK_ADAPTERS || 'true').toLowerCase() === 'true';
  return useMock ? createMockCloudStorage() : createR2CloudStorage();
}
