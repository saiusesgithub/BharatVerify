import { FastifyInstance } from 'fastify';
import { requireRole } from '../infra/auth/auth';
import { VerificationService } from '../services/verificationService';
import { prisma } from '../infra/db/prismaClient';
import { getCloudStorageAdapter } from '../adapters/cloudStorageAdapter';
import { createMockBlockchainAdapter } from '../adapters/blockchainAdapter';
import { createKeyRegistry } from '../adapters/keyRegistry';
import { VerifySchema } from '../utils/validation';
import { AppError, ErrorCodes } from '../utils/errors';

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
    const result = await service.verify({ verifierUserId: (req.user as any).sub, docId, fileBuffer, sha256Hex });
    return result;
  });
}
