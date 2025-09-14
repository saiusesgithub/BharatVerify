import { config } from '../config/secrets';
import { AppError } from '../utils/errors';

async function http<T>(path: string, opts?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 10000);
  try {
    const res = await fetch(config.chainAdapterUrl + path, { ...opts, signal: controller.signal, headers: { 'content-type': 'application/json', ...(opts?.headers || {}) } });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new AppError('CHAIN_ADAPTER_DOWN', j.error || `HTTP ${res.status}`, 502);
    }
    return (await res.json()) as T;
  } catch (e: any) {
    // Network or timeout errors
    if (e instanceof AppError) throw e;
    throw new AppError('CHAIN_ADAPTER_DOWN', e?.message || 'Chain adapter unreachable', 502);
  } finally {
    clearTimeout(to);
  }
}

export const chainAdapter = {
  anchor(input: { docId: string; sha256Hex: string; reason?: string }) {
    const timeoutMs = Number(process.env.CHAIN_ADAPTER_TIMEOUT_MS || '60000');
    return http<{ txHash: string; blockNumber: number; chain: string; explorerUrl: string }>(`/anchor`, { method: 'POST', body: JSON.stringify(input), timeoutMs });
  },
  verify(docId: string) {
    const timeoutMs = Number(process.env.CHAIN_ADAPTER_TIMEOUT_MS || '60000');
    return http<{ found: boolean; onChainHash?: string; index?: number; author?: string; blockTimestamp?: number; reason?: string; revoked?: boolean }>(`/verify?docId=${encodeURIComponent(docId)}`, { method: 'GET', timeoutMs });
  },
  history(docId: string) {
    const timeoutMs = Number(process.env.CHAIN_ADAPTER_TIMEOUT_MS || '60000');
    return http<{ count: number; versions: Array<{ index: number; hash: string; author: string; blockTimestamp: number; reason: string; revoked: boolean }> }>(`/history?docId=${encodeURIComponent(docId)}`, { method: 'GET', timeoutMs });
  },
  issuerIsActive(address: string) {
    const timeoutMs = Number(process.env.CHAIN_ADAPTER_TIMEOUT_MS || '60000');
    return http<{ active: boolean; name: string }>(`/issuer/is-active?address=${encodeURIComponent(address)}`, { method: 'GET', timeoutMs });
  },
  verifySignature(input: { docId: string; sha256Hex: string; issuedAtUnix: number; signatureHex: string; expectedIssuer?: string }) {
    const timeoutMs = Number(process.env.CHAIN_ADAPTER_TIMEOUT_MS || '60000');
    return http<{ recovered: string; issuerActive: boolean; issuerName: string; matchesExpected: boolean }>(`/verify-signature`, { method: 'POST', body: JSON.stringify(input), timeoutMs });
  }
};
