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
    preHandler: [app.authenticate, requireRole(['VERIFIER'])],
    schema: {
      body: { type: 'object', properties: { docId: { type: 'string' } }, required: ['docId'] },
      response: { 200: { type: 'object', properties: { status: { type: 'string' }, reasons: { type: 'array', items: { type: 'string' } } } } }
    }
  }, async (req) => {
    const parsed = VerifySchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(ErrorCodes.CERT_NOT_FOUND, 'Invalid docId', 400);
    const result = await service.verify({ verifierUserId: (req.user as any).sub, docId: parsed.data.docId });
    return result;
  });
}
