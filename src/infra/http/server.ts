import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import multipart from '@fastify/multipart';
import cors from '@fastify/cors';
import { authPlugin } from '../auth/auth';
import { registerAuthRoutes } from '../../api/authController';
import { registerCertificateRoutes } from '../../api/certificateController';
import { registerVerificationRoutes } from '../../api/verificationController';
import { registerAuditRoutes } from '../../api/auditController';
import { registerCertQueryRoutes } from '../../api/certQueryController';
import { registerStudentRoutes } from '../../api/studentController';
import { registerDevNotifyRoutes } from '../../api/devNotifyController';
import { AppError } from '../../utils/errors';

export function buildServer() {
  const app = Fastify({ logger: true });

  app.register(swagger, {
    openapi: {
      info: { title: 'Blockchain Certificates API', version: '0.1.0' }
    }
  });
  app.register(swaggerUI, { routePrefix: '/docs' });

  // CORS for frontend (dev default allows all origins)
  app.register(cors, {
    origin: (origin, cb) => cb(null, true),
    credentials: true
  });

  app.register(multipart);
  app.register(authPlugin);

  app.get('/health', async () => ({ status: 'ok' }));

  app.register(async (r) => registerAuthRoutes(r), { prefix: '/api/auth' });
  app.register(async (r) => registerCertificateRoutes(r), { prefix: '/api/admin' });
  app.register(async (r) => registerVerificationRoutes(r), { prefix: '/api/verifications' });
  app.register(async (r) => registerAuditRoutes(r), { prefix: '/api' });
  app.register(async (r) => registerCertQueryRoutes(r), { prefix: '/api' });
  app.register(async (r) => registerStudentRoutes(r), { prefix: '/api/student' });
  if ((process.env.NODE_ENV || 'development') !== 'production') {
    app.register(async (r) => registerDevNotifyRoutes(r), { prefix: '/api/dev' });
  }

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof AppError) {
      reply.status(err.statusCode).send({ error: err.code, message: err.message });
      return;
    }
    app.log.error(err);
    reply.status(500).send({ error: 'INTERNAL', message: 'Unexpected error' });
  });

  return app;
}


