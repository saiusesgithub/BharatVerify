import { PrismaClient } from '@prisma/client';
import { CloudStorageAdapter } from '../adapters/cloudStorageAdapter';
import { BlockchainAdapter } from '../adapters/blockchainAdapter';
import { KeyRegistry } from '../adapters/keyRegistry';
import { chainAdapter } from './chainAdapter';
import { sha256Bytes } from './crypto';
import { mlAdapter, MlVerifyResponse } from './mlAdapter';
import { logInfo } from '../infra/logging';
import { config } from '../config/secrets';

export class VerificationService {
  constructor(
    private prisma: PrismaClient,
    private storage: CloudStorageAdapter,
    private chain: BlockchainAdapter,
    private keys: KeyRegistry
  ) {}

  async verify(params: { verifierUserId: string; docId: string; fileBuffer?: Buffer; sha256Hex?: string }) {
    const user = await this.prisma.user.findUnique({ where: { id: params.verifierUserId } });
    if (!user) throw new Error('User not found');

    const cert = await this.prisma.certificate.findUnique({ where: { id: params.docId } });
    if (!cert) {
      await this.prisma.verificationResult.create({
        data: { docId: params.docId, status: 'FAIL', reasons: JSON.stringify(['CERT_NOT_FOUND']), verifierUserId: user.id }
      });
      return { status: 'FAIL', reasons: ['CERT_NOT_FOUND'] as string[] };
    }

    const reasons: string[] = [];
    const addReason = (reason: string) => {
      if (!reasons.includes(reason)) reasons.push(reason);
    };

    let computed = params.sha256Hex;
    if (params.fileBuffer) computed = sha256Bytes(params.fileBuffer);
    if (!computed) {
      const bytes = await this.storage.download(cert.fileUrl);
      computed = sha256Bytes(bytes);
    }
    const anchoredHash = (cert.sha256Hex || cert.hash || '').toLowerCase();
    const providedHash = (computed || '').toLowerCase();
    if (providedHash && anchoredHash && providedHash !== anchoredHash) addReason('HASH_MISMATCH');

    let onChainHash: string | null = null;
    let chainDetails: any = null;
    let adapterError: string | null = null;
    try {
      chainDetails = await chainAdapter.verify(cert.id);
      if (!chainDetails.found) addReason('CHAIN_MISS');
      else {
        onChainHash = chainDetails.onChainHash || null;
        const normalizedOnChain = (onChainHash || '').toLowerCase();
        if (providedHash && normalizedOnChain && normalizedOnChain !== providedHash) addReason('HASH_MISMATCH');
      }
    } catch (err: any) {
      adapterError = err?.code || 'CHAIN_ADAPTER_DOWN';
      addReason(adapterError);
    }

    let issuerVerified = false;
    if (cert.signatureHex && cert.issuerAddress) {
      try {
        const shaForSignature = cert.sha256Hex || cert.hash;
        const sig = await chainAdapter.verifySignature({
          docId: cert.id,
          sha256Hex: shaForSignature,
          issuedAtUnix: cert.issuedAtUnix || Math.floor(new Date(cert.issuedAt).getTime() / 1000),
          signatureHex: cert.signatureHex,
          expectedIssuer: cert.issuerAddress
        });
        try {
          logInfo(`[verify] signature: matchesExpected=${sig.matchesExpected}, issuerActive=${sig.issuerActive}`);
        } catch {}
        issuerVerified = sig.matchesExpected && (config.verifyRequireIssuerActive ? sig.issuerActive : true);
        if (!issuerVerified) addReason('SIG_INVALID');
      } catch {
        addReason('SIG_INVALID');
      }
    }

    let ml: MlVerifyResponse | null = null;
    try {
      const fbSize = params.fileBuffer ? params.fileBuffer.length : 0;
      const mlEnabled = mlAdapter.enabled();
      logInfo(`[verify] fileBuffer size: ${fbSize} bytes, mlEnabled: ${mlEnabled}`);
      if (params.fileBuffer && mlEnabled) {
        const originalBytes = await this.storage.download(cert.fileUrl);
        ml = await mlAdapter.analyzePair(originalBytes, params.fileBuffer);
        try {
          const overall = (ml as any)?.overall_status ?? 'unknown';
          logInfo(`[verify] ML overall_status: ${overall}`);
        } catch {}
      }
    } catch (e: any) {
      ml = null;
      try {
        logInfo(`[verify] ML error: ${e?.message || String(e)}`);
      } catch {}
    }

    const isRevoked = cert.status === 'revoked';
    if (isRevoked) addReason('REVOKED');

    const status = isRevoked ? 'REVOKED' : reasons.length === 0 ? 'PASS' : 'FAIL';
    const hashMatch = !reasons.includes('HASH_MISMATCH');
    await this.prisma.verificationResult.create({
      data: { docId: cert.id, status, reasons: JSON.stringify(reasons), verifierUserId: user.id }
    });
    await this.prisma.verificationEvent.create({
      data: {
        certificateId: cert.id,
        by: user.email,
        result: status.toLowerCase(),
        hashMatch,
        issuerVerified,
        mlSummary: ml ? JSON.stringify(ml) : null,
        details: JSON.stringify({ reasons, chainDetails, adapterError }),
        atUnix: Math.floor(Date.now() / 1000)
      }
    });
    await this.prisma.auditLog.create({
      data: {
        action: 'VERIFY',
        userId: user.id,
        role: user.role,
        refType: 'Certificate',
        refId: cert.id,
        details: JSON.stringify({ status, reasons })
      }
    });

    const response: any = {
      status,
      reasons,
      hashMatch,
      issuerVerified,
      expectedHash: onChainHash,
      actualHash: computed || null,
      adapterError,
      certificate: {
        id: cert.id,
        title: cert.title,
        issuerId: cert.issuerId,
        status: cert.status
      }
    };
    if (ml) response.ml = ml;
    return response;
  }
}

