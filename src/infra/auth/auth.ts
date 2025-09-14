import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../db/prismaClient';
import { AppError, ErrorCodes } from '../../utils/errors';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      sub: string;
      role: 'ADMIN' | 'VERIFIER';
      issuerId?: string;
      verifierOrgId?: string;
    };
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export const authPlugin = fp(async function (app: FastifyInstance) {
  app.register(fastifyJwt, { secret: process.env.JWT_SECRET || 'dev_secret' });

  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const payload = await request.jwtVerify();
      request.user = payload as any;
    } catch {
      throw new AppError(ErrorCodes.AUTH_INVALID, 'Invalid token', 401);
    }
  });
});

export function requireRole(roles: Array<'ADMIN' | 'VERIFIER'>) {
  return async function (request: FastifyRequest) {
    if (!request.user || !roles.includes(request.user.role)) {
      throw new AppError(ErrorCodes.FORBIDDEN, 'Forbidden', 403);
    }
  };
}

export async function verifyCredentials(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return null;
  const bcrypt = await import('bcryptjs');
  const ok = bcrypt.compareSync(password, user.passwordHash);
  if (!ok) return null;
  return user;
}
