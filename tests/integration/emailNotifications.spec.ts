import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import FormData from 'form-data';
import { buildServer } from '../../src/infra/http/server';
import { emailService } from '../../src/notifications/email';
import { CertificateService } from '../../src/services/certificateService';
import { VerificationService } from '../../src/services/verificationService';
import { prisma } from '../../src/infra/db/prismaClient';

const originalEnv = { ...process.env };

function setDefaultEnv() {
  process.env.CHAIN_ADAPTER_URL = process.env.CHAIN_ADAPTER_URL || 'http://localhost:9999';
}

describe('notification wiring', () => {
  beforeEach(() => {
    setDefaultEnv();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    Object.assign(process.env, originalEnv);
    vi.restoreAllMocks();
  });

  it('invokes issue notification once certificates are issued', async () => {
    const app = buildServer();
    await app.ready();
    const token = app.jwt.sign({ sub: 'issuer-user', role: 'ADMIN' });
    const certSpy = vi.spyOn(CertificateService.prototype, 'uploadCertificate').mockResolvedValue({
      id: 'CERT-ISSUE-1',
      title: 'Issued Document',
      issuedAtUnix: 1710000000,
      sha256Hex: 'abc',
      hash: 'abc',
      txHash: '0xtx',
      explorerUrl: 'https://explorer/tx/0xtx',
      status: 'active',
      r2Key: 'r2://file'
    } as any);
    const notifySpy = vi.spyOn(emailService, 'notifyIssueSuccess').mockResolvedValue();
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({ id: 'issuer-user', email: 'issuer@example.com' } as any);
    const form = new FormData();
    form.append('pdf', Buffer.from('%PDF-1.4'), { filename: 'sample.pdf', contentType: 'application/pdf' });
    form.append('docId', 'CERT-ISSUE-1');
    form.append('title', 'Issued Document');
    form.append('ownerId', '1');
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/issue',
      headers: {
        ...form.getHeaders(),
        authorization: `Bearer ${token}`,
        'content-length': String(form.getLengthSync())
      },
      payload: form.getBuffer()
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(200);
    expect(res.statusCode).toBeLessThan(400);
    expect(certSpy).toHaveBeenCalledOnce();
    expect(notifySpy).toHaveBeenCalledOnce();
    expect(notifySpy).toHaveBeenCalledWith(expect.objectContaining({ docId: 'CERT-ISSUE-1' }));
    await app.close();
  });

  it('invokes verification and admin failure notifications on failed verification', async () => {
    const app = buildServer();
    await app.ready();
    const token = app.jwt.sign({ sub: 'verifier-user', role: 'VERIFIER' });
    vi.spyOn(VerificationService.prototype, 'verify').mockResolvedValue({
      status: 'FAIL',
      reasons: ['HASH_MISMATCH'],
      hashMatch: false,
      issuerVerified: false,
      expectedHash: 'AAA',
      actualHash: 'BBB',
      adapterError: null,
      certificate: { id: 'CERT-VERIFY-1', title: 'Verification Target', issuerId: 'issuer-1', status: 'active' }
    } as any);
    const notifyResult = vi.spyOn(emailService, 'notifyVerificationResult').mockResolvedValue();
    const notifyAdmin = vi.spyOn(emailService, 'notifyAdminVerificationFailed').mockResolvedValue();
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({ id: 'verifier-user', email: 'verifier@example.com', verifierOrg: { name: 'Verifier Org' } } as any);
    vi.spyOn(prisma.user, 'findFirst').mockResolvedValue({ id: 'issuer-1-user', email: 'issuer@example.com' } as any);
    const res = await app.inject({
      method: 'POST',
      url: '/api/verifications/verify',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json'
      },
      payload: JSON.stringify({ docId: 'CERT-VERIFY-1' })
    });
    expect(res.statusCode).toBe(200);
    expect(notifyResult).toHaveBeenCalledOnce();
    expect(notifyResult).toHaveBeenCalledWith(expect.objectContaining({ docId: 'CERT-VERIFY-1', result: 'fail' }));
    expect(notifyAdmin).toHaveBeenCalledOnce();
    expect(notifyAdmin).toHaveBeenCalledWith(expect.objectContaining({ docId: 'CERT-VERIFY-1' }));
    await app.close();
  });
});


