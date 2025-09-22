import { FastifyInstance } from 'fastify';
import { LoginSchema } from '../utils/validation';
import { verifyCredentials } from '../infra/auth/auth';
import { AppError, ErrorCodes } from '../utils/errors';

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post('/login', {
    schema: {
      body: { type: 'object', properties: { email: { type: 'string' }, password: { type: 'string' } }, required: ['email', 'password'] },
      response: {
        200: {
          type: 'object',
          properties: {
            token: { type: 'string' },
            role: { type: 'string' },
            studentId: { type: 'string' }
          }
        }
      }
    }
  }, async (req, reply) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(ErrorCodes.AUTH_INVALID, 'Invalid credentials', 401);
    const principal = await verifyCredentials(parsed.data.email, parsed.data.password);
    if (!principal) throw new AppError(ErrorCodes.AUTH_INVALID, 'Invalid credentials', 401);

    const payload: Record<string, unknown> = { sub: principal.id, role: principal.role };
    if (principal.issuerId) payload.issuerId = principal.issuerId;
    if (principal.verifierOrgId) payload.verifierOrgId = principal.verifierOrgId;
    if (principal.studentId) payload.studentId = principal.studentId;

    const token = await reply.jwtSign(payload);
    return { token, role: principal.role, studentId: principal.studentId };
  });
}
