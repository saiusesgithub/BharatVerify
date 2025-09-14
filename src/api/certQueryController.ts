import { FastifyInstance } from 'fastify';
import { prisma } from '../infra/db/prismaClient';
import { requireRole } from '../infra/auth/auth';

export async function registerCertQueryRoutes(app: FastifyInstance) {
  app.get('/certs/:docId', { preHandler: [app.authenticate, requireRole(['ADMIN', 'VERIFIER'])] }, async (req) => {
    const docId = (req.params as any).docId as string;
    const cert = await prisma.certificate.findUnique({ where: { id: docId } });
    if (!cert) return app.httpErrors.notFound('CERT_NOT_FOUND');
    return {
      docId: cert.id,
      title: cert.title,
      issuedAt: cert.issuedAtUnix,
      sha256Hex: cert.sha256Hex || cert.hash,
      status: cert.status,
      issuerAddress: cert.issuerAddress,
      signatureHex: cert.signatureHex,
      txHash: cert.txHash,
      blockNumber: cert.blockNumber,
      chain: cert.chain,
      explorerUrl: cert.explorerUrl,
      downloadUrl: cert.r2Key
    };
  });

  app.get('/certs/:docId/verifications', { preHandler: [app.authenticate, requireRole(['ADMIN', 'VERIFIER'])] }, async (req) => {
    const docId = (req.params as any).docId as string;
    const cert = await prisma.certificate.findUnique({ where: { id: docId } });
    if (!cert) return app.httpErrors.notFound('CERT_NOT_FOUND');
    const events = await prisma.verificationEvent.findMany({ where: { certificateId: docId }, orderBy: { createdAt: 'desc' }, take: 100 });
    return { items: events };
  });

  app.post('/certs/revoke', { preHandler: [app.authenticate, requireRole(['ADMIN'])] }, async (req) => {
    const body: any = req.body || {};
    const { docId, reason } = body;
    if (!docId) return app.httpErrors.badRequest('docId required');
    await prisma.certificate.update({ where: { id: docId }, data: { status: 'revoked', reason: reason || 'revoked' } });
    await prisma.verificationEvent.create({ data: { certificateId: docId, by: (req.user as any).sub, result: 'revoked', hashMatch: false, issuerVerified: false, mlSummary: null, details: JSON.stringify({ reason }), atUnix: Math.floor(Date.now()/1000) } });
    return { ok: true };
  });
}

