import { FastifyInstance } from 'fastify';
import { requireRole } from '../infra/auth/auth';
import { AuditService } from '../services/auditService';
import { prisma } from '../infra/db/prismaClient';

export async function registerAuditRoutes(app: FastifyInstance) {
  const service = new AuditService(prisma);
  app.get('/audit', {
    preHandler: [app.authenticate, requireRole(['ADMIN', 'VERIFIER'])],
    schema: {
      querystring: {
        type: 'object',
        properties: { limit: { type: 'number' }, offset: { type: 'number' } }
      }
    }
  }, async (req) => {
    const q: any = req.query || {};
    const lim = Math.min(Number(q.limit || 20), 100);
    const off = Number(q.offset || 0);
    const items = await service.listForUser((req.user as any).sub, lim, off);
    return { items };
  });
}

