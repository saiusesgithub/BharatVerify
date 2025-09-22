import { FastifyInstance } from 'fastify';
import { requireRole } from '../infra/auth/auth';
import { prisma } from '../infra/db/prismaClient';
import { getCloudStorageAdapter } from '../adapters/cloudStorageAdapter';
import { StudentCertificateService } from '../services/studentCertificateService';
import { AppError, ErrorCodes } from '../utils/errors';

function resolveStudentId(req: any): string {
  const user = req.user as { studentId?: string; sub?: string } | undefined;
  const studentId = user?.studentId || user?.sub;
  if (!studentId) throw new AppError(ErrorCodes.AUTH_INVALID, 'Missing student context', 401);
  return studentId;
}

export async function registerStudentRoutes(app: FastifyInstance) {
  const storage = getCloudStorageAdapter();
  const service = new StudentCertificateService(prisma, storage);

  app.get('/certificates', {
    preHandler: [app.authenticate, requireRole(['STUDENT'])]
  }, async (req) => {
    const studentId = resolveStudentId(req);
    const items = await service.listCertificates(studentId);
    return { items };
  });

  app.get('/certificates/:docId', {
    preHandler: [app.authenticate, requireRole(['STUDENT'])]
  }, async (req) => {
    const studentId = resolveStudentId(req);
    const docId = (req.params as any).docId as string;
    return await service.getCertificate(studentId, docId);
  });

  app.get('/certificates/:docId/download', {
    preHandler: [app.authenticate, requireRole(['STUDENT'])]
  }, async (req, reply) => {
    const studentId = resolveStudentId(req);
    const docId = (req.params as any).docId as string;
    const { bytes, cert } = await service.download(studentId, docId);
    reply.header('content-type', 'application/pdf');
    reply.header('content-disposition', `attachment; filename="${(cert.title || 'certificate')}.pdf"`);
    return reply.send(bytes);
  });

  app.post('/certificates/:docId/verify', {
    preHandler: [app.authenticate, requireRole(['STUDENT'])]
  }, async (req) => {
    const studentId = resolveStudentId(req);
    const docId = (req.params as any).docId as string;
    return await service.verify(studentId, docId);
  });
}
