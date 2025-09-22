import { FastifyInstance } from 'fastify';
import { requireRole } from '../infra/auth/auth';
import { VerificationService } from '../services/verificationService';
import { prisma } from '../infra/db/prismaClient';
import { getCloudStorageAdapter } from '../adapters/cloudStorageAdapter';
import { createMockBlockchainAdapter } from '../adapters/blockchainAdapter';
import { createKeyRegistry } from '../adapters/keyRegistry';
import { VerifySchema } from '../utils/validation';
import { AppError, ErrorCodes } from '../utils/errors';
import { emailService } from '../notifications/email';

export async function registerVerificationRoutes(app: FastifyInstance) {
  const storage = getCloudStorageAdapter();
  const chain = createMockBlockchainAdapter(prisma);
  const keys = createKeyRegistry(prisma);
  const service = new VerificationService(prisma, storage, chain, keys);

  app.post('/verify', {
    preHandler: [app.authenticate, requireRole(['VERIFIER'])]
  }, async (req) => {
    const ct = (req.headers['content-type'] || '').toString();
    let docId: string | undefined;
    let sha256Hex: string | undefined;
    let fileBuffer: Buffer | undefined;
    if (ct.includes('multipart/form-data')) {
      const mp = await req.parts();
      for await (const part of mp) {
        if (part.type === 'file' && (part.fieldname === 'pdf' || part.fieldname === 'file')) {
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) chunks.push(chunk as Buffer);
          fileBuffer = Buffer.concat(chunks);
          req.log.info({ bytes: fileBuffer.length }, '[verify] received file part');
        } else if (part.type === 'field') {
          if (part.fieldname === 'docId') docId = part.value;
          if (part.fieldname === 'sha256Hex') sha256Hex = part.value;
        }
      }
    } else {
      const body: any = req.body;
      const parsed = VerifySchema.safeParse(body);
      if (!parsed.success) throw new AppError(ErrorCodes.CERT_NOT_FOUND, 'Invalid docId', 400);
      docId = parsed.data.docId;
      if (typeof body?.sha256Hex === 'string') sha256Hex = body.sha256Hex;
    }
    if (!docId) throw new AppError('BAD_REQUEST', 'docId required', 400);
    const verifierUserId = (req.user as any).sub;
    const result = await service.verify({ verifierUserId, docId, fileBuffer, sha256Hex });

    const nowUnix = Math.floor(Date.now() / 1000);
    let companyName = 'Unknown Company';
    try {
      const verifier = await prisma.user.findUnique({ where: { id: verifierUserId }, include: { verifierOrg: true } });
      if (verifier?.verifierOrg?.name) companyName = verifier.verifierOrg.name;
      else if (verifier?.email) companyName = verifier.email;
    } catch (e) {
      req.log.warn({ err: e }, '[verify] failed to resolve verifier organisation');
    }

    const certificateId = (result as any)?.certificate?.id || docId;
    const certificateTitle = (result as any)?.certificate?.title ?? null;
    const issuerId = (result as any)?.certificate?.issuerId as string | undefined;
    let issuerEmail: string | undefined;
    if (issuerId) {
      const issuerUser = await prisma.user.findFirst({ where: { issuerId }, orderBy: { createdAt: 'asc' } });
      issuerEmail = issuerUser?.email || undefined;
    }

    await emailService.notifyVerificationResult({
      docId: certificateId,
      title: certificateTitle,
      company: companyName,
      result: String((result as any)?.status || 'FAIL').toLowerCase(),
      hashMatch: Boolean((result as any)?.hashMatch),
      issuerVerified: Boolean((result as any)?.issuerVerified),
      whenUnix: nowUnix,
      expectedHash: (result as any)?.expectedHash || undefined,
      actualHash: (result as any)?.actualHash || undefined,
      issuerEmail
    });

    const adapterError = (result as any)?.adapterError;
    const reasons: string[] = Array.isArray((result as any)?.reasons) ? (result as any).reasons : [];
    const status = String((result as any)?.status || '').toUpperCase();
    if (status !== 'PASS' || adapterError) {
      const reasonLabel = resolveVerificationFailureReason(reasons, adapterError, status);
      await emailService.notifyAdminVerificationFailed({
        docId: certificateId,
        reason: reasonLabel,
        expectedHash: (result as any)?.expectedHash || undefined,
        actualHash: (result as any)?.actualHash || undefined,
        whenUnix: nowUnix
      });
    }

    return result;
  });
}

function resolveVerificationFailureReason(reasons: string[], adapterError?: string | null, status?: string): string {
  if (adapterError) return 'adapter down';
  if (status === 'REVOKED' || reasons.includes('REVOKED')) return 'certificate revoked';
  if (reasons.includes('HASH_MISMATCH')) return 'hash mismatch';
  if (reasons.includes('SIG_INVALID')) return 'signature invalid';
  if (reasons.includes('CHAIN_MISS')) return 'chain record missing';
  return 'verification failed';
}
