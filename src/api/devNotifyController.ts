import { FastifyInstance } from 'fastify';
import { requireRole } from '../infra/auth/auth';
import { sendEmail } from '../notifications/email';
import { isEmailConfigured, config } from '../config/secrets';

export async function registerDevNotifyRoutes(app: FastifyInstance) {
  if ((process.env.NODE_ENV || 'development') === 'production') return;
  app.post('/notify/test', { preHandler: [app.authenticate, requireRole(['ADMIN'])] }, async (req) => {
    const body: any = req.body || {};
    const to = body.to;
    if (!to) return app.httpErrors.badRequest('to required');
    if (!isEmailConfigured()) {
      return { ok: false, message: 'Email not configured' };
    }
    const subject = typeof body.subject === 'string' ? body.subject : '[DEV] BharatVerify Email Test';
    const text = typeof body.text === 'string' ? body.text : 'Hello from BharatVerify dev email test.';
    const html = typeof body.html === 'string' ? body.html : undefined;
    await sendEmail({
      to,
      subject,
      text,
      html,
      fromName: config.email.fromName || config.email.appName,
      fromAddress: config.email.fromAddress || undefined
    });
    return { ok: true };
  });
}
