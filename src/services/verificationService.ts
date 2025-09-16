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
    // Compute or use provided sha256
    let computed = params.sha256Hex;
    if (params.fileBuffer) computed = sha256Bytes(params.fileBuffer);
    if (!computed) {
      const bytes = await this.storage.download(cert.fileUrl);
      computed = sha256Bytes(bytes);
    }

    if ((computed || '').toLowerCase() !== (cert.sha256Hex || cert.hash).toLowerCase()) reasons.push('HASH_MISMATCH');

    // Chain record
    const on = await chainAdapter.verify(cert.id);
    if (!on.found) reasons.push('CHAIN_MISS');
    else if ((on.onChainHash || '').toLowerCase() !== (computed || '').toLowerCase()) reasons.push('HASH_MISMATCH');

    // Signature check
    let issuerVerified = false;
    if (cert.signatureHex && cert.issuerAddress) {
      try {
        // Use the stored sha256 for signature verification to attest the issued artifact,
        // independent of the uploaded bytes. Still report HASH_MISMATCH separately.
        const shaForSignature = (cert.sha256Hex || cert.hash);
        const sig = await chainAdapter.verifySignature({ docId: cert.id, sha256Hex: shaForSignature, issuedAtUnix: cert.issuedAtUnix || Math.floor(new Date(cert.issuedAt).getTime()/1000), signatureHex: cert.signatureHex, expectedIssuer: cert.issuerAddress });
        try { logInfo(`[verify] signature: matchesExpected=${sig.matchesExpected}, issuerActive=${sig.issuerActive}`); } catch {}
        // Optionally require registry active status
        issuerVerified = sig.matchesExpected && (config.verifyRequireIssuerActive ? sig.issuerActive : true);
        if (!issuerVerified) reasons.push('SIG_INVALID');
      } catch {
        reasons.push('SIG_INVALID');
      }
    }

    // Optional ML analysis (only when an uploaded file is provided and ML is configured)
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
      // Swallow ML errors to avoid blocking core verification
      ml = null;
      try {
        logInfo(`[verify] ML error: ${e?.message || String(e)}`);
      } catch {}
    }

    const status = reasons.length === 0 ? 'PASS' : (cert.status === 'revoked' ? 'FAIL' : 'FAIL');
    await this.prisma.verificationResult.create({
      data: { docId: cert.id, status: status, reasons: JSON.stringify(reasons), verifierUserId: user.id }
    });
    await this.prisma.verificationEvent.create({
      data: {
        certificateId: cert.id,
        by: user.email,
        result: status.toLowerCase(),
        hashMatch: !reasons.includes('HASH_MISMATCH'),
        issuerVerified,
        mlSummary: ml ? JSON.stringify(ml) : null,
        details: JSON.stringify({ reasons, on }),
        atUnix: Math.floor(Date.now()/1000)
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

    // include compact ML summary in response when available
    return { status, reasons, ...(ml ? { ml } : {}) } as any;
  }
}

async function keysOrDb(keys: KeyRegistry, prisma: PrismaClient, issuerId: string): Promise<string> {
  try {
    return await keys.getPublicKeyForIssuer(issuerId);
  } catch {
    const issuer = await prisma.issuer.findUnique({ where: { id: issuerId } });
    if (!issuer) throw new Error('Issuer not found');
    return issuer.publicKeyPem;
  }
}
