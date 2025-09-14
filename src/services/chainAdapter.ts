import { config } from '../config/secrets';

async function http<T>(path: string, opts?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 10000);
  try {
    const res = await fetch(config.chainAdapterUrl + path, { ...opts, signal: controller.signal, headers: { 'content-type': 'application/json', ...(opts?.headers || {}) } });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || `HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(to);
  }
}

export const chainAdapter = {
  anchor(input: { docId: string; sha256Hex: string; reason?: string }) {
    return http<{ txHash: string; blockNumber: number; chain: string; explorerUrl: string }>(`/anchor`, { method: 'POST', body: JSON.stringify(input) });
  },
  verify(docId: string) {
    return http<{ found: boolean; onChainHash?: string; index?: number; author?: string; blockTimestamp?: number; reason?: string; revoked?: boolean }>(`/verify?docId=${encodeURIComponent(docId)}`, { method: 'GET' });
  },
  history(docId: string) {
    return http<{ count: number; versions: Array<{ index: number; hash: string; author: string; blockTimestamp: number; reason: string; revoked: boolean }> }>(`/history?docId=${encodeURIComponent(docId)}`, { method: 'GET' });
  },
  issuerIsActive(address: string) {
    return http<{ active: boolean; name: string }>(`/issuer/is-active?address=${encodeURIComponent(address)}`, { method: 'GET' });
  },
  verifySignature(input: { docId: string; sha256Hex: string; issuedAtUnix: number; signatureHex: string; expectedIssuer?: string }) {
    return http<{ recovered: string; issuerActive: boolean; issuerName: string; matchesExpected: boolean }>(`/verify-signature`, { method: 'POST', body: JSON.stringify(input) });
  }
};

