import { PrismaClient } from '@prisma/client';
import { CloudStorageAdapter } from '../adapters/cloudStorageAdapter';
import { sha256Bytes } from './crypto';
import { chainAdapter } from './chainAdapter';
import { AppError, ErrorCodes } from '../utils/errors';
import { config } from '../config/secrets';
import { emailService } from '../notifications/email';

export class StudentCertificateService {
  constructor(private prisma: PrismaClient, private storage: CloudStorageAdapter) {}

  private async ensureOwnedCertificate(studentId: string, docId: string) {
    const cert = await this.prisma.certificate.findUnique({
      where: { id: docId },
      include: { issuer: true, student: true }
    });
    if (!cert) throw new AppError(ErrorCodes.CERT_NOT_FOUND, 'Certificate not found', 404);
    if (!cert.studentId || cert.studentId !== studentId) {
      throw new AppError(ErrorCodes.STUDENT_FORBIDDEN, 'Certificate does not belong to student', 403);
    }
    return cert;
  }

  async listCertificates(studentId: string) {
    const certs = await this.prisma.certificate.findMany({
      where: { studentId },
      include: {
        issuer: true,
        verificationEvents: { orderBy: { createdAt: 'desc' }, take: 1 }
      },
      orderBy: { createdAt: 'desc' }
    });
    return certs.map((cert) => ({
      docId: cert.id,
      title: cert.title,
      issuerName: cert.issuer?.name || 'Unknown issuer',
      issuedAtUnix: cert.issuedAtUnix,
      status: cert.status,
      sha256Hex: cert.sha256Hex || cert.hash,
      lastVerifiedAtUnix: cert.verificationEvents[0]?.atUnix || null
    }));
  }

  async getCertificate(studentId: string, docId: string) {
    const cert = await this.ensureOwnedCertificate(studentId, docId);
    const events = await this.prisma.verificationEvent.findMany({
      where: { certificateId: docId },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    return {
      docId: cert.id,
      title: cert.title,
      issuerName: cert.issuer?.name || 'Unknown issuer',
      issuedAtUnix: cert.issuedAtUnix,
      status: cert.status,
      sha256Hex: cert.sha256Hex || cert.hash,
      qrCodeUrl: `${process.env.QR_BASE_URL || 'https://example.invalid/cert/'}${cert.id}`,
      verificationTimeline: events.map((evt) => ({
        atUnix: evt.atUnix,
        result: evt.result,
        hashMatch: evt.hashMatch,
        issuerVerified: evt.issuerVerified,
        reason: (() => {
          try {
            const details = evt.details ? JSON.parse(evt.details) : {};
            const reasons: string[] = Array.isArray(details?.reasons) ? details.reasons : [];
            return reasons.join(', ') || undefined;
          } catch {
            return undefined;
          }
        })()
      }))
    };
  }

  async download(studentId: string, docId: string) {
    const cert = await this.ensureOwnedCertificate(studentId, docId);
    const bytes = await this.storage.download(cert.fileUrl);
    return { bytes, cert };
  }

  async verify(studentId: string, docId: string) {
    const cert = await this.ensureOwnedCertificate(studentId, docId);
    const student = await this.prisma.student.findUnique({ where: { id: studentId } });
    const bytes = await this.storage.download(cert.fileUrl);
    const computed = sha256Bytes(bytes).toLowerCase();
    const anchoredHash = (cert.sha256Hex || cert.hash || '').toLowerCase();

    const reasons: string[] = [];
    if (anchoredHash && anchoredHash !== computed) reasons.push('HASH_MISMATCH');

    let chainDetails: Awaited<ReturnType<typeof chainAdapter.verify>> | null = null;
    let adapterError: string | null = null;
    try {
      chainDetails = await chainAdapter.verify(cert.id);
      if (!chainDetails.found) reasons.push('CHAIN_MISS');
      else if (chainDetails.onChainHash && chainDetails.onChainHash.toLowerCase() !== computed) {
        reasons.push('HASH_MISMATCH');
      }
    } catch (err: any) {
      adapterError = err?.code || 'CHAIN_ADAPTER_DOWN';
      reasons.push(adapterError);
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
        issuerVerified = sig.matchesExpected && (config.verifyRequireIssuerActive ? sig.issuerActive : true);
        if (!issuerVerified) reasons.push('SIG_INVALID');
      } catch {
        reasons.push('SIG_INVALID');
      }
    }

    const isRevoked = cert.status === 'revoked';
    if (isRevoked) reasons.push('REVOKED');

    const status = isRevoked ? 'REVOKED' : reasons.length === 0 ? 'PASS' : 'FAIL';
    const hashMatch = !reasons.includes('HASH_MISMATCH');
    const nowUnix = Math.floor(Date.now() / 1000);

    await this.prisma.verificationResult.create({
      data: {
        docId: cert.id,
        status,
        reasons: JSON.stringify(reasons),
        verifierUserId: null
      }
    });

    await this.prisma.verificationEvent.create({
      data: {
        certificateId: cert.id,
        by: student?.email || studentId,
        studentId,
        result: status.toLowerCase(),
        hashMatch,
        issuerVerified,
        mlSummary: null,
        details: JSON.stringify({ reasons, chainDetails, adapterError, triggeredBy: 'student' }),
        atUnix: nowUnix
      }
    });

    if (status !== 'PASS') {
      await emailService.notifyAdminVerificationFailed({
        docId: cert.id,
        reason: reasons.join(', ') || 'verification failed',
        expectedHash: chainDetails?.onChainHash,
        actualHash: computed,
        whenUnix: nowUnix
      });
    }

    return {
      status,
      reasons,
      hashMatch,
      issuerVerified,
      adapterError,
      expectedHash: chainDetails?.onChainHash || anchoredHash,
      actualHash: computed,
      updatedTimeline: await this.getCertificate(studentId, docId)
    };
  }
}
