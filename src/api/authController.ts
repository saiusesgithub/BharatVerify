import { FastifyInstance } from 'fastify';
import { LoginSchema } from '../utils/validation';
import { verifyCredentials } from '../infra/auth/auth';
import { AppError, ErrorCodes } from '../utils/errors';

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post('/login', {
    schema: {
      body: { type: 'object', properties: { email: { type: 'string' }, password: { type: 'string' } }, required: ['email', 'password'] },
      response: { 200: { type: 'object', properties: { token: { type: 'string' } } } }
    }
  }, async (req, reply) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(ErrorCodes.AUTH_INVALID, 'Invalid credentials', 401);
    const user = await verifyCredentials(parsed.data.email, parsed.data.password);
    if (!user) throw new AppError(ErrorCodes.AUTH_INVALID, 'Invalid credentials', 401);
    const token = await reply.jwtSign({ sub: user.id, role: user.role, issuerId: user.issuerId, verifierOrgId: user.verifierOrgId });
    return { token };
  });
}

