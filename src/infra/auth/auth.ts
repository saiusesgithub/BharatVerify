import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../db/prismaClient';
import { AppError, ErrorCodes } from '../../utils/errors';
import bcrypt from 'bcryptjs';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      sub: string;
      role: 'ADMIN' | 'VERIFIER' | 'STUDENT';
      issuerId?: string;
      verifierOrgId?: string;
      studentId?: string;
    };
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export type AuthenticatedPrincipal = {
  id: string;
  role: 'ADMIN' | 'VERIFIER' | 'STUDENT';
  issuerId?: string;
  verifierOrgId?: string;
  studentId?: string;
};

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

export function requireRole(roles: Array<'ADMIN' | 'VERIFIER' | 'STUDENT'>) {
  return async function (request: FastifyRequest) {
    if (!request.user || !roles.includes(request.user.role)) {
      throw new AppError(ErrorCodes.FORBIDDEN, 'Forbidden', 403);
    }
  };
}

export async function verifyCredentials(email: string, password: string): Promise<AuthenticatedPrincipal | null> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (user && bcrypt.compareSync(password, user.passwordHash)) {
    return {
      id: user.id,
      role: user.role as 'ADMIN' | 'VERIFIER',
      issuerId: user.issuerId || undefined,
      verifierOrgId: user.verifierOrgId || undefined
    };
  }

  const student = await prisma.student.findUnique({ where: { email } });
  if (student && bcrypt.compareSync(password, student.passwordHash)) {
    return {
      id: student.id,
      role: 'STUDENT',
      studentId: student.id
    };
  }

  return null;
}
