import { FastifyInstance } from 'fastify';
import { requireRole } from '../infra/auth/auth';
import { CertificateService } from '../services/certificateService';
import { prisma } from '../infra/db/prismaClient';
import { getCloudStorageAdapter } from '../adapters/cloudStorageAdapter';
import { createMockBlockchainAdapter } from '../adapters/blockchainAdapter';
import { UploadMetaSchema } from '../utils/validation';
import { AppError, ErrorCodes } from '../utils/errors';

export async function registerCertificateRoutes(app: FastifyInstance) {
  const storage = getCloudStorageAdapter();
  const chain = createMockBlockchainAdapter(prisma);
  const service = new CertificateService(prisma, storage, chain);

  app.post('/certificates/upload', {
    preHandler: [app.authenticate, requireRole(['ADMIN'])],
    schema: {
      consumes: ['multipart/form-data'],
      response: { 200: { type: 'object', properties: { id: { type: 'string' }, hash: { type: 'string' } } } }
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
      originalName: fileName
    });
    return { id: cert.id, hash: cert.hash, signature: cert.signature };
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
    let ownerId: string | undefined;
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
        if (part.fieldname === 'ownerId') ownerId = part.value;
      }
    }
    if (!fileBuffer) throw new AppError('BAD_REQUEST', 'pdf file is required', 400);
    const cert = await service.uploadCertificate({
      issuerUserId: (req.user as any).sub,
      meta: { ownerId },
      fileBuffer,
      originalName: fileName,
      title,
      docId,
      reason
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
      downloadUrl: cert?.r2Key
    };
  });
}
