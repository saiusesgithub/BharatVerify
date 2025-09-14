import 'dotenv/config';
import { buildServer } from './infra/http/server';
import fs from 'fs';
import path from 'path';
import { validateConfigAtStartup } from './config/secrets';

async function main() {
  const storageDir = process.env.STORAGE_DIR || path.join(process.cwd(), 'data', 'files');
  if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });

  const app = buildServer();
  validateConfigAtStartup();
  const port = Number(process.env.PORT) || 3000;
  await app.ready();
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Server listening on http://localhost:${port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
