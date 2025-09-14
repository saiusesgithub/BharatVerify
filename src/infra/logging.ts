// Basic logging wrapper (Fastify provides pino logger by default)
export function logInfo(msg: string, meta?: unknown) {
  if (meta) console.log(msg, meta);
  else console.log(msg);
}

