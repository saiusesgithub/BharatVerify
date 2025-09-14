import fs from 'fs';
import path from 'path';

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

