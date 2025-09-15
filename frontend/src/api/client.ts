const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

function authHeader() {
  const token = sessionStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export type VerifyResponse = { status: 'PASS' | 'FAIL'; reasons: string[]; ml?: any };

export const api = {
  async login(email: string, password: string): Promise<{ token: string }> {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    return handle(res);
  },

  async uploadCertificate(meta: unknown, file: File, onProgress?: (pct: number) => void): Promise<{ id: string; hash: string; signature: string }> {
    const token = sessionStorage.getItem('token');
    const form = new FormData();
    form.append('meta', JSON.stringify(meta));
    form.append('file', file);
    // Use XHR to show upload progress
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${BASE_URL}/api/admin/certificates/upload`);
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
        else reject(new Error(`Upload failed ${xhr.status}`));
      };
      xhr.onerror = () => reject(new Error('Network error'));
      xhr.send(form);
    });
  },

  async issueCertificate(input: { docId?: string; title?: string; reason?: string; ownerId?: string; file: File }, onProgress?: (pct: number) => void): Promise<any> {
    const token = sessionStorage.getItem('token');
    const form = new FormData();
    if (input.docId) form.append('docId', input.docId);
    if (input.title) form.append('title', input.title);
    if (input.reason) form.append('reason', input.reason);
    if (input.ownerId) form.append('ownerId', input.ownerId);
    form.append('pdf', input.file);
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${BASE_URL}/api/admin/issue`);
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
        else reject(new Error(`Issue failed ${xhr.status}`));
      };
      xhr.onerror = () => reject(new Error('Network error'));
      xhr.send(form);
    });
  },

  async verify(docId: string): Promise<VerifyResponse> {
    const res = await fetch(`${BASE_URL}/api/verifications/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ docId })
    });
    return handle(res);
  },

  async verifyWithFile(docId: string, file: File): Promise<VerifyResponse> {
    const form = new FormData();
    form.append('docId', docId);
    form.append('pdf', file);
    const res = await fetch(`${BASE_URL}/api/verifications/verify`, {
      method: 'POST',
      headers: { ...authHeader() },
      body: form
    });
    return handle(res);
  },

  async audit(limit = 20, offset = 0): Promise<{ items: any[] }> {
    const res = await fetch(`${BASE_URL}/api/audit?limit=${limit}&offset=${offset}`, {
      headers: { ...authHeader() }
    });
    return handle(res);
  }
};
