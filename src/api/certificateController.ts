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
}
