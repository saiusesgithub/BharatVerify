import { FastifyInstance } from 'fastify';
import { requireRole } from '../infra/auth/auth';
import { CertificateService } from '../services/certificateService';
import { prisma } from '../infra/db/prismaClient';
import { getCloudStorageAdapter } from '../adapters/cloudStorageAdapter';
import { createMockBlockchainAdapter } from '../adapters/blockchainAdapter';
import { UploadMetaSchema } from '../utils/validation';
import { emailService } from '../notifications/email';
import { AppError, ErrorCodes } from '../utils/errors';

export async function registerCertificateRoutes(app: FastifyInstance) {
  const storage = getCloudStorageAdapter();
  const chain = createMockBlockchainAdapter(prisma);
  const service = new CertificateService(prisma, storage, chain);

  app.post('/certificates/upload', {
    preHandler: [app.authenticate, requireRole(['ADMIN'])],
    schema: {
      consumes: ['multipart/form-data'],
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            hash: { type: 'string' },
            signature: { type: 'string' },
            downloadUrl: { type: 'string' },
            downloadPath: { type: 'string' }
          }
        }
      }
    }
  }, async (req, _reply) => {
    const mp = await req.parts();
    let fileBuffer: Buffer | null = null;
    let fileName = 'file.bin';
    let meta: any = null;
    for await (const part of mp) {
      if (part.type === 'file' && part.fieldname === 'file') {
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) chunks.push(chunk as Buffer);
        fileBuffer = Buffer.concat(chunks);
        fileName = part.filename || fileName;
      } else if (part.type === 'field' && part.fieldname === 'meta') {
        meta = JSON.parse(part.value);
      }
    }
    const parsed = UploadMetaSchema.safeParse(meta);
    if (!parsed.success) throw new AppError(ErrorCodes.AUTH_INVALID, 'Invalid meta', 400);
    if (!fileBuffer) throw new AppError('BAD_REQUEST', 'File is required', 400);

    const cert = await service.uploadCertificate({
      issuerUserId: (req.user as any).sub,
      meta: parsed.data,
      fileBuffer,
      originalName: fileName,
      studentId: parsed.data.studentId,
      studentEmail: parsed.data.studentEmail,
      studentName: parsed.data.studentName
    });
    const issuerUser = await prisma.user.findUnique({ where: { id: (req.user as any).sub } });
    await emailService.notifyIssueSuccess({
      docId: cert?.id || 'unknown-doc',
      title: cert?.title,
      issuedAt: cert?.issuedAtUnix || Math.floor(Date.now() / 1000),
      issuerEmail: issuerUser?.email,
      sha256Hex: cert?.sha256Hex || cert?.hash || '',
      txHash: cert?.txHash || undefined,
      explorerUrl: cert?.explorerUrl || undefined
    });

    return {
      id: cert.id,
      hash: cert.hash,
      signature: cert.signature,
      downloadUrl: cert.r2Key,
      downloadPath: `/api/admin/certificates/${cert.id}/download`
    };
  });

  // New issuance endpoint per blockchain integration
  app.post('/issue', {
    preHandler: [app.authenticate, requireRole(['ADMIN'])]
  }, async (req) => {
    const mp = await req.parts();
    let fileBuffer: Buffer | null = null;
    let fileName = 'document.pdf';
    let docId: string | undefined;
    let title: string | undefined;
    let reason: string | undefined;
    let studentId: string | undefined;
    let studentEmail: string | undefined;
    let studentName: string | undefined;
    let kind: string | undefined;
    let studentRef: string | undefined;

    for await (const part of mp) {
      if (part.type === 'file' && part.fieldname === 'pdf') {
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) chunks.push(chunk as Buffer);
        fileBuffer = Buffer.concat(chunks);
        fileName = part.filename || fileName;
      } else if (part.type === 'field') {
        if (part.fieldname === 'docId') docId = part.value;
        if (part.fieldname === 'title') title = part.value;
        if (part.fieldname === 'reason') reason = part.value;
        if (part.fieldname === 'ownerId' || part.fieldname === 'studentId') studentId = part.value;
        if (part.fieldname === 'studentEmail') studentEmail = part.value;
        if (part.fieldname === 'studentName') studentName = part.value;
        if (part.fieldname === 'kind') kind = part.value;
        if (part.fieldname === 'studentRef') studentRef = part.value;
      }
    }
    if (!fileBuffer) throw new AppError('BAD_REQUEST', 'pdf file is required', 400);

    const metaForIssue: Record<string, any> = {};
    if (kind) metaForIssue.kind = kind;
    if (studentRef) metaForIssue.studentRef = studentRef;
    if (!metaForIssue.kind) metaForIssue.kind = 'certificate';
    if (!metaForIssue.studentRef) metaForIssue.studentRef = studentId || studentEmail || 'unknown';
    if (studentId) metaForIssue.studentId = studentId;
    if (studentEmail) metaForIssue.studentEmail = studentEmail;
    if (studentName) metaForIssue.studentName = studentName;

    const cert = await service.uploadCertificate({
      issuerUserId: (req.user as any).sub,
      meta: metaForIssue,
      fileBuffer,
      originalName: fileName,
      title,
      docId,
      reason,
      studentId,
      studentEmail,
      studentName
    });
    const issuerUser = await prisma.user.findUnique({ where: { id: (req.user as any).sub } });
    await emailService.notifyIssueSuccess({
      docId: cert?.id || docId || 'unknown-doc',
      title: cert?.title,
      issuedAt: cert?.issuedAtUnix || Math.floor(Date.now() / 1000),
      issuerEmail: issuerUser?.email,
      sha256Hex: cert?.sha256Hex || cert?.hash || '',
      txHash: cert?.txHash || undefined,
      explorerUrl: cert?.explorerUrl || undefined
    });

    return {
      docId: cert?.id,
      title: cert?.title,
      issuedAt: cert?.issuedAtUnix,
      sha256Hex: cert?.sha256Hex,
      status: cert?.status,
      issuerAddress: cert?.issuerAddress,
      signatureHex: cert?.signatureHex,
      txHash: cert?.txHash,
      blockNumber: cert?.blockNumber,
      chain: cert?.chain,
      explorerUrl: cert?.explorerUrl,
      downloadUrl: cert?.r2Key,
      downloadPath: `/api/admin/certificates/${cert?.id}/download`
    };
  });

  // Admin: download the finalized (stamped + hashed) PDF
  app.get('/certificates/:docId/download', {
    preHandler: [app.authenticate, requireRole(['ADMIN'])]
  }, async (req, reply) => {
    const docId = (req.params as any).docId as string;
    const cert = await prisma.certificate.findUnique({ where: { id: docId } });
    if (!cert) return app.httpErrors.notFound('CERT_NOT_FOUND');
    const bytes = await storage.download(cert.fileUrl);
    reply.header('content-type', 'application/pdf');
    reply.header('content-disposition', `attachment; filename="${(cert.title || 'certificate')}.pdf"`);
    return reply.send(bytes);
  });
}
