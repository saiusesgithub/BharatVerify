import { config } from '../config/secrets';

export type MlModelResult = {
  model: string;
  status: 'authentic' | 'tampered' | string;
  message?: string;
  [k: string]: any;
};

export type MlVerifyResponse = {
  layout?: MlModelResult;
  photo?: MlModelResult;
  seal?: MlModelResult;
  signature?: MlModelResult;
  overall_status?: 'authentic' | 'tampered' | string;
  [k: string]: any;
};

async function requestWithTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  const t = new Promise<T>((_, rej) => setTimeout(() => rej(new Error('ML timeout')), ms));
  return Promise.race([p, t]);
}

export const mlAdapter = {
  enabled(): boolean {
    return !!config.ml.baseUrl;
  },

  async analyzePair(originalPdf: Buffer, uploadedPdf: Buffer): Promise<MlVerifyResponse> {
    if (!config.ml.baseUrl) throw new Error('ML not configured');

    // Send as multipart/form-data to ML service
    const FormDataCtor: any = (globalThis as any).FormData;
    const BlobCtor: any = (globalThis as any).Blob;
    const form = new FormDataCtor();
    form.append('original', new BlobCtor([originalPdf]), 'original.pdf');
    form.append('uploaded', new BlobCtor([uploadedPdf]), 'uploaded.pdf');

    const AC: any = (globalThis as any).AbortController;
    const controller = new AC();
    const headers: Record<string, string> = {};
    if (config.ml.apiKey) headers['Authorization'] = `Bearer ${config.ml.apiKey}`;

    const url = `${config.ml.baseUrl.replace(/\/$/, '')}/verify`;
    const fetchFn: any = (globalThis as any).fetch;
    const fetchPromise = fetchFn(url, {
      method: 'POST',
      body: form as any,
      headers,
      signal: controller.signal
    }).then(async (res) => {
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`ML HTTP ${res.status}: ${text}`);
      }
      return (await res.json()) as MlVerifyResponse;
    });

    try {
      const out = await requestWithTimeout(fetchPromise, config.ml.timeoutMs);
      return out;
    } finally {
      controller.abort();
    }
  }
};
